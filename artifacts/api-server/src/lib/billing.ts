import type Stripe from "stripe";
import type { Logger } from "pino";
import { eq } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";
import { clerkClient } from "@clerk/express";
import { getUncachableStripeClient } from "./stripeClient";

// Account-level membership: a $10/year subscription grants full exploration of
// ANY searched scientist plus member-only features (Ask Cosmo, every new
// feature as it ships). We model it as a boolean on the user (hasPaid = active
// member), flipped on checkout/renewal and cleared when the subscription ends.
const MEMBERSHIP_PRODUCT_NAME = "Cosmograph — Full Access";
const MEMBERSHIP_DESCRIPTION =
  "Yearly membership: fully explore any researcher's galaxy — guided tour, spaceship fly-through, rich paper detail, and Ask Cosmo — plus every new feature as it ships.";
const MEMBERSHIP_AMOUNT = 1000; // $10.00 / year in cents
const MEMBERSHIP_CURRENCY = "usd";
const MEMBERSHIP_INTERVAL = "year" as const;

export interface EntitlementResult {
  entitled: boolean;
  email: string | null;
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

// Pure read used by GET /me/entitlement. Never touches Stripe, so it keeps
// working (returning the cached unlock flag) even if Stripe is unreachable.
export async function getEntitlement(
  userId: string,
): Promise<EntitlementResult> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return {
    entitled: user?.hasPaid ?? false,
    email: user?.email ?? null,
  };
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

export async function createCheckout(
  userId: string,
  origin: string,
  log: Logger,
): Promise<CheckoutResult> {
  const email = await fetchClerkEmail(userId);
  const user = await getOrCreateUser(userId, email);
  if (user.hasPaid) return { alreadyEntitled: true };

  const stripe = await getUncachableStripeClient();
  const customerId = await ensureCustomer(stripe, user);
  const price = await getOrCreateMembershipPrice(stripe);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: price.id, quantity: 1 }],
    success_url: `${origin}/?unlocked=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?unlock_cancelled=1`,
    metadata: { userId },
    subscription_data: { metadata: { userId } },
  });

  log.info(
    { userId, sessionId: session.id },
    "created membership checkout session",
  );
  return { alreadyEntitled: false, url: session.url };
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
    log.info({ userId, sessionId }, "unlock confirmed and granted");
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
      const metadata = obj.metadata as { userId?: string } | undefined;
      const userId = metadata?.userId;
      // Only grant once funds have actually settled. A session can reach
      // status="complete" before payment_status flips to "paid" for some
      // payment methods, so we key strictly on payment_status here (the
      // delayed-settlement case arrives via async_payment_succeeded).
      const paid = obj.payment_status === "paid";
      if (userId && paid) {
        await markPaid(userId);
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
