import type { MutationCtx } from "./server";
import type { CheckoutLimits } from "./billingConfig";

/**
 * Counters for money-costing endpoints, kept in the `rateCounters` table.
 * Convex mutations are serializable, so read-check-increment can't race.
 *
 * Fails closed: a zero, negative or malformed limit denies (GLOBAL_CUTOFF),
 * and any storage error throws, which rejects the request. Nothing is counted
 * unless every bucket has room.
 */

type Writer = Pick<MutationCtx, "db">;

export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;

export type BudgetDenial = "RATE_LIMITED" | "DAILY_LIMIT" | "GLOBAL_CUTOFF";

export async function takeBudget(
  ctx: Writer,
  scope: string,
  clientKey: string,
  limits: CheckoutLimits,
  now: number,
): Promise<{ ok: true } | { ok: false; reason: BudgetDenial }> {
  for (const n of [limits.perMinute, limits.dailyPerClient, limits.dailyGlobal]) {
    if (!Number.isInteger(n) || n <= 0) return { ok: false, reason: "GLOBAL_CUTOFF" };
  }
  if (!clientKey) return { ok: false, reason: "GLOBAL_CUTOFF" };
  const minute = Math.floor(now / MINUTE_MS);
  const day = Math.floor(now / DAY_MS);
  const buckets: Array<{
    key: string;
    limit: number;
    reason: BudgetDenial;
    expiresAt: number;
  }> = [
    {
      key: `${scope}:global:${day}`,
      limit: limits.dailyGlobal,
      reason: "GLOBAL_CUTOFF",
      expiresAt: (day + 2) * DAY_MS,
    },
    {
      key: `${scope}:day:${clientKey}:${day}`,
      limit: limits.dailyPerClient,
      reason: "DAILY_LIMIT",
      expiresAt: (day + 2) * DAY_MS,
    },
    {
      key: `${scope}:min:${clientKey}:${minute}`,
      limit: limits.perMinute,
      reason: "RATE_LIMITED",
      expiresAt: (minute + 2) * MINUTE_MS,
    },
  ];

  const rows = [];
  for (const bucket of buckets) {
    const row = await ctx.db
      .query("rateCounters")
      .withIndex("by_key", (q) => q.eq("key", bucket.key))
      .first();
    if ((row?.count ?? 0) >= bucket.limit) {
      return { ok: false, reason: bucket.reason };
    }
    rows.push(row);
  }
  for (let i = 0; i < buckets.length; i++) {
    const row = rows[i];
    const bucket = buckets[i]!;
    if (row) await ctx.db.patch(row._id, { count: row.count + 1 });
    else {
      await ctx.db.insert("rateCounters", {
        key: bucket.key,
        count: 1,
        expiresAt: bucket.expiresAt,
      });
    }
  }
  return { ok: true };
}

/** Deletes up to `max` expired counters (run from a cron). */
export async function pruneExpiredCounters(
  ctx: Writer,
  now: number,
  max = 500,
): Promise<number> {
  const expired = await ctx.db
    .query("rateCounters")
    .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
    .take(max);
  for (const row of expired) await ctx.db.delete(row._id);
  return expired.length;
}
