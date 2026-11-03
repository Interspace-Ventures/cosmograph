import { ConvexError } from "convex/values";

/**
 * Non-secret billing configuration (migration Phase 3), absorbed from draft
 * PR #12 "Billing v2": $9.99/year (auto-renews) or $29.99 lifetime.
 *
 * Everything read here is plain, non-secret env on the Convex deployment, set
 * by Exo delivery. Stripe secrets are deliberately NOT here: the Node action
 * reads STRIPE_SECRET_KEY and the webhook signing secret from Cosmograph's
 * 1Password vault at runtime (lib/opSecrets.ts), in memory only. The only
 * secret on the deployment is the read-only OP_SERVICE_ACCOUNT_TOKEN.
 *
 *   STRIPE_PRICE_ANNUAL / STRIPE_PRICE_LIFETIME  pre-existing Price ids
 *     (created once, outside the app; the app never creates or edits prices)
 *   STRIPE_MODE            "test" (default) or "live"; the vault key must match
 *   OP_VAULT               1Password vault name (default "Interspace")
 *   OP_STRIPE_SECRET_KEY_ITEM      e.g. "Cosmograph staging: STRIPE_SECRET_KEY"
 *   OP_STRIPE_WEBHOOK_SECRET_ITEM  e.g. "Cosmograph staging: STRIPE_WEBHOOK_SECRET"
 *   OP_SECRET_FIELDS       field ids/titles to read, default "credential,password"
 *   PUBLIC_APP_ORIGINS / ALLOWED_ORIGINS  Origin + return-URL allowlist
 *   CHECKOUT_PER_MINUTE / CHECKOUT_DAILY_PER_CLIENT / CHECKOUT_DAILY_GLOBAL
 *   STRIPE_AUTOMATIC_TAX   "true" to enable Stripe Tax on checkout
 */

export type MemberPlan = "annual" | "lifetime";
export const MEMBER_PLANS: readonly MemberPlan[] = ["annual", "lifetime"];

/** Expected price terms in USD cents. A configured price that differs is refused. */
export const PLAN_AMOUNTS: Record<MemberPlan, number> = {
  annual: 999,
  lifetime: 2999,
};

export const RENEWAL_NOTICE =
  "Renews automatically every year at $9.99 until you cancel. Cancel anytime from your account. We'll email you before each renewal.";
export const LIFETIME_NOTICE =
  "One payment. Membership for as long as Cosmograph exists.";

/** Checkout sessions expire quickly so a leaked or stale link can't be reused. */
export const CHECKOUT_SESSION_TTL_SECONDS = 30 * 60;

/** Used only when PUBLIC_APP_ORIGINS is unset (same defaults as #12). */
export const DEFAULT_ORIGINS = [
  "https://cosmograph.space",
  "https://app.cosmograph.space",
  "https://staging.exo.now",
];

export interface CheckoutLimits {
  perMinute: number;
  dailyPerClient: number;
  dailyGlobal: number;
}

/** #12 used 20/day per user and 5000/day globally; per-minute is new. */
export const DEFAULT_LIMITS: CheckoutLimits = {
  perMinute: 3,
  dailyPerClient: 20,
  dailyGlobal: 5000,
};

export type StripeMode = "test" | "live";

export interface VaultConfig {
  vault: string;
  secretKeyItem: string;
  webhookSecretItem: string;
  fields: string[];
}

export interface BillingConfig {
  priceIds: Record<MemberPlan, string>;
  origins: string[];
  limits: CheckoutLimits;
  vault: VaultConfig;
  stripeMode: StripeMode;
  automaticTax: boolean;
}

type Env = Record<string, string | undefined>;

/**
 * Stripe secrets must never be deployment env. If one shows up anyway, billing
 * refuses to run until it is removed (fail closed, and loud in the logs).
 */
export const FORBIDDEN_SECRET_ENV = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_API_KEY",
  "STRIPE_RESTRICTED_KEY",
] as const;

export function forbiddenSecretEnv(env: Env = process.env): string[] {
  return FORBIDDEN_SECRET_ENV.filter((name) => (env[name] ?? "").trim() !== "");
}

/** Unset uses the default; anything malformed becomes 0, which fails closed. */
export function limitFromEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const trimmed = raw.trim();
  return /^\d{1,9}$/.test(trimmed) ? Number(trimmed) : 0;
}

/** Comma list of bare origins: https anywhere, http only for localhost. */
export function parseOrigins(list: string | undefined): string[] {
  const out: string[] = [];
  for (const raw of (list ?? "").split(",")) {
    const value = raw.trim().replace(/\/$/, "");
    if (!value) continue;
    try {
      const url = new URL(value);
      const okScheme =
        url.protocol === "https:" ||
        (url.protocol === "http:" && url.hostname === "localhost");
      if (
        okScheme &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password
      ) {
        out.push(url.origin);
      }
    } catch {
      // ignore malformed entries
    }
  }
  return [...new Set(out)];
}

const PRICE_ID = /^price_[A-Za-z0-9]{6,64}$/;

/**
 * The deployment's billing config, or null when anything required is missing
 * or malformed. Null means billing is off: every billing endpoint answers 503.
 */
export function billingConfig(env: Env = process.env): BillingConfig | null {
  const annual = env.STRIPE_PRICE_ANNUAL?.trim() ?? "";
  const lifetime = env.STRIPE_PRICE_LIFETIME?.trim() ?? "";
  if (!PRICE_ID.test(annual) || !PRICE_ID.test(lifetime) || annual === lifetime) {
    return null;
  }
  const secretKeyItem = env.OP_STRIPE_SECRET_KEY_ITEM?.trim() ?? "";
  const webhookSecretItem = env.OP_STRIPE_WEBHOOK_SECRET_ITEM?.trim() ?? "";
  if (!secretKeyItem || !webhookSecretItem) return null;
  const mode = env.STRIPE_MODE?.trim() || "test";
  if (mode !== "test" && mode !== "live") return null;
  const fields = (env.OP_SECRET_FIELDS ?? "credential,password")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  const configured = parseOrigins(env.PUBLIC_APP_ORIGINS);
  const origins = [
    ...new Set([
      ...(configured.length ? configured : DEFAULT_ORIGINS),
      ...parseOrigins(env.ALLOWED_ORIGINS),
    ]),
  ];
  return {
    priceIds: { annual, lifetime },
    origins,
    limits: {
      perMinute: limitFromEnv(env.CHECKOUT_PER_MINUTE, DEFAULT_LIMITS.perMinute),
      dailyPerClient: limitFromEnv(
        env.CHECKOUT_DAILY_PER_CLIENT,
        DEFAULT_LIMITS.dailyPerClient,
      ),
      dailyGlobal: limitFromEnv(
        env.CHECKOUT_DAILY_GLOBAL,
        DEFAULT_LIMITS.dailyGlobal,
      ),
    },
    vault: {
      vault: env.OP_VAULT?.trim() || "Interspace",
      secretKeyItem,
      webhookSecretItem,
      fields: fields.length ? fields : ["credential", "password"],
    },
    stripeMode: mode,
    automaticTax: env.STRIPE_AUTOMATIC_TAX === "true",
  };
}

/** Exact-origin match against the allowlist (no path, credentials or junk). */
export function isAllowedOrigin(
  origin: string | null | undefined,
  origins: readonly string[],
): origin is string {
  if (!origin || origin.length > 200) return false;
  try {
    const url = new URL(origin);
    return url.origin === origin && origins.includes(url.origin);
  } catch {
    return false;
  }
}

export const MAX_RETURN_PATH = 256;
const RETURN_PATH = /^\/(?!\/)[A-Za-z0-9\-._~/]*$/;

/**
 * The in-app path Stripe sends the visitor back to. Only a plain absolute
 * path is accepted (no scheme, host, `//`, `..`, query or fragment); the
 * origin is always the allowlisted request Origin. Returns null if invalid.
 */
export function safeReturnPath(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return "/";
  if (typeof raw !== "string" || raw.length > MAX_RETURN_PATH) return null;
  if (!RETURN_PATH.test(raw) || raw.includes("..")) return null;
  return raw;
}

/** Stripe return URLs, built only from an allowlisted origin + safe path. */
export function checkoutReturnUrls(
  origin: string,
  path: string,
  author?: string,
): { success: string; cancel: string } {
  const extra = author ? `&author=${author}` : "";
  return {
    success: `${origin}${path}?checkout=success${extra}`,
    cancel: `${origin}${path}?checkout=cancelled${extra}`,
  };
}

export function billingError(
  code:
    | "BILLING_UNAVAILABLE"
    | "RATE_LIMITED"
    | "DAILY_LIMIT"
    | "GLOBAL_CUTOFF"
    | "NOT_A_MEMBER",
  message?: string,
): ConvexError<{ code: string; message: string }> {
  const defaults: Record<string, string> = {
    BILLING_UNAVAILABLE: "Checkout is unavailable right now.",
    RATE_LIMITED: "Too many checkout attempts. Please wait a minute.",
    DAILY_LIMIT: "Too many checkout attempts today. Please try again tomorrow.",
    GLOBAL_CUTOFF: "Checkout is paused right now. Please try again later.",
    NOT_A_MEMBER: "An active membership is required.",
  };
  return new ConvexError({ code, message: message ?? defaults[code]! });
}
