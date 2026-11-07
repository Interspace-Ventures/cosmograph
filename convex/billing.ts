import { v } from "convex/values";
import { mutation, type MutationCtx } from "./lib/server";
import { requireIdentity } from "./lib/exoKey";
import {
  MEMBER_UNLOCK_LIMIT,
  badRequest,
  entitlementResult,
  listUnlockedAuthors,
  sanitizeAuthorId,
  userBySubject,
  type EntitlementResult,
} from "./lib/account";
import { entitlementView } from "./account";

/**
 * Researcher unlocks on Convex (port of POST /me/unlock).
 *
 * Phase 3 adopts PR #12's model: membership ($9.99/yr or $29.99 lifetime) is
 * the only product, and members pin researchers with no per-researcher charge
 * up to MEMBER_UNLOCK_LIMIT. A non-member gets NOT_A_MEMBER and the SPA starts
 * membership checkout (http.ts POST /billing/checkout) carrying the
 * researcher; the verified webhook records it once payment lands. Membership
 * itself is written only by the webhook (billingInternal.applyEvent).
 */

export async function unlockHandler(
  ctx: Pick<MutationCtx, "auth" | "db">,
  args: { author: string },
): Promise<EntitlementResult> {
  const identity = await requireIdentity(ctx);
  const authorId = sanitizeAuthorId(args.author);
  if (!authorId) {
    throw badRequest("INVALID_AUTHOR", "A valid researcher id is required.");
  }

  // Membership comes only from the server-written hasPaid flag.
  const user = await userBySubject(ctx, identity.subject);
  if (!user?.hasPaid) {
    throw badRequest(
      "NOT_A_MEMBER",
      "An active membership is required to unlock researchers.",
    );
  }

  // Convex mutations are serializable, which replaces the Postgres advisory
  // lock: two concurrent unlocks can't both read the same slot count.
  const unlocked = await listUnlockedAuthors(ctx, identity.subject);
  const result = entitlementResult(user, unlocked);
  if (unlocked.includes(authorId)) return result; // idempotent, never charges

  if (unlocked.length >= MEMBER_UNLOCK_LIMIT) {
    throw badRequest(
      "UNLOCK_LIMIT",
      "You've reached the researcher limit for one account.",
    );
  }

  await ctx.db.insert("researcherUnlocks", {
    userId: identity.subject,
    authorId,
  });
  return { ...result, unlocked: [...unlocked, authorId] };
}

/**
 * Port of POST /me/unlock: a member pins a researcher. Auth required;
 * membership and the cap (MEMBER_UNLOCK_LIMIT) are enforced here.
 */
export const unlock = mutation({
  args: { author: v.string() },
  returns: entitlementView,
  handler: (ctx, args) => unlockHandler(ctx, args),
});
