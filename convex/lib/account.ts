import { ConvexError } from "convex/values";
import type { UserIdentity } from "convex/server";
import type { Doc, MutationCtx, QueryCtx } from "./server";
import { verifiedEmail } from "./exoKey";

/**
 * Shared account logic for the Phase 2 ports (account, researcher unlocks,
 * ship unlocks, referral). Ported from the Express libs in
 * artifacts/api-server/src/lib/{billing,ship,referral}.ts; every function here
 * takes the Exo subject the caller already verified through ctx.auth, never a
 * user id from arguments.
 */

type Reader = Pick<QueryCtx, "db">;
type Writer = Pick<MutationCtx, "db">;

/** Researchers the base membership unlocks before the +$1/year add-on. */
export const INCLUDED_UNLOCK_SLOTS = 3;
/** Premium ship types a member gets free; one number across the product. */
export const INCLUDED_SKIN_SLOTS = INCLUDED_UNLOCK_SLOTS;
/** The free default hull everyone flies. Stored as an unset shipType. */
export const DEFAULT_SHIP_TYPE = "scout";
/**
 * Premium (must-be-owned) hulls. Kept in sync with the client catalog in
 * artifacts/cosmograph/src/lib/shipTypes.ts; the server is authoritative.
 */
export const PREMIUM_SHIP_TYPES: ReadonlySet<string> = new Set([
  "fighter",
  "hauler",
  "interceptor",
]);

/** Upper bounds on raw string arguments, checked before any other work. */
export const MAX_AUTHOR_ARG = 32;
export const MAX_SEED_ARG = 256;
export const MAX_TYPE_ARG = 32;
export const MAX_REFERRAL_ARG = 64;

export function badRequest(code: string, message: string): ConvexError<{
  code: string;
  message: string;
}> {
  return new ConvexError({ code, message });
}

/** Canonical OpenAlex author id (`A` + digits) or null. */
export function sanitizeAuthorId(
  author: string | null | undefined,
): string | null {
  if (!author || author.length > MAX_AUTHOR_ARG) return null;
  const trimmed = author.trim();
  return /^A\d{1,24}$/.test(trimmed) ? trimmed : null;
}

/** Short alphanumeric ship seed (max 16), or "" when nothing usable is left. */
export function sanitizeSeed(seed: string): string {
  if (seed.length > MAX_SEED_ARG) return "";
  return seed
    .trim()
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 16);
}

/** SKU stored in shipUnlocks for an owned hull, e.g. `type:fighter`. */
export function shipTypeSku(id: string): string {
  return `type:${id}`;
}

export async function userBySubject(
  ctx: Reader,
  exoSubject: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_exoSubject", (q) => q.eq("exoSubject", exoSubject))
    .first();
}

/**
 * Find-or-create the account row for a verified identity. Convex mutations are
 * serializable, so the lookup-then-insert can never create two rows for one
 * subject. The email is only filled or refreshed from a verified Exo claim and
 * is never blanked.
 */
export async function findOrCreateUser(
  ctx: Writer,
  identity: UserIdentity,
): Promise<Doc<"users">> {
  const email = verifiedEmail(identity);
  const existing = await userBySubject(ctx, identity.subject);
  if (existing) {
    if (email && existing.email !== email) {
      await ctx.db.patch(existing._id, { email });
      return { ...existing, email };
    }
    return existing;
  }
  const id = await ctx.db.insert("users", {
    exoSubject: identity.subject,
    email,
    hasPaid: false,
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("account insert did not persist");
  return created;
}

/** Researcher ids the account unlocked, oldest first (index order). */
export async function listUnlockedAuthors(
  ctx: Reader,
  exoSubject: string,
): Promise<string[]> {
  const rows = await ctx.db
    .query("researcherUnlocks")
    .withIndex("by_user", (q) => q.eq("userId", exoSubject))
    .collect();
  return rows.map((row) => row.authorId);
}

/** Premium hull ids the account owns, oldest first. */
export async function listOwnedPremiumTypes(
  ctx: Reader,
  exoSubject: string,
): Promise<string[]> {
  const rows = await ctx.db
    .query("shipUnlocks")
    .withIndex("by_user", (q) => q.eq("userId", exoSubject))
    .collect();
  return rows
    .map((row) => row.sku)
    .filter((sku) => sku.startsWith("type:"))
    .map((sku) => sku.slice("type:".length))
    .filter((id) => PREMIUM_SHIP_TYPES.has(id));
}

export interface EntitlementResult {
  entitled: boolean;
  email: string | null;
  includedSlots: number;
  unlocked: string[];
}

export function entitlementResult(
  user: Doc<"users"> | null,
  unlocked: string[],
): EntitlementResult {
  return {
    entitled: user?.hasPaid ?? false,
    email: user?.email ?? null,
    includedSlots: INCLUDED_UNLOCK_SLOTS,
    unlocked,
  };
}

export interface ShipStateResult {
  shipSeed: string | null;
  shipType: string;
  ownedTypes: string[];
  entitled: boolean;
  includedSkinSlots: number;
  freeSlotsRemaining: number;
}

export function shipState(
  user: Pick<Doc<"users">, "shipSeed" | "shipType" | "hasPaid"> | null,
  ownedPremium: string[],
): ShipStateResult {
  const entitled = user?.hasPaid ?? false;
  return {
    shipSeed: user?.shipSeed ?? null,
    shipType: user?.shipType ?? DEFAULT_SHIP_TYPE,
    ownedTypes: [DEFAULT_SHIP_TYPE, ...ownedPremium],
    entitled,
    includedSkinSlots: INCLUDED_SKIN_SLOTS,
    freeSlotsRemaining: entitled
      ? Math.max(0, INCLUDED_SKIN_SLOTS - ownedPremium.length)
      : 0,
  };
}
