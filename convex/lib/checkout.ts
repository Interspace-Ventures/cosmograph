import type Stripe from "stripe";
import {
  CHECKOUT_SESSION_TTL_SECONDS,
  LIFETIME_NOTICE,
  PLAN_AMOUNTS,
  RENEWAL_NOTICE,
  billingError,
  checkoutReturnUrls,
  isAllowedOrigin,
  safeReturnPath,
  type BillingConfig,
  type MemberPlan,
} from "./billingConfig";
import type { StripeLike } from "./stripeLike";

/**
 * Checkout and portal session creation for the Node action, ported from PR
 * #12's createCheckout/createPortalSession. Prices are pre-existing Price ids
 * from config and only ever READ (and refused unless amount, currency and
 * interval match); nothing here can create or edit a price.
 */

export type CheckoutArgs = {
  subject: string;
  email?: string;
  plan: MemberPlan;
  origin: string;
  returnPath: string;
  author?: string;
  ship?: string;
};

export type PrepareResult =
  | { alreadyEntitled: true }
  | { alreadyEntitled: false; stripeCustomerId?: string; email?: string };

export interface CheckoutDeps {
  cfg: BillingConfig;
  /** billingInternal.prepareCheckout: entitlement check + budget (fails closed). */
  prepare(args: { subject: string; email?: string; plan: MemberPlan }): Promise<PrepareResult>;
  saveCustomer(args: { subject: string; customerId: string }): Promise<null | void>;
  stripe(): Promise<StripeLike>;
  now(): number;
}

const PRICE_CACHE_MS = 10 * 60_000;
const verifiedPrices = new Map<string, number>();

export function clearPriceCache(): void {
  verifiedPrices.clear();
}

/** #12's priceMatchesPlan, plus the id must be the configured one. */
export function priceMatchesPlan(
  price: Pick<Stripe.Price, "id" | "active" | "unit_amount" | "currency" | "recurring">,
  plan: MemberPlan,
  expectedId: string,
): boolean {
  const recurringOk =
    plan === "annual"
      ? price.recurring?.interval === "year" && price.recurring.interval_count === 1
      : !price.recurring;
  return (
    price.id === expectedId &&
    price.active &&
    price.unit_amount === PLAN_AMOUNTS[plan] &&
    price.currency === "usd" &&
    recurringOk
  );
}

export async function verifyPrice(
  stripe: StripeLike,
  plan: MemberPlan,
  priceId: string,
  now: number,
): Promise<void> {
  const at = verifiedPrices.get(priceId);
  if (at !== undefined && now - at < PRICE_CACHE_MS) return;
  const price = await stripe.prices.retrieve(priceId);
  if (!priceMatchesPlan(price, plan, priceId)) {
    console.error(`billing: configured ${plan} price does not match its plan; refusing checkout`);
    throw billingError("BILLING_UNAVAILABLE", "Membership pricing is misconfigured.");
  }
  verifiedPrices.set(priceId, now);
}

export function buildCheckoutParams(o: {
  plan: MemberPlan;
  priceId: string;
  customerId: string;
  subject: string;
  origin: string;
  returnPath: string;
  author?: string;
  ship?: string;
  nowMs: number;
  automaticTax: boolean;
}): Stripe.Checkout.SessionCreateParams {
  const urls = checkoutReturnUrls(o.origin, o.returnPath, o.author);
  const metadata: Record<string, string> = {
    exoSubject: o.subject,
    kind: "membership",
    plan: o.plan,
  };
  if (o.author) metadata.author = o.author;
  if (o.ship) metadata.ship = o.ship;
  const base: Stripe.Checkout.SessionCreateParams = {
    customer: o.customerId,
    client_reference_id: o.subject,
    line_items: [{ price: o.priceId, quantity: 1 }],
    success_url: urls.success,
    cancel_url: urls.cancel,
    metadata,
    allow_promotion_codes: false,
    // Short-lived sessions: a leaked or stale link can't be reused later.
    expires_at: Math.floor(o.nowMs / 1000) + CHECKOUT_SESSION_TTL_SECONDS,
  };
  if (o.automaticTax) {
    base.automatic_tax = { enabled: true };
    base.customer_update = { address: "auto", name: "auto" };
  }
  return o.plan === "annual"
    ? {
        ...base,
        mode: "subscription",
        subscription_data: { metadata },
        custom_text: { submit: { message: RENEWAL_NOTICE } },
      }
    : {
        ...base,
        mode: "payment",
        payment_intent_data: { metadata },
        invoice_creation: { enabled: true, invoice_data: { metadata } },
        custom_text: { submit: { message: LIFETIME_NOTICE } },
      };
}

export async function runCheckout(
  args: CheckoutArgs,
  deps: CheckoutDeps,
): Promise<{ alreadyEntitled: boolean; url?: string }> {
  // Defense in depth: the HTTP layer already checked both.
  const returnPath = safeReturnPath(args.returnPath);
  if (!isAllowedOrigin(args.origin, deps.cfg.origins) || returnPath === null) {
    throw billingError("BILLING_UNAVAILABLE");
  }
  const prep = await deps.prepare({
    subject: args.subject,
    plan: args.plan,
    ...(args.email ? { email: args.email } : {}),
  });
  // Members can only move up (annual -> lifetime); nothing else to buy.
  if (prep.alreadyEntitled) return { alreadyEntitled: true };

  const stripe = await deps.stripe();
  const priceId = deps.cfg.priceIds[args.plan];
  await verifyPrice(stripe, args.plan, priceId, deps.now());

  let customerId = prep.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create(
      { ...(prep.email ? { email: prep.email } : {}), metadata: { exoSubject: args.subject } },
      { idempotencyKey: `cosmograph-customer-${args.subject}` },
    );
    customerId = customer.id;
    await deps.saveCustomer({ subject: args.subject, customerId });
  }

  const session = await stripe.checkout.sessions.create(
    buildCheckoutParams({
      plan: args.plan,
      priceId,
      customerId,
      subject: args.subject,
      origin: args.origin,
      returnPath,
      author: args.author,
      ship: args.ship,
      nowMs: deps.now(),
      automaticTax: deps.cfg.automaticTax,
    }),
  );
  if (!session.url) throw billingError("BILLING_UNAVAILABLE");
  console.log(`billing: created ${args.plan} checkout session`);
  return { alreadyEntitled: false, url: session.url };
}

/** Stripe customer portal (#12): cancel, update card, download invoices. */
export async function runPortal(
  args: { subject: string; origin: string; returnPath: string },
  deps: {
    cfg: BillingConfig;
    prepare(args: { subject: string }): Promise<{ customerId: string }>;
    stripe(): Promise<StripeLike>;
  },
): Promise<{ url: string }> {
  const returnPath = safeReturnPath(args.returnPath);
  if (!isAllowedOrigin(args.origin, deps.cfg.origins) || returnPath === null) {
    throw billingError("BILLING_UNAVAILABLE");
  }
  const { customerId } = await deps.prepare({ subject: args.subject });
  const stripe = await deps.stripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${args.origin}${returnPath}`,
  });
  return { url: session.url };
}
