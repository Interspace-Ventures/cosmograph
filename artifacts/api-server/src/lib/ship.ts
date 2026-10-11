import type { Logger } from "pino";
import { eq } from "drizzle-orm";
import { db, usersTable, shipUnlocksTable } from "@workspace/db";
import {
  fetchClerkEmail,
  getOrCreateUser,
  NotAMemberError,
} from "./billing";

// Account-saved cosmonaut ship. Two things are persisted: a short seed (the
// ship's COLORS derive deterministically from it on the client, see shipLook.ts)
// and the equipped ship TYPE id. Premium types must be owned — recorded in the
// ship_unlocks table — before they can be equipped; the default "scout" type is
// free for everyone and is the assumed fallback.

// The free default everyone flies. Stored as null shipType; resolved to this.
export const DEFAULT_SHIP_TYPE = "scout";

// Premium (must-be-owned) ship type ids. Kept in sync with the client catalog
// in artifacts/cosmograph/src/lib/shipTypes.ts. The server is authoritative for
// ownership, so this list bounds what can be claimed/purchased/equipped.
export const PREMIUM_SHIP_TYPES = new Set(["fighter", "hauler", "interceptor"]);

// Members get every premium type, so the included count is the whole catalog.
export const INCLUDED_SKIN_SLOTS = PREMIUM_SHIP_TYPES.size;

// Either the root db handle or a transaction handle — both expose the query
// builders the helpers below use.
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// SKU stored in ship_unlocks for an owned type. Namespaced so future cosmetic
// kinds (e.g. `color:<pack>`) slot in without a schema change.
export function shipTypeSku(id: string): string {
  return `type:${id}`;
}

// Thrown when the submitted seed sanitizes to nothing — the route maps this to
// 400.
export class InvalidSeedError extends Error {
  constructor() {
    super("A valid ship seed is required.");
    this.name = "InvalidSeedError";
  }
}

// Thrown when a ship type id isn't a known premium type — the route maps this
// to 400.
export class InvalidShipTypeError extends Error {
  constructor() {
    super("Unknown ship type.");
    this.name = "InvalidShipTypeError";
  }
}

// Thrown when saving a ship equipped with a premium type the account does not
// own — the route maps this to 403.
export class ShipTypeNotOwnedError extends Error {
  constructor() {
    super("You don't own that ship type yet.");
    this.name = "ShipTypeNotOwnedError";
  }
}

export interface ShipStateResult {
  shipSeed: string | null;
  // Equipped type id, always resolved to a real type (defaults to scout).
  shipType: string;
  // Owned type ids the account can equip: always includes the free scout, plus
  // every premium type recorded in ship_unlocks.
  ownedTypes: string[];
  // Whether the account is an active member (free-slot eligible).
  entitled: boolean;
  // How many premium types the membership includes for free.
  includedSkinSlots: number;
  // For members: included slots not yet consumed by an owned premium type
  // (clamped at 0). Always 0 for non-members. Drives the "included" vs "$1"
  // label in the customizer.
  freeSlotsRemaining: number;
}

export interface SkinCheckoutResult {
  // The account already owns this type — nothing to do.
  alreadyOwned: boolean;
  // A free member-slot claim was applied (no payment needed).
  granted: boolean;
  // Hosted Stripe Checkout URL to redirect to, when payment is required.
  url?: string | null;
}

// Keep only a short alphanumeric token. This bounds what gets broadcast over
// the presence wire and stored, and rejects anything that isn't a plausible
// seed.
function sanitizeSeed(seed: string): string {
  return seed
    .trim()
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 16);
}

// Premium type ids this account owns, oldest first.
async function listOwnedPremiumTypes(
  userId: string,
  tx: DbOrTx = db,
): Promise<string[]> {
  const rows = await tx
    .select({ sku: shipUnlocksTable.sku })
    .from(shipUnlocksTable)
    .where(eq(shipUnlocksTable.userId, userId))
    .orderBy(shipUnlocksTable.createdAt);
  return rows
    .map((r) => r.sku)
    .filter((s) => s.startsWith("type:"))
    .map((s) => s.slice("type:".length))
    .filter((id) => PREMIUM_SHIP_TYPES.has(id));
}

function buildState(
  shipSeed: string | null,
  shipType: string | null,
  entitled: boolean,
  ownedPremium: string[],
): ShipStateResult {
  const freeSlotsRemaining = entitled
    ? Math.max(0, INCLUDED_SKIN_SLOTS - ownedPremium.length)
    : 0;
  return {
    shipSeed: shipSeed ?? null,
    shipType: shipType ?? DEFAULT_SHIP_TYPE,
    ownedTypes: [DEFAULT_SHIP_TYPE, ...ownedPremium],
    entitled,
    includedSkinSlots: INCLUDED_SKIN_SLOTS,
    freeSlotsRemaining,
  };
}

// Pure read for GET /me/ship: never touches Stripe.
export async function getShip(userId: string): Promise<ShipStateResult> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const ownedPremium = user?.hasPaid
    ? [...PREMIUM_SHIP_TYPES]
    : await listOwnedPremiumTypes(userId);
  return buildState(
    user?.shipSeed ?? null,
    user?.shipType ?? null,
    user?.hasPaid ?? false,
    ownedPremium,
  );
}

export async function saveShip(
  userId: string,
  rawSeed: string,
  rawType: string | null | undefined,
): Promise<ShipStateResult> {
  const seed = sanitizeSeed(rawSeed);
  if (!seed) throw new InvalidSeedError();

  // Resolve the requested type. Scout (or null) is always allowed; a premium
  // type must be a known type AND owned by this account.
  let shipType = DEFAULT_SHIP_TYPE;
  if (rawType && rawType !== DEFAULT_SHIP_TYPE) {
    if (!PREMIUM_SHIP_TYPES.has(rawType)) throw new InvalidShipTypeError();
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const owned = u?.hasPaid ? [...PREMIUM_SHIP_TYPES] : await listOwnedPremiumTypes(userId);
    if (!owned.includes(rawType)) throw new ShipTypeNotOwnedError();
    shipType = rawType;
  }

  // Upsert: a row may not exist yet for a brand-new account that saves a ship
  // before ever touching billing.
  await db
    .insert(usersTable)
    .values({ id: userId, shipSeed: seed, shipType })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: { shipSeed: seed, shipType },
    });
  return getShip(userId);
}

// Idempotently record that a user owns a premium ship type. The composite PK on
// (userId, sku) makes a repeat claim a no-op.
async function recordSkinUnlock(
  userId: string,
  typeId: string,
  tx: DbOrTx = db,
): Promise<void> {
  await tx
    .insert(shipUnlocksTable)
    .values({ userId, sku: shipTypeSku(typeId) })
    .onConflictDoNothing();
}

// Membership includes every ship type (no per-ship purchases). Claiming a
// premium type as a member records ownership and equips it; non-members fly the
// free scout. Ships bought under the old $1 model stay owned.
export async function claimOrCheckoutSkin(
  userId: string,
  typeId: string,
  _origin: string,
  _author: string | null | undefined,
  log: Logger,
): Promise<SkinCheckoutResult> {
  if (!PREMIUM_SHIP_TYPES.has(typeId)) throw new InvalidShipTypeError();
  const email = await fetchClerkEmail(userId);
  const user = await getOrCreateUser(userId, email);
  const owned = await listOwnedPremiumTypes(userId);
  if (owned.includes(typeId)) return { alreadyOwned: true, granted: false };
  if (!user.hasPaid) throw new NotAMemberError();
  await recordSkinUnlock(userId, typeId);
  await db
    .update(usersTable)
    .set({ shipType: typeId })
    .where(eq(usersTable.id, userId));
  log.info({ userId, typeId }, "ship type claimed with membership");
  return { alreadyOwned: false, granted: true };
}

// Kept so old success redirects don't error; there is nothing left to confirm.
export async function confirmSkin(
  userId: string,
  _sessionId: string,
  _log: Logger,
): Promise<ShipStateResult> {
  return getShip(userId);
}
