import { v } from "convex/values";
import { query, type QueryCtx } from "./lib/server";
import { requireIdentity } from "./lib/exoKey";
import {
  entitlementResult,
  listUnlockedAuthors,
  userBySubject,
  type EntitlementResult,
} from "./lib/account";

/** Wire shape of GET /me/entitlement, kept so the SPA store is unchanged. */
export const entitlementView = v.object({
  entitled: v.boolean(),
  email: v.union(v.string(), v.null()),
  includedSlots: v.number(),
  unlocked: v.array(v.string()),
  plan: v.union(v.literal("annual"), v.literal("lifetime"), v.null()),
  status: v.union(v.string(), v.null()),
  memberUntil: v.union(v.string(), v.null()),
  cancelAtPeriodEnd: v.boolean(),
});

export async function entitlementHandler(
  ctx: Pick<QueryCtx, "auth" | "db">,
): Promise<EntitlementResult> {
  const identity = await requireIdentity(ctx);
  const user = await userBySubject(ctx, identity.subject);
  return entitlementResult(
    user,
    await listUnlockedAuthors(ctx, identity.subject),
  );
}

/**
 * Port of GET /me/entitlement: the cached membership flag plus the researchers
 * this account unlocked (oldest first, so the first INCLUDED_UNLOCK_SLOTS are
 * the included ones). Pure read; never touches Stripe. `hasPaid` is written
 * only by the signature-verified Stripe webhook (billingInternal.applyEvent),
 * never from the browser or the checkout return URL.
 */
export const entitlement = query({
  args: {},
  returns: entitlementView,
  handler: (ctx) => entitlementHandler(ctx),
});
