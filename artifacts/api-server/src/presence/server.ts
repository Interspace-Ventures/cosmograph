import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { logger } from "../lib/logger";

// Lightweight, ephemeral multiplayer presence: clients stream their camera
// position; the server fans out a shared snapshot on a fixed tick so everyone
// can see faint "wisps" of other explorers and a live headcount. No data is
// ever persisted. Every limit below exists to keep a single always-on Node
// process safe from connection floods and abusive clients.

const PRESENCE_PATH = "/api/presence";

// --- Abuse / DDoS guards -----------------------------------------------------
const MAX_CLIENTS = 300; // total concurrent sockets the process will hold
const MAX_PER_IP = 4; // concurrent sockets from one IP
const MAX_MSG_BYTES = 256; // ws drops frames larger than this (maxPayload)
const MSG_BURST = 40; // token bucket capacity per socket
const MSG_REFILL_PER_SEC = 20; // sustained inbound message budget per socket
const HANDSHAKE_WINDOW_MS = 10_000;
const HANDSHAKE_PER_WINDOW = 15; // new connections per IP per window
const ABUSE_STRIKES = 30; // dropped messages before we close a socket

// --- Simulation / fan-out ----------------------------------------------------
const TICK_MS = 100; // 10 Hz snapshot broadcast
const HEARTBEAT_MS = 30_000;
const STALE_MS = 20_000; // peers silent longer than this are not rendered
const MAX_RENDER_PEERS = 60; // cap snapshot size regardless of headcount
const WORLD_BOUND = 60_000; // clamp incoming coordinates to the scene radius

const PALETTE = [
  "#8ab4ff",
  "#ffd479",
  "#ff8fab",
  "#7ce0c3",
  "#c89bff",
  "#ff9f6e",
  "#6ee7ff",
  "#f5f17a",
];

type Client = {
  id: string;
  ip: string;
  ws: WebSocket;
  color: string;
  x: number;
  y: number;
  z: number;
  m: 0 | 1; // 0 = orbit/god, 1 = fly
  hasPose: boolean;
  isAlive: boolean;
  tokens: number;
  lastRefill: number;
  lastPose: number;
  strikes: number;
};

const clients = new Map<string, Client>();
const perIp = new Map<string, number>();
const handshakes = new Map<string, number[]>();

function clientIp(req: IncomingMessage): string {
  // Mirror Express `trust proxy = 1`: the immediate peer is our trusted Replit
  // proxy, which appends the real client IP as the LAST X-Forwarded-For entry.
  // Taking the last (not first) entry prevents a client from spoofing its IP by
  // sending its own X-Forwarded-For header to bypass per-IP caps.
  const fwd = req.headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd.join(",") : fwd;
  const parts = raw
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts && parts.length > 0) return parts[parts.length - 1]!;
  return req.socket.remoteAddress || "unknown";
}

function handshakeAllowed(ip: string): boolean {
  const now = Date.now();
  const arr = (handshakes.get(ip) ?? []).filter((t) => now - t < HANDSHAKE_WINDOW_MS);
  if (arr.length >= HANDSHAKE_PER_WINDOW) {
    handshakes.set(ip, arr);
    return false;
  }
  arr.push(now);
  handshakes.set(ip, arr);
  return true;
}

function rejectUpgrade(socket: Duplex, code: number, reason: string): void {
  try {
    socket.write(`HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\n\r\n`);
  } catch {
    // socket may already be gone
  }
  socket.destroy();
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, n));
}

function removeClient(c: Client): void {
  if (!clients.has(c.id)) return;
  clients.delete(c.id);
  const n = (perIp.get(c.ip) ?? 1) - 1;
  if (n <= 0) perIp.delete(c.ip);
  else perIp.set(c.ip, n);
}

export function attachPresence(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG_BYTES });

  server.on("upgrade", (req, socket, head) => {
    const path = req.url?.split("?")[0];
    if (path !== PRESENCE_PATH) {
      // Not ours — close cleanly so the socket does not hang.
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }
    const ip = clientIp(req);
    if (clients.size >= MAX_CLIENTS) return rejectUpgrade(socket, 503, "Busy");
    if ((perIp.get(ip) ?? 0) >= MAX_PER_IP) return rejectUpgrade(socket, 429, "Too Many");
    if (!handshakeAllowed(ip)) return rejectUpgrade(socket, 429, "Slow Down");

    wss.handleUpgrade(req, socket, head, (ws) => {
      const id = randomUUID().slice(0, 8);
      const color = PALETTE[Math.floor(Math.random() * PALETTE.length)]!;
      const client: Client = {
        id,
        ip,
        ws,
        color,
        x: 0,
        y: 0,
        z: 0,
        m: 0,
        hasPose: false,
        isAlive: true,
        tokens: MSG_BURST,
        lastRefill: Date.now(),
        lastPose: 0,
        strikes: 0,
      };
      clients.set(id, client);
      perIp.set(ip, (perIp.get(ip) ?? 0) + 1);

      ws.send(JSON.stringify({ t: "welcome", id, color }));

      ws.on("pong", () => {
        client.isAlive = true;
      });

      ws.on("message", (data, isBinary) => {
        if (isBinary) return;
        // Token-bucket rate limit: drop excess, close persistent abusers.
        const now = Date.now();
        const refill = ((now - client.lastRefill) / 1000) * MSG_REFILL_PER_SEC;
        if (refill > 0) {
          client.tokens = Math.min(MSG_BURST, client.tokens + refill);
          client.lastRefill = now;
        }
        if (client.tokens < 1) {
          if (++client.strikes > ABUSE_STRIKES) ws.close(1008, "rate");
          return;
        }
        client.tokens -= 1;

        let msg: unknown;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (
          !msg ||
          typeof msg !== "object" ||
          (msg as { t?: unknown }).t !== "pose"
        )
          return;
        const p = (msg as { p?: unknown }).p;
        if (!Array.isArray(p) || p.length !== 3) return;
        const [x, y, z] = p;
        if (
          typeof x !== "number" ||
          typeof y !== "number" ||
          typeof z !== "number" ||
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(z)
        )
          return;
        client.x = clamp(x);
        client.y = clamp(y);
        client.z = clamp(z);
        client.m = (msg as { m?: unknown }).m === 1 ? 1 : 0;
        client.hasPose = true;
        client.lastPose = now;
      });

      ws.on("close", () => removeClient(client));
      ws.on("error", () => {
        try {
          ws.terminate();
        } catch {
          // ignore
        }
        removeClient(client);
      });
    });
  });

  const tick = setInterval(() => {
    if (clients.size === 0) return;
    const now = Date.now();
    const peers: Array<{ id: string; c: string; p: [number, number, number]; m: 0 | 1 }> = [];
    for (const c of clients.values()) {
      if (!c.hasPose || now - c.lastPose > STALE_MS) continue;
      if (peers.length >= MAX_RENDER_PEERS) break;
      peers.push({ id: c.id, c: c.color, p: [c.x, c.y, c.z], m: c.m });
    }
    const payload = JSON.stringify({ t: "state", count: clients.size, peers });
    for (const c of clients.values()) {
      if (c.ws.readyState === WebSocket.OPEN) {
        try {
          c.ws.send(payload);
        } catch {
          // best-effort
        }
      }
    }
  }, TICK_MS);

  const heartbeat = setInterval(() => {
    for (const c of clients.values()) {
      if (!c.isAlive) {
        try {
          c.ws.terminate();
        } catch {
          // ignore
        }
        removeClient(c);
        continue;
      }
      c.isAlive = false;
      try {
        c.ws.ping();
      } catch {
        // ignore
      }
    }
    // Prune the handshake-rate map so it can't grow unbounded across many
    // distinct source IPs — drop IPs with no timestamps left in the window.
    const now = Date.now();
    for (const [ip, arr] of handshakes) {
      const live = arr.filter((t) => now - t < HANDSHAKE_WINDOW_MS);
      if (live.length === 0) handshakes.delete(ip);
      else if (live.length !== arr.length) handshakes.set(ip, live);
    }
  }, HEARTBEAT_MS);

  // Don't let the timers keep the event loop alive on shutdown.
  tick.unref?.();
  heartbeat.unref?.();

  wss.on("error", (err) => logger.error({ err }, "presence wss error"));
  logger.info({ path: PRESENCE_PATH }, "presence websocket attached");
}
