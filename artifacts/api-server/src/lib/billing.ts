import type Stripe from "stripe";
import type { Logger } from "pino";
import { eq, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  researcherUnlocksTable,
  type User,
} from "@workspace/db";
import { clerkClient } from "@clerk/express";
import { getUncachableStripeClient } from "./stripeClient";

// Account-level membership: a $7/year subscription ("Full Access") makes the
// account a member (hasPaid). Membership includes a fixed number of researcher
// unlocks (INCLUDED_UNLOCK_SLOTS); each additional researcher is billed as a
// recurring +$1/year add-on, charged immediately with proration. We model
// membership as a boolean on the user (hasPaid = active member), flipped on
// checkout/renewal and cleared when the subscription ends; which researchers a
// member has unlocked lives in the researcher_unlocks table.
const MEMBERSHIP_PRODUCT_NAME = "Cosmograph — Full Access";
const MEMBERSHIP_DESCRIPTION =
  "Yearly membership: explore researchers' galaxies in full — guided tour, spaceship fly-through, rich paper detail, and Ask the galaxy — including 3 researchers, plus every new feature as it ships.";
const MEMBERSHIP_AMOUNT = 700; // $7.00 / year in cents
const MEMBERSHIP_CURRENCY = "usd";
const MEMBERSHIP_INTERVAL = "year" as const;

// Add-on: each researcher beyond the included slots costs +$1/year, modeled as
// a second recurring subscription item whose quantity tracks the number of
// extra unlocks. Adding quantity mid-cycle is invoiced immediately with
// proration (see chargeAddonQuantity).
const ADDON_PRODUCT_NAME = "Cosmograph — Additional Researcher";
const ADDON_DESCRIPTION =
  "One additional researcher's galaxy unlocked on your membership, billed yearly.";
const ADDON_AMOUNT = 100; // $1.00 / year in cents

// How many researchers the base membership unlocks before the add-on kicks in.
export const INCLUDED_UNLOCK_SLOTS = 3;

// Thrown when the requested author id is not a canonical OpenAlex id — the
// route maps this to 400.
export class InvalidAuthorError extends Error {
  constructor() {
    super("A valid researcher id is required.");
    this.name = "InvalidAuthorError";
  }
}

// Thrown by unlockResearcher when the account is not an active member (must
// subscribe first) — the route maps this to 402.
export class NotAMemberError extends Error {
  constructor() {
    super("An active membership is required to unlock researchers.");
    this.name = "NotAMemberError";
  }
}

// Thrown when the prorated add-on charge could not be collected (e.g. the card
// on file was declined). The unlock is NOT recorded in this case.
export class AddonChargeFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AddonChargeFailedError";
  }
}

export interface EntitlementResult {
  entitled: boolean;
  email: string | null;
  includedSlots: number;
  unlocked: string[];
}

export interface CheckoutResult {
  alreadyEntitled: boolean;
  url?: string | null;
}

async function fetchClerkEmail(userId: string): Promise<string | null> {
  try {
    const user = await clerkClient.users.getUser(userId);
    const primary = user.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId,
    );
    return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
  } catch {
    return null;
  }
}

async function getOrCreateUser(
  userId: string,
  email: string | null,
): Promise<User> {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (existing) {
    if (email && existing.email !== email) {
      const [updated] = await db
        .update(usersTable)
        .set({ email })
        .where(eq(usersTable.id, userId))
        .returning();
      return updated;
    }
    return existing;
  }
  const [created] = await db
    .insert(usersTable)
    .values({ id: userId, email })
    .returning();
  return created;
}

// All researcher ids this account has unlocked, oldest first (so the first
// INCLUDED_UNLOCK_SLOTS are the base-included ones).
async function listUnlockedAuthors(userId: string): Promise<string[]> {
  const rows = await db
    .select({ authorId: researcherUnlocksTable.authorId })
    .from(researcherUnlocksTable)
    .where(eq(researcherUnlocksTable.userId, userId))
    .orderBy(researcherUnlocksTable.createdAt);
  return rows.map((r) => r.authorId);
}

// Pure read used by GET /me/entitlement. Never touches Stripe, so it keeps
// working (returning the cached membership flag + unlocked list) even if Stripe
// is unreachable.
export async function getEntitlement(
  userId: string,
): Promise<EntitlementResult> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const unlocked = await listUnlockedAuthors(userId);
  return {
    entitled: user?.hasPaid ?? false,
    email: user?.email ?? null,
    includedSlots: INCLUDED_UNLOCK_SLOTS,
    unlocked,
  };
}

// Idempotently record that a user has unlocked a researcher. The composite PK
// makes a repeat unlock a no-op.
async function recordUnlock(userId: string, authorId: string): Promise<void> {
  await db
    .insert(researcherUnlocksTable)
    .values({ userId, authorId })
    .onConflictDoNothing();
}

async function ensureCustomer(stripe: Stripe, user: User): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const email = user.email ?? (await fetchClerkEmail(user.id)) ?? undefined;
  const customer = await stripe.customers.create({
    email,
    metadata: { userId: user.id },
  });
  await db
    .update(usersTable)
    .set({ stripeCustomerId: customer.id, email: email ?? user.email })
    .where(eq(usersTable.id, user.id));
  return customer.id;
}

// Finds the yearly membership price, creating the product + recurring price on
// first use so the flow works as soon as Stripe is connected (no separate
// seeding step required). Idempotent: subsequent calls reuse the existing
// product/price, and the product name/description are kept on-brand even if it
// was first created under the old one-time naming.
async function getOrCreateMembershipPrice(
  stripe: Stripe,
): Promise<Stripe.Price> {
  const found = await stripe.products.search({
    query: "metadata['galactic_unlock']:'true' AND active:'true'",
  });
  let product = found.data[0];
  if (!product) {
    product = await stripe.products.create({
      name: MEMBERSHIP_PRODUCT_NAME,
      description: MEMBERSHIP_DESCRIPTION,
      metadata: { galactic_unlock: "true" },
    });
  } else if (
    product.name !== MEMBERSHIP_PRODUCT_NAME ||
    product.description !== MEMBERSHIP_DESCRIPTION
  ) {
    product = await stripe.products.update(product.id, {
      name: MEMBERSHIP_PRODUCT_NAME,
      description: MEMBERSHIP_DESCRIPTION,
    });
  }
  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 100,
  });
  const existing = prices.data.find(
    (p) =>
      p.recurring?.interval === MEMBERSHIP_INTERVAL &&
      p.unit_amount === MEMBERSHIP_AMOUNT &&
      p.currency === MEMBERSHIP_CURRENCY,
  );
  if (existing) return existing;
  return stripe.prices.create({
    product: product.id,
    unit_amount: MEMBERSHIP_AMOUNT,
    currency: MEMBERSHIP_CURRENCY,
    recurring: { interval: MEMBERSHIP_INTERVAL },
  });
}

// The recurring +$1/year add-on price, created on first use (own product so it
// reads clearly on the invoice). Mirrors getOrCreateMembershipPrice: look up by
// product metadata, find-or-create the yearly price, keep name/desc on-brand.
async function getOrCreateAddonPrice(stripe: Stripe): Promise<Stripe.Price> {
  const found = await stripe.products.search({
    query: "metadata['cosmograph_addon']:'true' AND active:'true'",
  });
  let product = found.data[0];
  if (!product) {
    product = await stripe.products.create({
      name: ADDON_PRODUCT_NAME,
      description: ADDON_DESCRIPTION,
      metadata: { cosmograph_addon: "true" },
    });
  } else if (
    product.name !== ADDON_PRODUCT_NAME ||
    product.description !== ADDON_DESCRIPTION
  ) {
    product = await stripe.products.update(product.id, {
      name: ADDON_PRODUCT_NAME,
      description: ADDON_DESCRIPTION,
    });
  }
  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 100,
  });
  const existing = prices.data.find(
    (p) =>
      p.recurring?.interval === MEMBERSHIP_INTERVAL &&
      p.unit_amount === ADDON_AMOUNT &&
      p.currency === MEMBERSHIP_CURRENCY,
  );
  if (existing) return existing;
  return stripe.prices.create({
    product: product.id,
    unit_amount: ADDON_AMOUNT,
    currency: MEMBERSHIP_CURRENCY,
    recurring: { interval: MEMBERSHIP_INTERVAL },
  });
}

// The account's active membership subscription, identified by carrying the base
// membership price. Returns null if the account has no live membership.
async function findMembershipSubscription(
  stripe: Stripe,
  customerId: string,
  basePriceId: string,
): Promise<Stripe.Subscription | null> {
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
    limit: 100,
  });
  const withBase = subs.data.find((s) =>
    s.items.data.some((i) => i.price.id === basePriceId),
  );
  // Only ever touch the subscription that actually carries the base membership
  // price. Never fall back to an arbitrary subscription — for a customer with
  // more than one active subscription that would risk mutating the wrong one.
  return withBase ?? null;
}

// Set the add-on item quantity to `quantity` on the membership subscription and
// invoice the proration immediately (proration_behavior:"always_invoice"), so
// the user is charged the prorated remainder of the year now and the full
// add-on total renews with the membership. Throws if Stripe rejects the change
// or the immediate payment fails — callers must not record the unlock then.
async function chargeAddonQuantity(
  stripe: Stripe,
  customerId: string,
  quantity: number,
  log: Logger,
): Promise<void> {
  const basePrice = await getOrCreateMembershipPrice(stripe);
  const sub = await findMembershipSubscription(stripe, customerId, basePrice.id);
  if (!sub) throw new Error("no active membership subscription to add to");
  const addonPrice = await getOrCreateAddonPrice(stripe);
  const addonItem = sub.items.data.find((i) => i.price.id === addonPrice.id);
  await stripe.subscriptions.update(sub.id, {
    items: [
      addonItem
        ? { id: addonItem.id, quantity }
        : { price: addonPrice.id, quantity },
    ],
    proration_behavior: "always_invoice",
    // Fail closed: if the prorated invoice can't be collected synchronously
    // (declined card, requires action, etc.) Stripe raises instead of leaving
    // the subscription updated with an unpaid invoice. The caller treats the
    // throw as AddonChargeFailedError and never records the unlock.
    payment_behavior: "error_if_incomplete",
  });
  log.info(
    { customerId, subscriptionId: sub.id, quantity },
    "charged prorated researcher add-on",
  );
}

// Sanitize an OpenAlex author id before embedding it in the redirect URLs:
// keep only the canonical `A` + digits form so a tampered value can't inject
// extra query params or otherwise rewrite the success/cancel URL.
function sanitizeAuthorId(author: string | null | undefined): string | null {
  if (!author) return null;
  const trimmed = author.trim();
  return /^A\d+$/.test(trimmed) ? trimmed : null;
}

export async function createCheckout(
  userId: string,
  origin: string,
  log: Logger,
  author?: string | null,
): Promise<CheckoutResult> {
  const email = await fetchClerkEmail(userId);
  const user = await getOrCreateUser(userId, email);
  if (user.hasPaid) return { alreadyEntitled: true };

  const stripe = await getUncachableStripeClient();
  const customerId = await ensureCustomer(stripe, user);
  const price = await getOrCreateMembershipPrice(stripe);

  // Carry the explored scientist through the Stripe round-trip so the user lands
  // back on the galaxy they paid to unlock, not the default home scientist.
  const authorId = sanitizeAuthorId(author);
  const authorParam = authorId ? `author=${authorId}&` : "";

  // Carry the author in metadata too so the first researcher is auto-unlocked
  // (within the included slots) when the membership is granted — both on the
  // success-redirect confirm and via the webhook for buyers who never return.
  const meta: Record<string, string> = { userId };
  if (authorId) meta.author = authorId;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: price.id, quantity: 1 }],
    success_url: `${origin}/?${authorParam}unlocked=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?${authorParam}unlock_cancelled=1`,
    metadata: meta,
    subscription_data: { metadata: meta },
  });

  log.info(
    { userId, sessionId: session.id },
    "created membership checkout session",
  );
  return { alreadyEntitled: false, url: session.url };
}

// Member-only: unlock a researcher for the account. The first
// INCLUDED_UNLOCK_SLOTS are free (included in the base membership); each one
// beyond that bumps the recurring add-on quantity and is charged immediately
// with proration BEFORE the unlock is recorded — so a declined card never
// grants a free slot. Idempotent: re-unlocking an already-unlocked researcher
// is a no-op and never charges.
export async function unlockResearcher(
  userId: string,
  author: string,
  log: Logger,
): Promise<EntitlementResult> {
  const authorId = sanitizeAuthorId(author);
  if (!authorId) throw new InvalidAuthorError();

  // Serialize all unlock accounting for this account: a per-user advisory lock
  // held for the surrounding transaction means two concurrent unlocks for
  // different researchers can't both read the same slot count and bump the
  // add-on quantity to the same value (which would record two unlocks while
  // only charging for one). Same-user unlocks are rare, so holding the lock
  // across the Stripe call is acceptable; it only blocks the same account.
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);

    const [user] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!user?.hasPaid) throw new NotAMemberError();

    const rows = await tx
      .select({ authorId: researcherUnlocksTable.authorId })
      .from(researcherUnlocksTable)
      .where(eq(researcherUnlocksTable.userId, userId))
      .orderBy(researcherUnlocksTable.createdAt);
    const unlocked = rows.map((r) => r.authorId);

    const baseResult: EntitlementResult = {
      entitled: true,
      email: user.email ?? null,
      includedSlots: INCLUDED_UNLOCK_SLOTS,
      unlocked,
    };
    if (unlocked.includes(authorId)) return baseResult;

    const newCount = unlocked.length + 1;
    if (newCount > INCLUDED_UNLOCK_SLOTS) {
      const addonQuantity = newCount - INCLUDED_UNLOCK_SLOTS;
      if (!user.stripeCustomerId) {
        throw new AddonChargeFailedError("No payment method on file.");
      }
      const stripe = await getUncachableStripeClient();
      try {
        await chargeAddonQuantity(
          stripe,
          user.stripeCustomerId,
          addonQuantity,
          log,
        );
      } catch (err) {
        // Re-throw as AddonChargeFailedError so the transaction rolls back and
        // the unlock is never recorded when the prorated charge fails.
        log.warn({ err, userId, authorId }, "researcher add-on charge failed");
        throw new AddonChargeFailedError(
          "We couldn't charge the add-on for this researcher.",
        );
      }
    }

    await tx
      .insert(researcherUnlocksTable)
      .values({ userId, authorId })
      .onConflictDoNothing();
    log.info({ userId, authorId }, "researcher unlocked");

    return { ...baseResult, unlocked: [...unlocked, authorId] };
  });
}

async function markPaid(userId: string): Promise<void> {
  await db
    .insert(usersTable)
    .values({ id: userId, hasPaid: true })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: { hasPaid: true },
    });
}

async function markUnpaid(userId: string): Promise<void> {
  await db
    .update(usersTable)
    .set({ hasPaid: false })
    .where(eq(usersTable.id, userId));
}

async function userIdForStripeCustomer(
  customerId: string,
): Promise<string | null> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.stripeCustomerId, customerId));
  return user?.id ?? null;
}

// Authoritative confirmation on the success redirect: verify the session
// directly against Stripe (not the synced cache) and grant the unlock only if
// it is paid and owned by this account.
export async function confirmCheckout(
  userId: string,
  sessionId: string,
  log: Logger,
): Promise<EntitlementResult> {
  const stripe = await getUncachableStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (
    session.payment_status === "paid" &&
    session.metadata?.userId === userId
  ) {
    await markPaid(userId);
    // Auto-unlock the researcher carried through checkout as the member's first
    // (included) slot, so they land on the galaxy they paid to access.
    const author = sanitizeAuthorId(session.metadata?.author);
    if (author) await recordUnlock(userId, author);
    log.info({ userId, sessionId }, "membership confirmed and granted");
  }
  return getEntitlement(userId);
}

// Best-effort membership sync straight from the webhook, covering buyers who
// never return to the success URL and members whose subscription later lapses.
// The signature is already verified by StripeSync.processWebhook before this
// runs, so the parsed payload is trusted.
export async function markUnlockedFromWebhook(
  payload: Buffer,
  log: Logger,
): Promise<void> {
  try {
    const event = JSON.parse(payload.toString("utf8")) as {
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
    const obj = event.data?.object ?? {};

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const metadata = obj.metadata as
        | { userId?: string; author?: string }
        | undefined;
      const userId = metadata?.userId;
      // Only grant once funds have actually settled. A session can reach
      // status="complete" before payment_status flips to "paid" for some
      // payment methods, so we key strictly on payment_status here (the
      // delayed-settlement case arrives via async_payment_succeeded).
      const paid = obj.payment_status === "paid";
      if (userId && paid) {
        await markPaid(userId);
        const author = sanitizeAuthorId(metadata?.author);
        if (author) await recordUnlock(userId, author);
        log.info({ userId }, "membership granted via webhook");
      }
      return;
    }

    // Revoke access when the yearly subscription ends or fully lapses. Stay
    // lenient on transient states (e.g. past_due retries); only clear the flag
    // on terminal statuses or outright deletion.
    if (
      event.type === "customer.subscription.deleted" ||
      event.type === "customer.subscription.updated"
    ) {
      const status = obj.status as string | undefined;
      const ended =
        event.type === "customer.subscription.deleted" ||
        status === "canceled" ||
        status === "unpaid" ||
        status === "incomplete_expired";
      if (!ended) return;
      const metadata = obj.metadata as { userId?: string } | undefined;
      const customer =
        typeof obj.customer === "string" ? obj.customer : undefined;
      const userId =
        metadata?.userId ??
        (customer ? await userIdForStripeCustomer(customer) : null);
      if (userId) {
        await markUnpaid(userId);
        log.info({ userId, status }, "membership revoked via webhook");
      }
    }
  } catch (err) {
    log.warn({ err }, "failed to process membership change from webhook");
  }
}
