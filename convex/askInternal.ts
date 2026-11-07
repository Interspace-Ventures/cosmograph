import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./lib/server";
import { takeBudget } from "./lib/rateLimit";
import { askLimits } from "./lib/askConfig";

/**
 * Ask Cosmo's spend budget, internal only (called by the /ask/chat HTTP
 * action). Per-minute, daily per-visitor and global daily counters live in
 * the shared `rateCounters` table under the "ask" scope; a Convex mutation is
 * serializable, so read-check-increment can't race, and the counters survive
 * restarts and are shared by every instance (the Express DailyBudget was
 * in-memory per process). Expired rows are pruned by the daily cron.
 */
export async function takeAskHandler(
  ctx: Pick<MutationCtx, "db">,
  args: { clientKey: string },
  env: Record<string, string | undefined> = process.env,
  now: number = Date.now(),
) {
  return takeBudget(ctx, "ask", args.clientKey, askLimits(env), now);
}

export const take = internalMutation({
  args: { clientKey: v.string() },
  handler: (ctx, args) => takeAskHandler(ctx, args),
});
