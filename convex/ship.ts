import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./lib/server";
import { requireIdentity } from "./lib/exoKey";
import { requireFeature } from "./lib/features";
import {
  DEFAULT_SHIP_TYPE,
  INCLUDED_SKIN_SLOTS,
  MAX_TYPE_ARG,
  PREMIUM_SHIP_TYPES,
  badRequest,
  findOrCreateUser,
  listOwnedPremiumTypes,
  sanitizeSeed,
  shipState,
  shipTypeSku,
  userBySubject,
  type ShipStateResult,
} from "./lib/account";

/**
 * Account-saved cosmonaut ship, ported from GET/PUT /me/ship and
 * POST /me/ship/claim (artifacts/api-server/src/lib/ship.ts). Ownership of
 * premium hulls is enforced here, server-side. The $1 one-time checkout and
 * POST /me/ship/confirm move to Stripe in Phase 3; until then a claim that
 * needs payment reports `checkoutRequired` and grants nothing.
 */

export const shipView = v.object({
  shipSeed: v.union(v.string(), v.null()),
  shipType: v.string(),
  ownedTypes: v.array(v.string()),
  entitled: v.boolean(),
  includedSkinSlots: v.number(),
  freeSlotsRemaining: v.number(),
});

export const claimView = v.object({
  alreadyOwned: v.boolean(),
  granted: v.boolean(),
  checkoutRequired: v.boolean(),
});

export async function getHandler(
  ctx: Pick<QueryCtx, "auth" | "db">,
): Promise<ShipStateResult> {
  const identity = await requireIdentity(ctx);
  const user = await userBySubject(ctx, identity.subject);
  return shipState(user, await listOwnedPremiumTypes(ctx, identity.subject));
}

export async function saveHandler(
  ctx: Pick<MutationCtx, "auth" | "db">,
  args: { seed: string; type?: string | null },
): Promise<ShipStateResult> {
  const identity = await requireIdentity(ctx);
  const seed = sanitizeSeed(args.seed);
  if (!seed) throw badRequest("INVALID_SEED", "A valid ship seed is required.");

  const owned = await listOwnedPremiumTypes(ctx, identity.subject);
  let shipType = DEFAULT_SHIP_TYPE;
  const rawType = args.type;
  if (rawType && rawType !== DEFAULT_SHIP_TYPE) {
    if (rawType.length > MAX_TYPE_ARG || !PREMIUM_SHIP_TYPES.has(rawType)) {
      throw badRequest("INVALID_SHIP_TYPE", "Unknown ship type.");
    }
    if (!owned.includes(rawType)) {
      throw badRequest("SHIP_TYPE_NOT_OWNED", "You don't own that ship type yet.");
    }
    shipType = rawType;
  }

  const user = await findOrCreateUser(ctx, identity);
  await ctx.db.patch(user._id, { shipSeed: seed, shipType });
  return shipState({ ...user, shipSeed: seed, shipType }, owned);
}

export async function claimHandler(
  ctx: Pick<MutationCtx, "auth" | "db">,
  args: { type: string },
): Promise<{ alreadyOwned: boolean; granted: boolean; checkoutRequired: boolean }> {
  requireFeature("premium-ships");
  const identity = await requireIdentity(ctx);
  const typeId = args.type;
  if (typeId.length > MAX_TYPE_ARG || !PREMIUM_SHIP_TYPES.has(typeId)) {
    throw badRequest("INVALID_SHIP_TYPE", "Unknown ship type.");
  }

  const user = await findOrCreateUser(ctx, identity);
  // Serializable mutation: two concurrent claims can't spend one free slot.
  const owned = await listOwnedPremiumTypes(ctx, identity.subject);
  if (owned.includes(typeId)) {
    return { alreadyOwned: true, granted: false, checkoutRequired: false };
  }
  const slotsLeft = user.hasPaid
    ? Math.max(0, INCLUDED_SKIN_SLOTS - owned.length)
    : 0;
  if (slotsLeft > 0) {
    await ctx.db.insert("shipUnlocks", {
      userId: identity.subject,
      sku: shipTypeSku(typeId),
    });
    return { alreadyOwned: false, granted: true, checkoutRequired: false };
  }
  // TODO(convex phase 3): start the $1 Stripe checkout from an action.
  return { alreadyOwned: false, granted: false, checkoutRequired: true };
}

/** Port of GET /me/ship. Pure read; never touches Stripe. */
export const get = query({
  args: {},
  returns: shipView,
  handler: (ctx) => getHandler(ctx),
});

/** Port of PUT /me/ship: save seed + equipped hull (premium must be owned). */
export const save = mutation({
  args: { seed: v.string(), type: v.optional(v.union(v.string(), v.null())) },
  returns: shipView,
  handler: (ctx, args) => saveHandler(ctx, args),
});

/**
 * Port of the free half of POST /me/ship/claim: a member with an included slot
 * left gets the hull. Gated by the `premium-ships` release flag like Express.
 */
export const claim = mutation({
  args: { type: v.string() },
  returns: claimView,
  handler: (ctx, args) => claimHandler(ctx, args),
});
