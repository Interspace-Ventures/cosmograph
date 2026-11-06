import OpenAI from "openai";
import { getServiceToken } from "convex/server";
import { ASK_MODEL, type AskEvent } from "./askPrompt";

/**
 * Ask Cosmo's model calls go through the Convex AI Gateway
 * (https://docs.convex.dev/ai-gateway/overview). Convex holds the provider
 * credentials; this deployment authenticates each request with a short-lived
 * token from `getServiceToken("ai-gateway")` (convex >= 1.45), which the
 * action runtime caches and refreshes. Cosmograph holds no model key: not in
 * env, not in a vault, not in code.
 *
 * The token is minted per request through the SDK's apiKey callback, never
 * logged, returned, stored or cached here (the docs' rules). Inference is
 * billed to the Convex team as an AI Gateway line item, and the gateway is
 * only available to teams on a paid plan: on the free plan minting fails with
 * AiGatewayDisabled, which /health reports as `gateway-disabled`.
 */

export const GATEWAY_BASE_URL = "https://ai-gateway.convex.dev/v1";

/** Mints a gateway credential. Injectable for tests. */
export type TokenMinter = () => Promise<string>;

export const mintGatewayToken: TokenMinter = () => getServiceToken("ai-gateway");

/** The fetch the SDK uses. Injectable so tests never reach the network. */
export type GatewayFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function gatewayClient(
  mint: TokenMinter = mintGatewayToken,
  fetchImpl?: GatewayFetch,
): OpenAI {
  return new OpenAI({
    baseURL: GATEWAY_BASE_URL,
    apiKey: mint,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
    // One retry for a dropped connection or an upstream 5xx; more would
    // multiply the worst-case cost of a turn.
    maxRetries: 1,
    timeout: 60_000,
  });
}

/**
 * Stream one Ask turn's text deltas. Same request shape the Express route
 * sent to OpenAI, with the gateway's provider preferences:
 * `data_collection: "deny"` keeps prompts away from providers that train on
 * them, and `zdr: true` restricts routing to zero-data-retention endpoints
 * (openai/gpt-5-mini is ZDR-listed on https://docs.convex.dev/ai-gateway/models).
 * Set ASK_GATEWAY_ZDR=false only if no ZDR endpoint can serve the model.
 */
export async function streamCompletion(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  opts: {
    mint?: TokenMinter;
    fetch?: GatewayFetch;
    signal?: AbortSignal;
    env?: Record<string, string | undefined>;
  } = {},
): Promise<AsyncIterable<string>> {
  const env = opts.env ?? process.env;
  const openai = gatewayClient(opts.mint, opts.fetch);
  const params = {
    model: ASK_MODEL,
    // Answers are a few sentences. This caps reasoning + answer tokens, and so
    // the worst-case cost of one turn (~$0.003 at gpt-5-mini list prices).
    max_completion_tokens: 900,
    // gpt-5-mini is a reasoning model; keep effort low so first paint is fast.
    reasoning_effort: "low" as const,
    stream: true as const,
    messages,
    // Gateway provider preferences (https://docs.convex.dev/ai-gateway/api).
    provider: {
      data_collection: "deny",
      zdr: env.ASK_GATEWAY_ZDR?.trim() !== "false",
    },
  };
  const stream = await openai.chat.completions.create(
    params as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
    opts.signal ? { signal: opts.signal } : undefined,
  );
  return (async function* () {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  })();
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export type GatewayReason =
  | "ok"
  | "gateway-disabled"
  | "gateway-unavailable"
  | "spending-limit"
  | "team-suspended"
  | "gateway-error";

export interface GatewayStatus {
  ready: boolean;
  source: "convex-ai-gateway";
  /** "ok" when ready, otherwise why Ask Cosmo is off. Never a secret value. */
  reason: GatewayReason;
  /** What clears it, for a human reading /health. */
  hint?: string;
}

/** The token errors listed on https://docs.convex.dev/ai-gateway/overview#who-can-use-it */
const HINTS: Record<Exclude<GatewayReason, "ok">, string> = {
  "gateway-disabled":
    "AiGatewayDisabled: the Convex team is on the free plan or the gateway is disabled for it. Move the team to a paid plan (Starter or Professional).",
  "gateway-unavailable":
    "AiGatewayUnavailable: anonymous, outdated local or self-hosted deployment.",
  "spending-limit":
    "SpendingLimitExceeded: the Convex team is over its spending limit.",
  "team-suspended": "TeamSuspended: the Convex team is suspended.",
  "gateway-error": "Minting a gateway token failed for another reason; see the Convex logs.",
};

/** Map a token-minting failure to a reason code without echoing its text. */
export function classifyGatewayError(err: unknown): Exclude<GatewayReason, "ok"> {
  let text = "";
  try {
    const e = err as { message?: unknown; data?: unknown; code?: unknown };
    text = [e?.message, e?.code, JSON.stringify(e?.data ?? "")]
      .map((x) => (typeof x === "string" ? x : ""))
      .join(" ");
  } catch {
    text = "";
  }
  if (/AiGatewayDisabled/i.test(text)) return "gateway-disabled";
  if (/AiGatewayUnavailable/i.test(text)) return "gateway-unavailable";
  if (/SpendingLimitExceeded/i.test(text)) return "spending-limit";
  if (/TeamSuspended/i.test(text)) return "team-suspended";
  return "gateway-error";
}

/**
 * Whether this deployment can reach the gateway right now: mints (and drops)
 * one token. Costs no inference. The token never leaves this function.
 */
export async function gatewayStatus(
  mint: TokenMinter = mintGatewayToken,
): Promise<GatewayStatus> {
  try {
    const token = await mint();
    if (typeof token !== "string" || token.length === 0) {
      return { ready: false, source: "convex-ai-gateway", reason: "gateway-error", hint: HINTS["gateway-error"] };
    }
    return { ready: true, source: "convex-ai-gateway", reason: "ok" };
  } catch (err) {
    const reason = classifyGatewayError(err);
    return { ready: false, source: "convex-ai-gateway", reason, hint: HINTS[reason] };
  }
}

export type { AskEvent };
