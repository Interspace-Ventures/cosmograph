// Billing end-to-end check against Stripe TEST mode and a running api-server.
//
//   DATABASE_URL=... STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... \
//   E2E_BASE=http://127.0.0.1:5099 pnpm --filter @workspace/api-server exec tsx scripts/billing-e2e.ts
//
// Real Stripe objects (customers, subscriptions, payments, refunds) are created
// in test mode; webhook events carrying those objects are signed with the
// server's webhook secret and POSTed to /api/stripe/webhook, exactly as Stripe
// would. Then the database is checked. Refuses to run with a live key.
import Stripe from "stripe";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, usersTable, pool } from "@workspace/db";
import pino from "pino";
import { createCheckout, resolvePrice } from "../src/lib/billing";

const key = process.env.STRIPE_SECRET_KEY ?? "";
const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:5099";
if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
  console.error("refusing: STRIPE_SECRET_KEY must be a TEST key");
  process.exit(1);
}
const stripe = new Stripe(key);
const log = pino({ level: "warn" });
let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  ok ? pass++ : fail++;
};

function event(type: string, object: unknown, id = `evt_e2e_${randomBytes(8).toString("hex")}`) {
  return {
    id,
    object: "event",
    api_version: "2025-01-27.acacia",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
  };
}

async function send(evt: unknown, sig?: string): Promise<number> {
  const payload = JSON.stringify(evt);
  const header = sig ?? stripe.webhooks.generateTestHeaderString({ payload, secret });
  const r = await fetch(`${BASE}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  });
  return r.status;
}

async function user(id: string) {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return u;
}

async function member(tag: string) {
  const id = `e2e_${tag}_${randomBytes(3).toString("hex")}`;
  const customer = await stripe.customers.create({
    email: `${id}@example.com`,
    metadata: { userId: id, e2e: "1" },
  });
  const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });
  await db.insert(usersTable).values({ id, email: `${id}@example.com`, stripeCustomerId: customer.id });
  return { id, customer: customer.id, pm: pm.id };
}

async function main() {
  // --- prices + checkout session creation --------------------------------
  const annualPrice = await resolvePrice(stripe, "annual");
  const lifetimePrice = await resolvePrice(stripe, "lifetime");
  check("annual price resolves by lookup key", annualPrice.startsWith("price_"));
  check("lifetime price resolves by lookup key", lifetimePrice.startsWith("price_"));

  const buyer = await member("checkout");
  const co = await createCheckout(buyer.id, "annual", "https://cosmograph.space", log, "A5023888391");
  const sessId = co.url ? new URL(co.url).pathname.split("/").pop()!.split("#")[0] : "";
  const sess = sessId ? await stripe.checkout.sessions.retrieve(sessId, { expand: ["line_items"] }) : null;
  check("annual checkout session created", !!sess && sess.mode === "subscription");
  check("annual checkout charges $9.99/yr", sess?.line_items?.data[0]?.price?.unit_amount === 999);
  check("checkout returns to our origin only", !!sess?.success_url?.startsWith("https://cosmograph.space/?"));
  check("checkout carries the user", sess?.client_reference_id === buyer.id);
  check("renewal disclosure shown at checkout", !!sess?.custom_text?.submit?.message?.includes("Renews automatically"));
  const co2 = await createCheckout(buyer.id, "lifetime", "https://cosmograph.space", log);
  const s2 = await stripe.checkout.sessions.retrieve(new URL(co2.url!).pathname.split("/").pop()!.split("#")[0], { expand: ["line_items"] });
  check("lifetime checkout is a one-time $29.99 payment", s2.mode === "payment" && s2.line_items?.data[0]?.price?.unit_amount === 2999);

  // --- annual: subscribe, replay, cancel ---------------------------------
  const a = await member("annual");
  const sub = await stripe.subscriptions.create({
    customer: a.customer,
    items: [{ price: annualPrice }],
    metadata: { userId: a.id, kind: "membership", plan: "annual" },
  });
  const created = event("customer.subscription.created", sub);
  check("signed webhook accepted", (await send(created)) === 200);
  let u = await user(a.id);
  check("annual member granted", u?.hasPaid === true && u.memberPlan === "annual" && u.memberStatus === "active");
  const days = u?.memberUntil ? (u.memberUntil.getTime() - Date.now()) / 86_400_000 : 0;
  check("paid through ~1 year", days > 360 && days < 370, `${Math.round(days)} days`);

  check("replayed event is accepted but ignored", (await send(created)) === 200);
  check("forged signature rejected", (await send(event("customer.subscription.created", sub), "t=1,v1=deadbeef")) === 400);
  check("missing signature rejected", (await fetch(`${BASE}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status === 400);
  const wrongSecret = stripe.webhooks.generateTestHeaderString({ payload: JSON.stringify(created), secret: "whsec_attacker" });
  check("event signed with another secret rejected", (await send(event("customer.subscription.created", sub), wrongSecret)) === 400);

  // Attack: a forged "paid" event naming someone else's account.
  const victim = await member("victim");
  const forged = event("checkout.session.completed", {
    object: "checkout.session", id: "cs_test_forged", mode: "payment", payment_status: "paid",
    amount_subtotal: 2999, client_reference_id: victim.id, metadata: { userId: victim.id, kind: "membership", plan: "lifetime" },
  });
  check("unsigned 'paid' event cannot grant", (await send(forged, "t=1,v1=00")) === 400 && (await user(victim.id))?.hasPaid === false);
  // Attack: a correctly signed but underpaid lifetime session.
  const cheap = event("checkout.session.completed", {
    object: "checkout.session", id: "cs_test_cheap", mode: "payment", payment_status: "paid",
    amount_subtotal: 100, client_reference_id: victim.id, metadata: { userId: victim.id, kind: "membership", plan: "lifetime" },
  });
  await send(cheap);
  check("underpaid lifetime session does not grant", (await user(victim.id))?.hasPaid === false);

  await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
  await send(event("customer.subscription.updated", sub));
  u = await user(a.id);
  check("cancel at period end keeps access", u?.hasPaid === true && u.cancelAtPeriodEnd === true);

  await stripe.subscriptions.cancel(sub.id);
  await send(event("customer.subscription.deleted", sub));
  u = await user(a.id);
  check("ended subscription revokes access", u?.hasPaid === false && u.memberStatus === "canceled");

  // --- lifetime: pay, then full refund ------------------------------------
  const l = await member("lifetime");
  const pi = await stripe.paymentIntents.create({
    amount: 2999, currency: "usd", customer: l.customer, payment_method: l.pm, confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    metadata: { userId: l.id, kind: "membership", plan: "lifetime" },
  });
  await send(event("checkout.session.completed", {
    object: "checkout.session", id: `cs_test_${randomBytes(6).toString("hex")}`, mode: "payment",
    payment_status: "paid", amount_subtotal: 2999, payment_intent: pi.id, customer: l.customer,
    client_reference_id: l.id, metadata: { userId: l.id, kind: "membership", plan: "lifetime" },
  }));
  u = await user(l.id);
  check("lifetime member granted", u?.hasPaid === true && u.memberPlan === "lifetime" && u.memberUntil === null);

  await stripe.refunds.create({ payment_intent: pi.id });
  const charge = await stripe.charges.retrieve(pi.latest_charge as string);
  await send(event("charge.refunded", charge));
  u = await user(l.id);
  check("full refund revokes lifetime", u?.hasPaid === false && u.memberStatus === "refunded");

  // --- dispute on an annual member ----------------------------------------
  const d = await member("dispute");
  const dsub = await stripe.subscriptions.create({
    customer: d.customer, items: [{ price: annualPrice }],
    metadata: { userId: d.id, kind: "membership", plan: "annual" },
    expand: ["latest_invoice"],
  });
  await send(event("customer.subscription.created", dsub));
  check("annual member (dispute case) granted", (await user(d.id))?.hasPaid === true);
  const charges = await stripe.charges.list({ customer: d.customer, limit: 1 });
  await send(event("charge.dispute.created", { object: "dispute", id: "dp_test_e2e", charge: charges.data[0]!.id }));
  u = await user(d.id);
  const dlive = await stripe.subscriptions.retrieve(dsub.id);
  check("chargeback revokes access", u?.hasPaid === false && u.memberStatus === "disputed");
  check("chargeback cancels the subscription", dlive.status === "canceled");

  console.log(`---- ${pass} passed, ${fail} failed`);
  await pool.end();
  process.exit(fail ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
