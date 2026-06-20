// Ephemeral multiplayer presence client. Streams this explorer's camera
// position to the api-server and tracks the lightweight snapshot of everyone
// else so the scene can render their "wisps" and a live headcount. Nothing is
// stored; the connection is anonymous and disappears the moment you leave.

export type Peer = {
  id: string;
  color: string;
  x: number;
  y: number;
  z: number;
  m: 0 | 1; // 0 = orbit view, 1 = fly
};

type Listener = () => void;

class PresenceClient {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private selfId: string | null = null;
  private shouldRun = false;
  private reconnectDelay = 1000;
  private reconnectTimer: number | null = null;
  private lastSendAt = 0;

  /** Live peer poses (excluding self). Read imperatively from the render loop. */
  peers = new Map<string, Peer>();
  /** Stable array of peer ids; reference changes only when the set changes. */
  private peerIds: string[] = [];
  private count = 0;

  private readonly listeners = new Set<Listener>();

  constructor() {
    const proto =
      typeof location !== "undefined" && location.protocol === "https:"
        ? "wss"
        : "ws";
    const host = typeof location !== "undefined" ? location.host : "localhost";
    this.url = `${proto}://${host}/api/presence`;
  }

  start(): void {
    if (this.shouldRun) return;
    this.shouldRun = true;
    this.connect();
  }

  stop(): void {
    this.shouldRun = false;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.close();
      this.ws = null;
    }
    this.selfId = null;
    this.resetPeers();
  }

  private connect(): void {
    if (!this.shouldRun) return;
    // Guard against duplicate sockets if a stale reconnect fires while one is
    // already connecting/open.
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)
    ) {
      return;
    }
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
    };
    this.ws.onmessage = (ev) => this.onMessage(ev);
    this.ws.onerror = () => this.ws?.close();
    this.ws.onclose = () => {
      this.selfId = null;
      this.resetPeers();
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (!this.shouldRun || this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.8, 15000);
  }

  private resetPeers(): void {
    if (this.peers.size > 0) this.peers = new Map();
    let changed = this.peerIds.length > 0;
    if (changed) this.peerIds = [];
    if (this.count !== 0) {
      this.count = 0;
      changed = true;
    }
    if (changed) this.emit();
  }

  private onMessage(ev: MessageEvent): void {
    let msg: {
      t?: string;
      id?: string;
      count?: number;
      peers?: Array<{ id: string; c: string; p: [number, number, number]; m: 0 | 1 }>;
    };
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }

    if (msg.t === "welcome") {
      this.selfId = msg.id ?? null;
      return;
    }
    if (msg.t !== "state" || !Array.isArray(msg.peers)) return;

    const next = new Map<string, Peer>();
    for (const p of msg.peers) {
      if (!p || p.id === this.selfId) continue;
      next.set(p.id, { id: p.id, color: p.c, x: p.p[0], y: p.p[1], z: p.p[2], m: p.m });
    }
    this.peers = next;

    const nextIds = Array.from(next.keys());
    const idsChanged =
      nextIds.length !== this.peerIds.length ||
      nextIds.some((id, i) => id !== this.peerIds[i]);
    if (idsChanged) this.peerIds = nextIds;

    const countChanged = msg.count !== this.count;
    if (countChanged && typeof msg.count === "number") this.count = msg.count;

    if (idsChanged || countChanged) this.emit();
  }

  /** Throttled (~10 Hz) outbound pose update; coords are galaxy-local space. */
  sendPose(x: number, y: number, z: number, m: 0 | 1): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    if (now - this.lastSendAt < 90) return;
    this.lastSendAt = now;
    try {
      this.ws.send(
        JSON.stringify({ t: "pose", p: [Math.round(x), Math.round(y), Math.round(z)], m }),
      );
    } catch {
      // best-effort
    }
  }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getCount = (): number => this.count;
  getPeerIds = (): string[] => this.peerIds;

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

export const presence = new PresenceClient();
