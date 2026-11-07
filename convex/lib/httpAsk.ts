import { featureEnabled } from "./features";
import { isAllowedOrigin } from "./billingConfig";
import { askOrigins } from "./askConfig";
import { MAX_ASK_BODY, parseAskBody } from "./askRequest";
import { StreamSplitter, chatMessages, type AskEvent } from "./askPrompt";
import { classifyGatewayError, type GatewayStatus } from "./aiGateway";
import type { BudgetDenial } from "./rateLimit";

/**
 * HTTP edge for Ask Cosmo (POST /ask/chat on the deployment's .convex.site).
 * An HTTP action rather than a websocket action for the same reason as
 * billing: only an HTTP action sees the Origin header, and it can stream the
 * answer back as Server-Sent Events. Order of checks, all failing closed:
 *
 *   release flag (ask-cosmo) -> allowlisted Origin -> bounded body
 *   -> bounded, rebuilt request -> visitor key from the Convex edge's client IP
 *   -> per-minute / daily per-visitor / global daily budget (askInternal.take,
 *      a serializable mutation over `rateCounters`) -> gateway call.
 *
 * Ask Cosmo is open to anonymous visitors, as it was on Express; no identity
 * is read or required, so there is nothing to bypass. The scientist comes from
 * the request's galaxy summary, never from code.
 */

type Env = Record<string, string | undefined>;

export interface AskHttpDeps {
  env: Env;
  /** Client IP from the Convex edge (ctx.meta.getRequestMetadata), or null. */
  clientIp(): Promise<string | null>;
  /** Reserve one call; runs the budget mutation. */
  take(args: { clientKey: string }): Promise<{ ok: true } | { ok: false; reason: BudgetDenial }>;
  /** Start the gateway completion; resolves once the upstream stream is open. */
  complete(
    messages: ReturnType<typeof chatMessages>,
    signal: AbortSignal,
  ): Promise<AsyncIterable<string>>;
  /** GET /health only. */
  gateway?(): Promise<GatewayStatus>;
}

const UNAVAILABLE = "The assistant is unavailable right now.";

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

export function askCorsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

async function readBounded(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > max) return null;
  const text = await request.text();
  return text.length > max ? null : text;
}

/**
 * Rate-limit key for a visitor: a SHA-256 of the edge-reported IP, so raw
 * addresses are never written to the counters table. Null fails closed.
 */
export async function visitorKey(ip: string | null): Promise<string | null> {
  const trimmed = ip?.trim() ?? "";
  if (!trimmed || trimmed.length > 256) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`cosmograph-ask:${trimmed}`),
  );
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `ip:${hex.slice(0, 32)}`;
}

/** CORS preflight for POST /ask/chat. */
export function handleAskPreflight(request: Request, env: Env): Response {
  if (!featureEnabled("ask-cosmo", env)) return new Response(null, { status: 404 });
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin, askOrigins(env))) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: askCorsHeaders(origin) });
}

/** POST /ask/chat -> text/event-stream of AskEvent frames. */
export async function handleAsk(request: Request, deps: AskHttpDeps): Promise<Response> {
  if (!featureEnabled("ask-cosmo", deps.env)) return json(404, { error: "Not found" });
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin, askOrigins(deps.env))) {
    return json(403, { code: "FORBIDDEN_ORIGIN", error: "Forbidden" });
  }
  const cors = askCorsHeaders(origin);

  const text = await readBounded(request, MAX_ASK_BODY);
  if (text === null) {
    return json(413, { code: "TOO_LARGE", error: "This conversation is too long — start a new one." }, cors);
  }
  const parsed = parseAskBody(text);
  if (!parsed.ok) return json(400, { code: "INVALID_REQUEST", error: parsed.error }, cors);

  const clientKey = await visitorKey(await deps.clientIp());
  if (!clientKey) {
    console.error("ask: no client address from the Convex edge; refusing (fail closed)");
    return json(503, { code: "ASK_UNAVAILABLE", error: UNAVAILABLE }, cors);
  }

  // Reserve the budget only for a fully valid request, right before the paid
  // call. A storage error throws and denies.
  let budget: Awaited<ReturnType<AskHttpDeps["take"]>>;
  try {
    budget = await deps.take({ clientKey });
  } catch {
    console.error("ask: budget check failed; refusing (fail closed)");
    return json(503, { code: "ASK_UNAVAILABLE", error: UNAVAILABLE }, cors);
  }
  if (!budget.ok) {
    if (budget.reason === "GLOBAL_CUTOFF") {
      console.warn("ask: global daily budget exhausted");
      return json(503, { code: budget.reason, error: "Cosmo is resting for today. Try again tomorrow." }, cors);
    }
    if (budget.reason === "DAILY_LIMIT") {
      return json(429, { code: budget.reason, error: "You've asked a lot today. Cosmo will be back tomorrow." }, cors);
    }
    return json(429, { code: budget.reason, error: "Too many questions — please slow down and try again shortly." }, cors);
  }

  // Open the upstream stream before answering 200, so a gateway that can't
  // be used (free plan, spending limit) is a clean 503 rather than a broken
  // stream. Only a reason code is logged, never the error text.
  const abort = new AbortController();
  let deltas: AsyncIterable<string>;
  try {
    deltas = await deps.complete(chatMessages(parsed.request), abort.signal);
  } catch (err) {
    console.error(`ask: gateway call failed (${classifyGatewayError(err)})`);
    return json(503, { code: "ASK_UNAVAILABLE", error: UNAVAILABLE }, cors);
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AskEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      const splitter = new StreamSplitter(send);
      try {
        for await (const delta of deltas) splitter.push(delta);
        splitter.end();
        send({ type: "done" });
      } catch {
        if (!abort.signal.aborted) {
          console.error("ask: streaming completion failed");
          send({ type: "error", error: UNAVAILABLE });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // already closed by a cancelled reader
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * GET /health: whether Ask Cosmo can run on this deployment. Booleans and
 * reason codes only; minting a token here costs no inference and the token
 * never leaves the gateway helper.
 */
export async function handleHealth(deps: Pick<AskHttpDeps, "env" | "gateway">): Promise<Response> {
  const released = featureEnabled("ask-cosmo", deps.env);
  const gateway: GatewayStatus = deps.gateway
    ? await deps.gateway()
    : { ready: false, source: "convex-ai-gateway", reason: "gateway-error" };
  return json(200, {
    status: "ok",
    integrations: {
      askCosmo: { ...gateway, released },
    },
  });
}
