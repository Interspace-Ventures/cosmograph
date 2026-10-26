import { v } from "convex/values";
import { mutation, type MutationCtx } from "./lib/server";
import { requireIdentity } from "./lib/exoKey";
import {
  INCLUDED_UNLOCK_SLOTS,
  badRequest,
  entitlementResult,
  listUnlockedAuthors,
  sanitizeAuthorId,
  userBySubject,
  type EntitlementResult,
} from "./lib/account";
import { entitlementView } from "./account";

/**
 * Billing on Convex. Phase 2 ports only the researcher-unlock accounting from
 * POST /me/unlock. Checkout, the Stripe webhook and the prorated +$1/year
 * add-on charge are Phase 3 (docs/convex-migration-plan.md); until then an
 * unlock beyond the included slots fails closed: nothing is charged and
 * nothing is recorded.
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

  if (unlocked.length + 1 > INCLUDED_UNLOCK_SLOTS) {
    // TODO(convex phase 3): charge the prorated add-on in an action, then
    // record the unlock only after Stripe confirms. Fail closed until then.
    throw badRequest(
      "ADDON_UNAVAILABLE",
      "Additional researchers can't be added right now.",
    );
  }

  await ctx.db.insert("researcherUnlocks", {
    userId: identity.subject,
    authorId,
  });
  return { ...result, unlocked: [...unlocked, authorId] };
}

/**
 * Port of POST /me/unlock for the included slots: a member unlocks a
 * researcher. Auth required; the cap (INCLUDED_UNLOCK_SLOTS) is enforced here.
 */
export const unlock = mutation({
  args: { author: v.string() },
  returns: entitlementView,
  handler: (ctx, args) => unlockHandler(ctx, args),
});
