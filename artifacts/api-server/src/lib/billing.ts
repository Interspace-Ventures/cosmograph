import type Stripe from "stripe";
import type { Logger } from "pino";
import { eq } from "drizzle-orm";
import {
  db,
  usersTable,
  researcherUnlocksTable,
  stripeEventsTable,
  type User,
} from "@workspace/db";
import { clerkClient } from "@clerk/express";
import { getUncachableStripeClient } from "./stripeClient";
import { DailyBudget, envInt } from "./spendGuard";

// Cosmograph membership (launch model):
//   annual    $9.99 / year, auto-renews, cancel anytime in the Stripe portal
//   lifetime  $29.99 once
// Exploring any galaxy is free; membership unlocks publishing/gifting features.
//
// Trust model:
//   * Prices are created ONCE by scripts/stripe-setup.mjs (lookup keys below)
//     and only ever READ at runtime, and refused unless the amount/interval
//     match. The server never creates or edits prices, so a bug or a crafted
//     request can't sell membership for $0.
//   * Membership is granted only from (a) a signature-verified Stripe webhook or
//     (b) the success-redirect confirm, which re-fetches the session from Stripe
//     and checks it belongs to the caller. The browser never asserts payment.
//   * Every webhook event id is recorded; replays and duplicates are no-ops.
//   * Lapse, full refund, and chargeback all revoke `hasPaid`. Published
//     galaxies stay live (enforced by the publishing feature); extras stop.

export type MemberPlan = "annual" | "lifetime";

export const PRICE_LOOKUP_KEYS: Record<MemberPlan, string> = {
  annual: "cosmograph_member_annual_v1",
  lifetime: "cosmograph_member_lifetime_v1",
};

/** Expected amounts (cents). A price that doesn't match is refused. */
export const PLAN_AMOUNTS: Record<MemberPlan, number> = {
  annual: 999,
  lifetime: 2999,
};

// Kept for API compatibility with the existing client copy. Membership no
// longer meters researchers; MAX_MEMBER_UNLOCKS is only an abuse bound.
export const INCLUDED_UNLOCK_SLOTS = 3;
const MAX_MEMBER_UNLOCKS = 100;

const checkoutBudget = new DailyBudget({
  perClient: envInt("CHECKOUT_DAILY_PER_USER", 20),
  global: envInt("CHECKOUT_DAILY_GLOBAL", 5000),
});

export class InvalidAuthorError extends Error {
  constructor() {
    super("A valid researcher id is required.");
    this.name = "InvalidAuthorError";
  }
}
export class NotAMemberError extends Error {
  constructor() {
    super("An active membership is required.");
    this.name = "NotAMemberError";
  }
}
export class AddonChargeFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AddonChargeFailedError";
  }
}
export class CheckoutLimitError extends Error {
  constructor() {
    super("Too many checkout attempts today. Please try again tomorrow.");
    this.name = "CheckoutLimitError";
  }
}
export class BillingUnavailableError extends Error {
  constructor(message = "Checkout is unavailable right now.") {
    super(message);
    this.name = "BillingUnavailableError";
  }
}

export interface EntitlementResult {
  entitled: boolean;
  email: string | null;
  includedSlots: number;
  unlocked: string[];
  plan: MemberPlan | null;
  status: string | null;
  memberUntil: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface CheckoutResult {
  alreadyEntitled: boolean;
  url?: string | null;
}

// ---------------------------------------------------------------- users

export async function fetchClerkEmail(userId: string): Promise<string | null> {
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

export async function getOrCreateUser(
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
  await db.insert(usersTable).values({ id: userId, email }).onConflictDoNothing();
  const [row] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  return row;
}

async function listUnlockedAuthors(userId: string): Promise<string[]> {
  const rows = await db
    .select({ authorId: researcherUnlocksTable.authorId })
    .from(researcherUnlocksTable)
    .where(eq(researcherUnlocksTable.userId, userId))
    .orderBy(researcherUnlocksTable.createdAt);
  return rows.map((r) => r.authorId);
}

function toEntitlement(user: User | undefined, unlocked: string[]): EntitlementResult {
  return {
    entitled: user?.hasPaid ?? false,
    email: user?.email ?? null,
    includedSlots: INCLUDED_UNLOCK_SLOTS,
    unlocked,
    plan: (user?.memberPlan as MemberPlan | null) ?? null,
    status: user?.memberStatus ?? null,
    memberUntil: user?.memberUntil ? user.memberUntil.toISOString() : null,
    cancelAtPeriodEnd: user?.cancelAtPeriodEnd ?? false,
  };
}

/** Pure read; never touches Stripe. */
export async function getEntitlement(userId: string): Promise<EntitlementResult> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  return toEntitlement(user, await listUnlockedAuthors(userId));
}

async function recordUnlock(userId: string, authorId: string): Promise<void> {
  await db
    .insert(researcherUnlocksTable)
    .values({ userId, authorId })
    .onConflictDoNothing();
}

export function sanitizeAuthorId(author: string | null | undefined): string | null {
  if (!author) return null;
  const trimmed = author.trim();
  return /^A\d{1,15}$/.test(trimmed) ? trimmed : null;
}

/** Members pin researchers to their account; no per-researcher charge. */
export async function unlockResearcher(
  userId: string,
  author: string,
  log: Logger,
): Promise<EntitlementResult> {
  const authorId = sanitizeAuthorId(author);
  if (!authorId) throw new InvalidAuthorError();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.hasPaid) throw new NotAMemberError();
  const unlocked = await listUnlockedAuthors(userId);
  if (!unlocked.includes(authorId)) {
    if (unlocked.length >= MAX_MEMBER_UNLOCKS) {
      throw new AddonChargeFailedError("You've reached the researcher limit for one account.");
    }
    await recordUnlock(userId, authorId);
    log.info({ userId, authorId }, "researcher pinned");
    unlocked.push(authorId);
  }
  return toEntitlement(user, unlocked);
}

// ---------------------------------------------------------------- stripe helpers

export async function ensureCustomer(stripe: Stripe, user: User): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const email = user.email ?? (await fetchClerkEmail(user.id)) ?? undefined;
  const customer = await stripe.customers.create(
    { email, metadata: { userId: user.id } },
    { idempotencyKey: `cosmograph-customer-${user.id}` },
  );
  await db
    .update(usersTable)
    .set({ stripeCustomerId: customer.id, email: email ?? user.email })
    .where(eq(usersTable.id, user.id));
  return customer.id;
}

const priceCache = new Map<MemberPlan, { id: string; at: number }>();

/** Validate a Stripe price against the plan it is supposed to be. */
export function priceMatchesPlan(price: Stripe.Price, plan: MemberPlan): boolean {
  const recurringOk =
    plan === "annual"
      ? price.recurring?.interval === "year" && price.recurring.interval_count === 1
      : !price.recurring;
  return (
    price.active &&
    price.unit_amount === PLAN_AMOUNTS[plan] &&
    price.currency === "usd" &&
    recurringOk
  );
}

/** Read-only price lookup by lookup key; refuses a price with the wrong terms. */
export async function resolvePrice(stripe: Stripe, plan: MemberPlan): Promise<string> {
  const cached = priceCache.get(plan);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.id;
  const price = (
    await stripe.prices.list({ lookup_keys: [PRICE_LOOKUP_KEYS[plan]], active: true, limit: 1 })
  ).data[0];
  if (!price) throw new BillingUnavailableError("Membership pricing is not configured.");
  if (!priceMatchesPlan(price, plan)) {
    throw new BillingUnavailableError("Membership pricing is misconfigured.");
  }
  priceCache.set(plan, { id: price.id, at: Date.now() });
  return price.id;
}

// ---------------------------------------------------------------- checkout

export const RENEWAL_NOTICE =
  "Renews automatically every year at $9.99 until you cancel. Cancel anytime from your account. We'll email you before each renewal.";

export async function createCheckout(
  userId: string,
  plan: MemberPlan,
  origin: string,
  log: Logger,
  author?: string | null,
): Promise<CheckoutResult> {
  const email = await fetchClerkEmail(userId);
  const user = await getOrCreateUser(userId, email);
  // Members can only move up (annual -> lifetime); nothing else to buy.
  if (user.hasPaid && (user.memberPlan === "lifetime" || plan === "annual")) {
    return { alreadyEntitled: true };
  }
  if (!checkoutBudget.take(userId).ok) throw new CheckoutLimitError();

  const stripe = await getUncachableStripeClient();
  const price = await resolvePrice(stripe, plan);
  const customerId = await ensureCustomer(stripe, user);

  const authorId = sanitizeAuthorId(author);
  const authorParam = authorId ? `author=${authorId}&` : "";
  const meta: Record<string, string> = { userId, kind: "membership", plan };
  if (authorId) meta.author = authorId;

  const base: Stripe.Checkout.SessionCreateParams = {
    customer: customerId,
    client_reference_id: userId,
    line_items: [{ price, quantity: 1 }],
    success_url: `${origin}/?${authorParam}unlocked=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?${authorParam}unlock_cancelled=1`,
    metadata: meta,
    allow_promotion_codes: false,
    // Short-lived sessions: a leaked or stale link can't be reused later.
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  };
  if (process.env.STRIPE_AUTOMATIC_TAX === "true") {
    base.automatic_tax = { enabled: true };
    base.customer_update = { address: "auto", name: "auto" };
  }

  const session = await stripe.checkout.sessions.create(
    plan === "annual"
      ? {
          ...base,
          mode: "subscription",
          subscription_data: { metadata: meta },
          custom_text: { submit: { message: RENEWAL_NOTICE } },
        }
      : {
          ...base,
          mode: "payment",
          payment_intent_data: { metadata: meta },
          invoice_creation: { enabled: true, invoice_data: { metadata: meta } },
          custom_text: {
            submit: { message: "One payment. Membership for as long as Cosmograph exists." },
          },
        },
  );
  log.info({ userId, plan, sessionId: session.id }, "created membership checkout session");
  return { alreadyEntitled: false, url: session.url };
}

/** Stripe customer portal: cancel, update card, download invoices. */
export async function createPortalSession(userId: string, origin: string): Promise<string> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.stripeCustomerId) throw new NotAMemberError();
  const stripe = await getUncachableStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}/`,
  });
  return session.url;
}

// ---------------------------------------------------------------- granting

function periodEnd(sub: Stripe.Subscription): Date | null {
  // Newer API versions moved current_period_end onto subscription items.
  const fromItem = (sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined)
    ?.current_period_end;
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  const ts = fromItem ?? legacy;
  return ts ? new Date(ts * 1000) : null;
}

async function userIdFor(
  meta: Stripe.Metadata | null | undefined,
  customer: unknown,
): Promise<string | null> {
  const customerId =
    typeof customer === "string" ? customer : (customer as { id?: string } | null)?.id;
  if (customerId) {
    // Prefer our own customer mapping over metadata: metadata on objects we
    // didn't create could name any account.
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.stripeCustomerId, customerId));
    if (user) return user.id;
  }
  return meta?.userId ?? null;
}

async function grantLifetime(
  userId: string,
  paymentIntentId: string | null,
  log: Logger,
): Promise<void> {
  const now = new Date();
  const [prev] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  await db
    .insert(usersTable)
    .values({
      id: userId,
      hasPaid: true,
      memberPlan: "lifetime",
      memberStatus: "active",
      memberUntil: null,
      memberSince: now,
      cancelAtPeriodEnd: false,
      lifetimePaymentIntentId: paymentIntentId,
    })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        hasPaid: true,
        memberPlan: "lifetime",
        memberStatus: "active",
        memberUntil: null,
        cancelAtPeriodEnd: false,
        lifetimePaymentIntentId: paymentIntentId,
        memberSince: prev?.memberSince ?? now,
      },
    });
  // Upgrading from annual: stop the renewal so they're never charged again.
  if (prev?.stripeSubscriptionId) {
    try {
      const stripe = await getUncachableStripeClient();
      await stripe.subscriptions.update(prev.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    } catch (err) {
      log.warn({ err, userId }, "could not stop annual renewal after lifetime upgrade");
    }
  }
  log.info({ userId }, "lifetime membership granted");
}

/** Apply a subscription's current state to its member. */
async function syncSubscription(sub: Stripe.Subscription, log: Logger): Promise<void> {
  const userId = await userIdFor(sub.metadata, sub.customer);
  if (!userId) {
    log.warn({ subscription: sub.id }, "subscription without a known user");
    return;
  }
  const [prev] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  // A lifetime member's old annual subscription ending changes nothing.
  if (prev?.memberPlan === "lifetime" && prev.hasPaid) return;
  // A refunded/disputed account stays revoked even if Stripe later reports the
  // subscription (we cancel it ourselves when revoking).
  if (prev && (prev.memberStatus === "refunded" || prev.memberStatus === "disputed") && sub.status !== "active") return;

  // Grace on past_due (Stripe retries the card); revoke on terminal states.
  const active =
    sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
  const status = !active ? "canceled" : sub.status === "past_due" ? "past_due" : "active";
  const now = new Date();
  await db
    .insert(usersTable)
    .values({
      id: userId,
      hasPaid: active,
      memberPlan: "annual",
      memberStatus: status,
      memberUntil: periodEnd(sub),
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      stripeSubscriptionId: sub.id,
      memberSince: active ? now : null,
    })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        hasPaid: active,
        memberPlan: "annual",
        memberStatus: status,
        memberUntil: periodEnd(sub),
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
        stripeSubscriptionId: sub.id,
        memberSince: prev?.memberSince ?? (active ? now : null),
      },
    });
  log.info({ userId, status: sub.status }, "annual membership synced");
}

async function revoke(userId: string, status: "refunded" | "disputed", log: Logger): Promise<void> {
  await db
    .update(usersTable)
    .set({ hasPaid: false, memberStatus: status, cancelAtPeriodEnd: false })
    .where(eq(usersTable.id, userId));
  log.warn({ userId, status }, "membership revoked");
}

/** Grant from a paid Checkout Session (webhook or confirm). Idempotent. */
async function grantFromSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  log: Logger,
): Promise<string | null> {
  const meta = session.metadata ?? {};
  if (meta.kind !== "membership") return null;
  const userId = meta.userId;
  if (!userId || session.client_reference_id !== userId) {
    log.warn({ session: session.id }, "membership session without matching user");
    return null;
  }
  if (session.payment_status !== "paid") return null;
  const plan: MemberPlan = meta.plan === "lifetime" ? "lifetime" : "annual";
  if (plan === "lifetime") {
    if (session.mode !== "payment" || (session.amount_subtotal ?? 0) < PLAN_AMOUNTS.lifetime) {
      log.error({ session: session.id }, "lifetime session amount/mode mismatch; not granting");
      return null;
    }
    const pi =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;
    await grantLifetime(userId, pi, log);
  } else {
    if (session.mode !== "subscription" || !session.subscription) return null;
    const subId =
      typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    await syncSubscription(await stripe.subscriptions.retrieve(subId), log);
  }
  const author = sanitizeAuthorId(meta.author);
  if (author) await recordUnlock(userId, author);
  return userId;
}

/** Success-redirect confirm: re-fetch from Stripe, require it's the caller's. */
export async function confirmCheckout(
  userId: string,
  sessionId: string,
  log: Logger,
): Promise<EntitlementResult> {
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sessionId)) return getEntitlement(userId);
  const stripe = await getUncachableStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.userId === userId && session.client_reference_id === userId) {
    await grantFromSession(stripe, session, log);
  }
  return getEntitlement(userId);
}

// ---------------------------------------------------------------- webhook

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.refunded",
  "charge.dispute.created",
] as const;

/**
 * Apply one signature-verified event exactly once. Returns false when the event
 * was already processed. On failure the event record is removed and the error
 * rethrown, so Stripe retries it.
 */
export async function handleStripeEvent(
  event: Stripe.Event,
  log: Logger,
  onOtherCheckout?: (session: Stripe.Checkout.Session) => Promise<void>,
): Promise<boolean> {
  const inserted = await db
    .insert(stripeEventsTable)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing()
    .returning({ id: stripeEventsTable.id });
  if (inserted.length === 0) {
    log.info({ eventId: event.id }, "duplicate stripe event ignored");
    return false;
  }
  try {
    const stripe = await getUncachableStripeClient();
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.kind === "membership") await grantFromSession(stripe, session, log);
        else if (onOtherCheckout) await onOtherCheckout(session);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        // Events can arrive out of order; the live object is the truth.
        const sub = event.data.object as Stripe.Subscription;
        const live = await stripe.subscriptions.retrieve(sub.id).catch(() => sub);
        await syncSubscription(live, log);
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        if (!charge.refunded) break; // partial refund: membership stays
        const userId = await userIdFor(charge.metadata, charge.customer);
        if (!userId) break;
        const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
        const pi =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
        if (user?.memberPlan === "lifetime" && pi && pi === user.lifetimePaymentIntentId) {
          await revoke(userId, "refunded", log);
        } else if (user?.memberPlan === "annual" && user.stripeSubscriptionId) {
          await stripe.subscriptions.cancel(user.stripeSubscriptionId).catch(() => undefined);
          await revoke(userId, "refunded", log);
        }
        break;
      }
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const charge =
          typeof dispute.charge === "string"
            ? await stripe.charges.retrieve(dispute.charge)
            : dispute.charge;
        const userId = await userIdFor(charge.metadata, charge.customer);
        if (!userId) break;
        const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
        if (user?.stripeSubscriptionId) {
          await stripe.subscriptions.cancel(user.stripeSubscriptionId).catch(() => undefined);
        }
        await revoke(userId, "disputed", log);
        break;
      }
      default:
        break;
    }
    return true;
  } catch (err) {
    await db.delete(stripeEventsTable).where(eq(stripeEventsTable.id, event.id));
    throw err;
  }
}
