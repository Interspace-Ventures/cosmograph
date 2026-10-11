#!/usr/bin/env node
// One-time (idempotent) Stripe setup for Cosmograph membership.
//
//   STRIPE_SECRET_KEY=sk_test_... pnpm --filter @workspace/api-server run stripe:setup -- [--webhook https://app.cosmograph.space/api/stripe/webhook]
//
// Creates, if missing:
//   * product "Cosmograph Membership"
//   * price lookup_key cosmograph_member_annual_v1    $9.99 / year
//   * price lookup_key cosmograph_member_lifetime_v1  $29.99 once
//   * (with --webhook) a webhook endpoint for the events the server handles,
//     printing its signing secret ONCE so it can go straight into Railway.
//   * a customer-portal configuration allowing cancel + payment-method updates.
//
// The server only READS these prices and refuses any whose amount/interval
// don't match, so running this is the only way prices change.
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key) {
  console.error("STRIPE_SECRET_KEY is required");
  process.exit(1);
}
const stripe = new Stripe(key);
const live = key.startsWith("sk_live_") || key.startsWith("rk_live_");
const webhookUrl = (() => {
  const i = process.argv.indexOf("--webhook");
  return i > 0 ? process.argv[i + 1] : null;
})();

const EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.refunded",
  "charge.dispute.created",
];

async function product() {
  const found = await stripe.products.search({
    query: "metadata['cosmograph_membership']:'v1' AND active:'true'",
  });
  if (found.data[0]) return found.data[0];
  return stripe.products.create({
    name: "Cosmograph Membership",
    description:
      "Turn any researcher's galaxy into a gift: their name, a personal cosmograph.space link, a guided journey, data corrections, unwatermarked share cards, every ship, and every new release.",
    metadata: { cosmograph_membership: "v1" },
    tax_code: "txcd_10000000", // general electronically supplied services
  });
}

async function price(productId, lookupKey, amount, recurring) {
  const existing = (await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 })).data[0];
  if (existing) {
    const ok =
      existing.unit_amount === amount &&
      existing.currency === "usd" &&
      (recurring ? existing.recurring?.interval === "year" : !existing.recurring);
    if (!ok) throw new Error(`${lookupKey} exists with different terms; create a _v2 key instead of editing.`);
    return existing;
  }
  return stripe.prices.create({
    product: productId,
    lookup_key: lookupKey,
    unit_amount: amount,
    currency: "usd",
    tax_behavior: "exclusive",
    ...(recurring ? { recurring: { interval: "year" } } : {}),
    metadata: { cosmograph_membership: "v1" },
  });
}

const p = await product();
const annual = await price(p.id, "cosmograph_member_annual_v1", 999, true);
const lifetime = await price(p.id, "cosmograph_member_lifetime_v1", 2999, false);
console.log(`mode: ${live ? "LIVE" : "test"}`);
console.log(`product  ${p.id}`);
console.log(`annual   ${annual.id}  $9.99/yr`);
console.log(`lifetime ${lifetime.id}  $29.99`);

// Customer portal: one-click cancel (at period end), card updates, invoices.
const configs = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
const portalFeatures = {
  subscription_cancel: { enabled: true, mode: "at_period_end", cancellation_reason: { enabled: true, options: ["too_expensive", "unused", "other"] } },
  payment_method_update: { enabled: true },
  invoice_history: { enabled: true },
  customer_update: { enabled: true, allowed_updates: ["email", "address"] },
};
if (configs.data[0]) {
  await stripe.billingPortal.configurations.update(configs.data[0].id, { features: portalFeatures });
  console.log(`portal   ${configs.data[0].id} updated`);
} else {
  const c = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Manage your Cosmograph membership" },
    features: portalFeatures,
  });
  console.log(`portal   ${c.id} created`);
}

if (webhookUrl) {
  const hooks = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = hooks.data.find((h) => h.url === webhookUrl);
  if (existing) {
    await stripe.webhookEndpoints.update(existing.id, { enabled_events: EVENTS, disabled: false });
    console.log(`webhook  ${existing.id} updated (signing secret unchanged; read it in the dashboard)`);
  } else {
    const h = await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: EVENTS,
      description: "Cosmograph membership",
    });
    console.log(`webhook  ${h.id} created`);
    console.log(`STRIPE_WEBHOOK_SECRET=${h.secret}`);
    console.log("(shown once: put it straight into the deployment's secrets)");
  }
}
