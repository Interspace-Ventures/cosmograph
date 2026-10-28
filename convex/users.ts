import { v } from "convex/values";
import { mutation, query, type Doc, type QueryCtx } from "./lib/server";
import { requireIdentity, verifiedEmail } from "./lib/exoKey";

/**
 * What the signed-in member may see about their own account. Server-only
 * fields (stripeCustomerId, referredBy) never leave Convex.
 */
const accountView = v.object({
  exoSubject: v.string(),
  email: v.optional(v.string()),
  hasPaid: v.boolean(),
  shipSeed: v.optional(v.string()),
  shipType: v.optional(v.string()),
  referralCode: v.optional(v.string()),
  createdAt: v.number(),
});

function toView(user: Doc<"users">) {
  return {
    exoSubject: user.exoSubject,
    email: user.email,
    hasPaid: user.hasPaid,
    shipSeed: user.shipSeed,
    shipType: user.shipType,
    referralCode: user.referralCode,
    createdAt: user._creationTime,
  };
}

/** The account row for an Exo subject, if one exists. */
export async function userBySubject(
  ctx: Pick<QueryCtx, "db">,
  exoSubject: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_exoSubject", (q) => q.eq("exoSubject", exoSubject))
    .first();
}

/**
 * The signed-in member's account, or null when signed out or not yet ensured.
 * Read-only; the SPA calls `users.ensure` after sign-in to create the row.
 */
export const current = query({
  args: {},
  returns: v.union(accountView, v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) return null;
    const user = await userBySubject(ctx, identity.subject);
    return user ? toView(user) : null;
  },
});

/**
 * Find-or-create the signed-in member's account. Called by the SPA right after
 * Exo sign-in completes (wired in Phase 2). Idempotent: Convex mutations are
 * serializable, so the lookup-then-insert below can never create two rows for
 * one Exo subject. The email is only filled or refreshed from a verified Exo
 * claim and is never blanked. Takes no arguments: the identity comes only from
 * the verified token.
 */
export const ensure = mutation({
  args: {},
  returns: accountView,
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const email = verifiedEmail(identity);
    const existing = await userBySubject(ctx, identity.subject);

    if (existing) {
      if (email && existing.email !== email) {
        await ctx.db.patch(existing._id, { email });
        return toView({ ...existing, email });
      }
      return toView(existing);
    }

    const id = await ctx.db.insert("users", {
      exoSubject: identity.subject,
      email,
      hasPaid: false,
    });
    const created = await ctx.db.get(id);
    if (!created) throw new Error("account insert did not persist");
    return toView(created);
  },
});
