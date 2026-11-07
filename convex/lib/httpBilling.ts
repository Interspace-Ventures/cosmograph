import type { UserIdentity } from "convex/server";
import { ConvexError } from "convex/values";
import {
  MEMBER_PLANS,
  billingConfig,
  isAllowedOrigin,
  safeReturnPath,
  type MemberPlan,
} from "./billingConfig";
import { PREMIUM_SHIP_TYPES, sanitizeAuthorId } from "./account";
import { featureEnabled } from "./features";
import { verifiedEmail } from "./exoKey";
import type { CheckoutArgs } from "./checkout";

/**
 * HTTP edge for billing (convex/http.ts). Checkout and portal creation are
 * HTTP actions rather than client-callable actions so the Origin header can
 * be checked against the allowlist (a websocket action never sees it). Order
 * of checks, all failing closed:
 *   release flag (convex-account) -> billing configured -> allowlisted Origin
 *   -> Exo Key identity (Bearer token verified by Convex Auth) -> bounded body
 *   -> per-minute / daily per-client / global daily budget (in the mutation).
 * The browser never states payment: no body field can grant anything.
 */

type Env = Record<string, string | undefined>;

export const MAX_CHECKOUT_BODY = 2048;
export const MAX_WEBHOOK_BODY = 512 * 1024;
export const MAX_SIGNATURE_HEADER = 4096;

export interface BillingHttpDeps {
  env: Env;
  identity(): Promise<UserIdentity | null>;
  checkout(args: CheckoutArgs): Promise<{ alreadyEntitled: boolean; url?: string }>;
  portal(args: { subject: string; origin: string; returnPath: string }): Promise<{ url: string }>;
  webhook(args: { payload: string; signature: string }): Promise<{ status: number }>;
}

function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
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

const STATUS_BY_CODE: Record<string, number> = {
  UNAUTHENTICATED: 401,
  NOT_A_MEMBER: 402,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  DAILY_LIMIT: 429,
  GLOBAL_CUTOFF: 503,
  BILLING_UNAVAILABLE: 503,
};

function errorResponse(err: unknown, headers: Record<string, string>): Response {
  if (err instanceof ConvexError) {
    const data = err.data as { code?: unknown; message?: unknown } | undefined;
    const code = typeof data?.code === "string" ? data.code : "";
    const status = STATUS_BY_CODE[code];
    if (status) {
      return json(
        status,
        { code, error: typeof data?.message === "string" ? data.message : "Unavailable" },
        headers,
      );
    }
  }
  console.error("billing: unexpected error at the HTTP edge");
  return json(503, { code: "BILLING_UNAVAILABLE", error: "Checkout is unavailable right now." }, headers);
}

export interface CheckoutBody {
  plan: MemberPlan;
  returnPath: string;
  author?: string;
  ship?: string;
}

/** Bounded, allowlisted parse. Unknown fields (e.g. `hasPaid`) are ignored. */
export function parseCheckoutBody(text: string, env: Env): CheckoutBody | null {
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const plan = body.plan === undefined ? "annual" : body.plan;
  if (typeof plan !== "string" || !MEMBER_PLANS.includes(plan as MemberPlan)) return null;
  const returnPath = safeReturnPath(body.returnPath);
  if (returnPath === null) return null;
  const out: CheckoutBody = { plan: plan as MemberPlan, returnPath };
  if (body.author !== undefined && body.author !== null) {
    const author = typeof body.author === "string" ? sanitizeAuthorId(body.author) : null;
    if (!author) return null;
    out.author = author;
  }
  if (body.ship !== undefined && body.ship !== null) {
    if (typeof body.ship !== "string" || !PREMIUM_SHIP_TYPES.has(body.ship)) return null;
    // Carry a hull only while premium ships are released.
    if (featureEnabled("premium-ships", env)) out.ship = body.ship;
  }
  return out;
}

/** CORS preflight for the browser-facing billing routes. */
export function handlePreflight(request: Request, env: Env): Response {
  if (!featureEnabled("convex-account", env)) return new Response(null, { status: 404 });
  const cfg = billingConfig(env);
  if (!cfg) return new Response(null, { status: 503 });
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin, cfg.origins)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

type Gate =
  | { ok: false; response: Response }
  | { ok: true; origin: string; cors: Record<string, string>; who: UserIdentity };

async function gate(request: Request, deps: BillingHttpDeps): Promise<Gate> {
  if (!featureEnabled("convex-account", deps.env)) {
    return { ok: false, response: json(404, { error: "Not found" }) };
  }
  const cfg = billingConfig(deps.env);
  if (!cfg) {
    return {
      ok: false,
      response: json(503, { code: "BILLING_UNAVAILABLE", error: "Membership checkout opens soon." }),
    };
  }
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin, cfg.origins)) {
    return { ok: false, response: json(403, { code: "FORBIDDEN_ORIGIN", error: "Forbidden" }) };
  }
  const cors = corsHeaders(origin);
  const who = await deps.identity();
  if (!who?.subject) {
    return {
      ok: false,
      response: json(
        401,
        { code: "UNAUTHENTICATED", error: "Sign in with Exo Imprint is required." },
        cors,
      ),
    };
  }
  return { ok: true, origin, cors, who };
}

/** POST /billing/checkout { plan?, returnPath?, author?, ship? } -> { url } */
export async function handleCheckout(
  request: Request,
  deps: BillingHttpDeps,
): Promise<Response> {
  const g = await gate(request, deps);
  if (!g.ok) return g.response;
  const text = await readBounded(request, MAX_CHECKOUT_BODY);
  if (text === null) return json(413, { code: "TOO_LARGE", error: "Request too large." }, g.cors);
  const body = parseCheckoutBody(text, deps.env);
  if (!body) return json(400, { code: "INVALID_REQUEST", error: "Invalid checkout request." }, g.cors);
  const email = verifiedEmail(g.who);
  try {
    const result = await deps.checkout({
      subject: g.who.subject,
      plan: body.plan,
      origin: g.origin,
      returnPath: body.returnPath,
      ...(email ? { email } : {}),
      ...(body.author ? { author: body.author } : {}),
      ...(body.ship ? { ship: body.ship } : {}),
    });
    return json(200, result, g.cors);
  } catch (err) {
    return errorResponse(err, g.cors);
  }
}

/** POST /billing/portal { returnPath? } -> { url } (members manage billing). */
export async function handlePortal(
  request: Request,
  deps: BillingHttpDeps,
): Promise<Response> {
  const g = await gate(request, deps);
  if (!g.ok) return g.response;
  const text = await readBounded(request, MAX_CHECKOUT_BODY);
  if (text === null) return json(413, { code: "TOO_LARGE", error: "Request too large." }, g.cors);
  let returnPath: string | null = "/";
  try {
    const raw = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    returnPath = safeReturnPath(raw?.returnPath);
  } catch {
    returnPath = null;
  }
  if (returnPath === null) {
    return json(400, { code: "INVALID_REQUEST", error: "Invalid request." }, g.cors);
  }
  try {
    return json(
      200,
      await deps.portal({ subject: g.who.subject, origin: g.origin, returnPath }),
      g.cors,
    );
  } catch (err) {
    return errorResponse(err, g.cors);
  }
}

/** POST /stripe/webhook (server-to-server; no CORS, no Exo identity). */
export async function handleWebhook(
  request: Request,
  deps: BillingHttpDeps,
): Promise<Response> {
  if (!featureEnabled("convex-account", deps.env)) return new Response(null, { status: 404 });
  if (!billingConfig(deps.env)) return new Response(null, { status: 503 });
  const signature = request.headers.get("Stripe-Signature");
  if (!signature || signature.length > MAX_SIGNATURE_HEADER) {
    return new Response(null, { status: 400 });
  }
  const payload = await readBounded(request, MAX_WEBHOOK_BODY);
  if (payload === null) return new Response(null, { status: 413 });
  try {
    const { status } = await deps.webhook({ payload, signature });
    return new Response(null, { status });
  } catch {
    console.error("billing: webhook action failed");
    return new Response(null, { status: 500 });
  }
}
