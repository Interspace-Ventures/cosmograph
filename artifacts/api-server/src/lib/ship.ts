import type Stripe from "stripe";
import type { Logger } from "pino";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, shipUnlocksTable } from "@workspace/db";
import { getUncachableStripeClient } from "./stripeClient";
import {
  fetchClerkEmail,
  getOrCreateUser,
  ensureCustomer,
  INCLUDED_UNLOCK_SLOTS,
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

// How many premium ship types an active member gets included for free. Beyond
// that (or for non-members) each type is a $1 one-time purchase. Reuses the
// membership's included-slot count so the "members get N free" promise is one
// number across the product.
export const INCLUDED_SKIN_SLOTS = INCLUDED_UNLOCK_SLOTS;

// Either the root db handle or a transaction handle — both expose the query
// builders the helpers below use.
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const SKIN_AMOUNT = 100; // $1.00 one-time, in cents
const SKIN_CURRENCY = "usd";
const SKIN_PRODUCT_NAME = "Cosmograph — Ship Type";
const SKIN_PRODUCT_DESCRIPTION =
  "A premium cosmonaut ship type (one-time unlock). Fly it in the galaxy and show it off to other cosmonauts.";

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
  const ownedPremium = await listOwnedPremiumTypes(userId);
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
    const owned = await listOwnedPremiumTypes(userId);
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

// The one-time $1 ship-type price, created on first use (own product so it
// reads clearly on the receipt). Mirrors the billing price helpers: look up by
// product metadata, find-or-create a one-time price, keep name/desc on-brand.
async function getOrCreateSkinPrice(stripe: Stripe): Promise<Stripe.Price> {
  const found = await stripe.products.search({
    query: "metadata['cosmograph_skin']:'true' AND active:'true'",
  });
  let product = found.data[0];
  if (!product) {
    product = await stripe.products.create({
      name: SKIN_PRODUCT_NAME,
      description: SKIN_PRODUCT_DESCRIPTION,
      metadata: { cosmograph_skin: "true" },
    });
  } else if (
    product.name !== SKIN_PRODUCT_NAME ||
    product.description !== SKIN_PRODUCT_DESCRIPTION
  ) {
    product = await stripe.products.update(product.id, {
      name: SKIN_PRODUCT_NAME,
      description: SKIN_PRODUCT_DESCRIPTION,
    });
  }
  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 100,
  });
  const existing = prices.data.find(
    (p) =>
      !p.recurring &&
      p.unit_amount === SKIN_AMOUNT &&
      p.currency === SKIN_CURRENCY,
  );
  if (existing) return existing;
  return stripe.prices.create({
    product: product.id,
    unit_amount: SKIN_AMOUNT,
    currency: SKIN_CURRENCY,
  });
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

// Carry the explored scientist through the Stripe round-trip, sanitized so a
// tampered value can't rewrite the redirect URL (mirrors billing).
function sanitizeAuthorId(author: string | null | undefined): string | null {
  if (!author) return null;
  const trimmed = author.trim();
  return /^A\d+$/.test(trimmed) ? trimmed : null;
}

// Claim a premium ship type for the account: free for members with an included
// slot remaining, otherwise a $1 one-time Stripe Checkout. Idempotent —
// claiming an already-owned type is a no-op.
export async function claimOrCheckoutSkin(
  userId: string,
  typeId: string,
  origin: string,
  author: string | null | undefined,
  log: Logger,
): Promise<SkinCheckoutResult> {
  if (!PREMIUM_SHIP_TYPES.has(typeId)) throw new InvalidShipTypeError();

  const email = await fetchClerkEmail(userId);
  const user = await getOrCreateUser(userId, email);

  // Serialize free-slot accounting per account so two concurrent claims can't
  // both read the same slot count and grant two free types from one slot.
  const free = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
    const owned = await listOwnedPremiumTypes(userId, tx);
    if (owned.includes(typeId)) return { alreadyOwned: true, granted: false };
    const slotsLeft = user.hasPaid
      ? Math.max(0, INCLUDED_SKIN_SLOTS - owned.length)
      : 0;
    if (slotsLeft > 0) {
      await recordSkinUnlock(userId, typeId, tx);
      log.info({ userId, typeId }, "ship type claimed via included slot");
      return { alreadyOwned: false, granted: true };
    }
    return null; // payment required
  });

  if (free) return { ...free };

  // Payment required: create a one-time ($1) checkout session.
  const stripe = await getUncachableStripeClient();
  const customerId = await ensureCustomer(stripe, user);
  const price = await getOrCreateSkinPrice(stripe);

  const authorId = sanitizeAuthorId(author);
  const authorParam = authorId ? `author=${authorId}&` : "";
  const meta: Record<string, string> = { userId, kind: "skin", skinType: typeId };
  if (authorId) meta.author = authorId;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{ price: price.id, quantity: 1 }],
    success_url: `${origin}/?${authorParam}skin_unlocked=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?${authorParam}skin_cancelled=1`,
    metadata: meta,
    payment_intent_data: { metadata: meta },
  });

  log.info({ userId, typeId, sessionId: session.id }, "created skin checkout");
  return { alreadyOwned: false, granted: false, url: session.url };
}

// Authoritative confirmation on the success redirect: verify the session
// directly against Stripe and grant the type only if paid and owned by this
// account. Returns the refreshed ship state.
export async function confirmSkin(
  userId: string,
  sessionId: string,
  log: Logger,
): Promise<ShipStateResult> {
  const stripe = await getUncachableStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const meta = session.metadata as
    | { userId?: string; kind?: string; skinType?: string }
    | undefined;
  if (
    session.payment_status === "paid" &&
    meta?.kind === "skin" &&
    meta.userId === userId &&
    meta.skinType &&
    PREMIUM_SHIP_TYPES.has(meta.skinType)
  ) {
    await recordSkinUnlock(userId, meta.skinType);
    // Auto-equip the freshly purchased type so the paid path matches the
    // free-claim path (which equips immediately). The row already exists for
    // any account that reached checkout; upsert keeps it safe regardless.
    await db
      .insert(usersTable)
      .values({ id: userId, shipType: meta.skinType })
      .onConflictDoUpdate({
        target: usersTable.id,
        set: { shipType: meta.skinType },
      });
    log.info({ userId, sessionId, typeId: meta.skinType }, "skin confirmed");
  }
  return getShip(userId);
}

// Best-effort skin grant straight from the webhook, covering buyers who never
// return to the success URL. Signature is already verified upstream. No-ops on
// non-skin events.
export async function grantSkinFromWebhook(
  payload: Buffer,
  log: Logger,
): Promise<void> {
  try {
    const event = JSON.parse(payload.toString("utf8")) as {
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
    if (
      event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded"
    ) {
      return;
    }
    const obj = event.data?.object ?? {};
    const meta = obj.metadata as
      | { userId?: string; kind?: string; skinType?: string }
      | undefined;
    if (meta?.kind !== "skin") return;
    const paid = obj.payment_status === "paid";
    if (
      paid &&
      meta.userId &&
      meta.skinType &&
      PREMIUM_SHIP_TYPES.has(meta.skinType)
    ) {
      await recordSkinUnlock(meta.userId, meta.skinType);
      log.info({ userId: meta.userId, typeId: meta.skinType }, "skin granted via webhook");
    }
  } catch (err) {
    log.warn({ err }, "failed to process skin grant from webhook");
  }
}
