import { appOrigins, limitFromEnv, type CheckoutLimits } from "./billingConfig";

/**
 * Non-secret Ask Cosmo configuration, read from plain env on the Convex
 * deployment. There is no model key anywhere: the Convex AI Gateway holds the
 * provider credentials and the action authenticates with a short-lived
 * deployment token (lib/aiGateway.ts).
 *
 *   ASK_PER_MINUTE         calls per visitor per minute     (default 12)
 *   ASK_DAILY_PER_CLIENT   calls per visitor per UTC day    (default 30)
 *   ASK_DAILY_GLOBAL       calls across everyone per UTC day (default 10000)
 *   PUBLIC_APP_ORIGINS / ALLOWED_ORIGINS  browser Origin allowlist (shared with billing)
 *
 * The defaults are the Express route's knobs (12/min, 30/day, 10000/day).
 * A malformed or zero limit becomes 0, and a 0 limit denies every call
 * (lib/rateLimit.ts), so a bad setting fails closed instead of uncapped.
 */

type Env = Record<string, string | undefined>;

export const DEFAULT_ASK_LIMITS: CheckoutLimits = {
  perMinute: 12,
  dailyPerClient: 30,
  dailyGlobal: 10_000,
};

export function askLimits(env: Env = process.env): CheckoutLimits {
  return {
    perMinute: limitFromEnv(env.ASK_PER_MINUTE, DEFAULT_ASK_LIMITS.perMinute),
    dailyPerClient: limitFromEnv(
      env.ASK_DAILY_PER_CLIENT,
      DEFAULT_ASK_LIMITS.dailyPerClient,
    ),
    dailyGlobal: limitFromEnv(env.ASK_DAILY_GLOBAL, DEFAULT_ASK_LIMITS.dailyGlobal),
  };
}

export function askOrigins(env: Env = process.env): string[] {
  return appOrigins(env);
}
