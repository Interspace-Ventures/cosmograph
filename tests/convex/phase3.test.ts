/**
 * Phase 3 (billing) against the in-memory ctx: verified Stripe webhook,
 * idempotency, refunds/disputes, the checkout HTTP edge and its budgets, and
 * the 1Password secret loader. No network: Stripe signatures are made and
 * checked locally with the SDK's test helper, Stripe API calls hit a fake.
 */
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import Stripe from "stripe";
import { ConvexError } from "convex/values";
import { FakeDb, identity, makeCtx } from "./fakeCtx";
import { entitlementHandler } from "../../convex/account";
import { unlockHandler } from "../../convex/billing";
import { saveHandler as shipSave } from "../../convex/ship";
import { findOrCreateUser } from "../../convex/lib/account";
import * as billingInternal from "../../convex/billingInternal";
import {
  eventSeenHandler,
  prepareCheckoutHandler,
  setStripeCustomerHandler,
} from "../../convex/billingInternal";
import * as stripeNode from "../../convex/stripeNode";
import http from "../../convex/http";
import { applyEventOnce } from "../../convex/lib/entitlement";
import { billingConfig, type BillingConfig } from "../../convex/lib/billingConfig";
import { clearPriceCache, runCheckout } from "../../convex/lib/checkout";
import { runWebhook } from "../../convex/lib/webhook";
import {
  clearStripeSecretCache,
  loadStripeSecrets,
  type OpClientLike,
} from "../../convex/lib/opSecrets";
import {
  handleCheckout,
  handlePreflight,
  handleWebhook,
  type BillingHttpDeps,
} from "../../convex/lib/httpBilling";
import type { StripeLike } from "../../convex/lib/stripeLike";

// Dummy, obviously fake key material, assembled so no scanner mistakes it for
// a real secret. Nothing here talks to Stripe.
const SK = ["sk", "test", "fakefakefakefakefake"].join("_");
const WHSEC = ["whsec", "fakefakefakefakefake"].join("_");
const OTHER_WHSEC = ["whsec", "otherotherotherother"].join("_");
const local = new Stripe(SK);

const ANNUAL = "price_annual00001";
const LIFETIME = "price_lifetime0001";
const ORIGIN = "https://staging.exo.now";
const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);

const ENV: Record<string, string> = {
  RELEASE_CHANNEL: "internal",
  FEATURE_FLAG_OVERRIDES: "convex-account=on",
  STRIPE_PRICE_ANNUAL: ANNUAL,
  STRIPE_PRICE_LIFETIME: LIFETIME,
  OP_STRIPE_SECRET_KEY_ITEM: "Cosmograph staging: STRIPE_SECRET_KEY",
  OP_STRIPE_WEBHOOK_SECRET_ITEM: "Cosmograph staging: STRIPE_WEBHOOK_SECRET",
  PUBLIC_APP_ORIGINS: ORIGIN,
  OP_SERVICE_ACCOUNT_TOKEN: "ops_dummy_token_for_tests",
};

const ALICE = identity("exo|alice", { email: "a@x.io", email_verified: true });
const cfg = billingConfig(ENV) as BillingConfig;

function code(err: unknown): string | undefined {
  return err instanceof ConvexError ? (err.data as { code?: string }).code : undefined;
}
async function rejectsWith(p: Promise<unknown>, expected: string) {
  await assert.rejects(p, (err) => code(err) === expected);
}

let db: FakeDb;
let calls: string[];
let lastSession: Stripe.Checkout.SessionCreateParams | null;
const subs = new Map<string, unknown>();
const charges = new Map<string, unknown>();
const prices = new Map<string, unknown>();

beforeEach(() => {
  db = new FakeDb();
  calls = [];
  lastSession = null;
  subs.clear();
  charges.clear();
  prices.clear();
  prices.set(ANNUAL, {
    id: ANNUAL, active: true, unit_amount: 999, currency: "usd",
    recurring: { interval: "year", interval_count: 1 },
  });
  prices.set(LIFETIME, {
    id: LIFETIME, active: true, unit_amount: 2999, currency: "usd", recurring: null,
  });
  clearPriceCache();
  clearStripeSecretCache();
  process.env.RELEASE_CHANNEL = "internal";
  process.env.FEATURE_FLAG_OVERRIDES = "convex-account=on";
});

const fakeStripe: StripeLike = {
  webhooks: local.webhooks,
  prices: {
    retrieve: async (id) => {
      calls.push(`prices.retrieve:${id}`);
      return prices.get(id) as Stripe.Price;
    },
  },
  customers: {
    create: async () => {
      calls.push("customers.create");
      return { id: "cus_new" };
    },
  },
  checkout: {
    sessions: {
      create: async (params) => {
        calls.push("sessions.create");
        lastSession = params;
        return { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" };
      },
    },
  },
  billingPortal: {
    sessions: { create: async () => ({ url: "https://billing.stripe.com/p/session/x" }) },
  },
  subscriptions: {
    retrieve: async (id) => subs.get(id) as Stripe.Subscription,
    update: async (id) => calls.push(`subscriptions.update:${id}`),
    cancel: async (id) => calls.push(`subscriptions.cancel:${id}`),
  },
  charges: { retrieve: async (id) => charges.get(id) as Stripe.Charge },
};

const ctx = () => ({ db }) as never;

function signed(event: object, secret = WHSEC) {
  const payload = JSON.stringify(event);
  return { payload, signature: local.webhooks.generateTestHeaderString({ payload, secret }) };
}

function webhook(event: object, secret = WHSEC) {
  const { payload, signature } = signed(event, secret);
  return runWebhook(payload, signature, {
    cfg,
    secrets: async () => ({ secretKey: SK, webhookSecret: WHSEC }),
    stripeFor: () => fakeStripe,
    seen: (eventId) => eventSeenHandler(ctx(), { eventId }),
    apply: (args) => applyEventOnce(ctx(), args, NOW),
  });
}

let nextEvent = 1;
function evt(type: string, object: object, id = `evt_${nextEvent++}`) {
  return { id, object: "event", type, data: { object } };
}

function lifetimeSession(over: Record<string, unknown> = {}, meta: Record<string, string> = {}) {
  return evt("checkout.session.completed", {
    id: "cs_test_life", object: "checkout.session", mode: "payment",
    payment_status: "paid", client_reference_id: ALICE.subject, customer: "cus_A",
    amount_subtotal: 2999, currency: "usd", payment_intent: "pi_A",
    metadata: { exoSubject: ALICE.subject, kind: "membership", plan: "lifetime", author: "A42", ...meta },
    ...over,
  });
}

function annualSub(id: string, status: string, price = ANNUAL, customer = "cus_A") {
  return {
    id, object: "subscription", status, customer, cancel_at_period_end: false,
    metadata: { exoSubject: ALICE.subject },
    items: { data: [{ price: { id: price }, current_period_end: NOW / 1000 + 86400 * 365 }] },
  };
}

function annualSession(subId: string, eventId?: string) {
  return evt(
    "checkout.session.completed",
    {
      id: "cs_test_ann", object: "checkout.session", mode: "subscription",
      payment_status: "paid", client_reference_id: ALICE.subject, customer: "cus_A",
      amount_subtotal: 999, currency: "usd", subscription: subId,
      metadata: { exoSubject: ALICE.subject, kind: "membership", plan: "annual" },
    },
    eventId,
  );
}

const alice = () => db.rows("users").find((r) => r.exoSubject === ALICE.subject);

// ---------------------------------------------------------------- webhook

test("webhook: a bad or forged signature is rejected and writes nothing", async () => {
  const forged = await webhook(lifetimeSession(), OTHER_WHSEC);
  assert.deepEqual(forged, { status: 400, outcome: "bad_signature" });
  const garbage = await runWebhook(JSON.stringify(lifetimeSession()), "t=1,v1=deadbeef", {
    cfg,
    secrets: async () => ({ secretKey: SK, webhookSecret: WHSEC }),
    stripeFor: () => fakeStripe,
    seen: async () => false,
    apply: async () => assert.fail("must not apply an unverified event"),
  });
  assert.equal(garbage.status, 400);
  assert.equal(db.rows("users").length, 0);
  assert.equal(db.rows("stripeEvents").length, 0);
});

test("webhook: secrets unavailable answers 503 so Stripe retries", async () => {
  const { payload, signature } = signed(lifetimeSession());
  const res = await runWebhook(payload, signature, {
    cfg,
    secrets: async () => { throw new Error("vault down"); },
    stripeFor: () => fakeStripe,
    seen: async () => false,
    apply: async () => assert.fail("no apply without secrets"),
  });
  assert.deepEqual(res, { status: 503, outcome: "unavailable" });
});

test("webhook: verified lifetime checkout grants once; a replay is a no-op", async () => {
  const event = lifetimeSession();
  assert.equal((await webhook(event)).outcome, "applied");
  const row = alice();
  assert.equal(row?.hasPaid, true);
  assert.equal(row?.memberPlan, "lifetime");
  assert.equal(row?.lifetimePaymentIntentId, "pi_A");
  assert.equal(row?.stripeCustomerId, "cus_A");
  assert.equal(row?.memberSince, NOW);
  // The researcher carried through checkout is unlocked by the webhook.
  assert.deepEqual(db.rows("researcherUnlocks").map((r) => r.authorId), ["A42"]);

  // Same event, re-signed (Stripe redelivery or an attacker replaying it).
  assert.equal((await webhook(event)).outcome, "duplicate");
  // Even past the cheap check, the mutation itself refuses a second apply.
  const again = await applyEventOnce(
    ctx(),
    { eventId: event.id, type: event.type, event: { kind: "ignored" }, annualPriceId: ANNUAL },
    NOW,
  );
  assert.equal(again.applied, false);
  assert.equal(db.rows("stripeEvents").length, 1);
  assert.equal(db.rows("researcherUnlocks").length, 1);
});

test("webhook: underpaid, unpaid or mismatched sessions grant nothing", async () => {
  await webhook(lifetimeSession({ amount_subtotal: 999 }));
  await webhook(lifetimeSession({ currency: "eur" }));
  await webhook(lifetimeSession({ payment_status: "unpaid" }));
  await webhook(lifetimeSession({ client_reference_id: "exo|mallory" }));
  await webhook(lifetimeSession({ mode: "subscription" }));
  await webhook(lifetimeSession({}, { kind: "donation" }));
  assert.ok(!db.rows("users").some((r) => r.hasPaid));
  assert.equal(db.rows("researcherUnlocks").length, 0);
});

test("webhook: full refund revokes lifetime; a partial refund keeps it", async () => {
  await webhook(lifetimeSession());
  const charge = { id: "ch_1", object: "charge", customer: "cus_A", payment_intent: "pi_A" };
  await webhook(evt("charge.refunded", { ...charge, refunded: false }));
  assert.equal(alice()?.hasPaid, true);
  await webhook(evt("charge.refunded", { ...charge, refunded: true }));
  assert.equal(alice()?.hasPaid, false);
  assert.equal(alice()?.memberStatus, "refunded");
  const ent = await entitlementHandler(makeCtx(db, ALICE));
  assert.equal(ent.entitled, false);
});

test("webhook: annual checkout syncs the live subscription; refund cancels and revokes", async () => {
  subs.set("sub_1", annualSub("sub_1", "active"));
  await webhook(annualSession("sub_1"));
  assert.equal(alice()?.hasPaid, true);
  assert.equal(alice()?.memberPlan, "annual");
  assert.equal(alice()?.stripeSubscriptionId, "sub_1");

  await webhook(evt("charge.refunded", {
    id: "ch_2", object: "charge", customer: "cus_A", payment_intent: "pi_inv", refunded: true,
  }));
  assert.equal(alice()?.hasPaid, false);
  assert.equal(alice()?.memberStatus, "refunded");
  assert.ok(calls.includes("subscriptions.cancel:sub_1"));
  // A later "canceled" subscription event doesn't flip the refunded state.
  subs.set("sub_1", annualSub("sub_1", "canceled"));
  await webhook(evt("customer.subscription.deleted", annualSub("sub_1", "canceled")));
  assert.equal(alice()?.memberStatus, "refunded");
});

test("webhook: a dispute revokes and cancels the subscription", async () => {
  subs.set("sub_2", annualSub("sub_2", "active"));
  await webhook(annualSession("sub_2"));
  charges.set("ch_d", { id: "ch_d", object: "charge", customer: "cus_A", metadata: {} });
  await webhook(evt("charge.dispute.created", { id: "dp_1", object: "dispute", charge: "ch_d" }));
  assert.equal(alice()?.hasPaid, false);
  assert.equal(alice()?.memberStatus, "disputed");
  assert.ok(calls.includes("subscriptions.cancel:sub_2"));
});

test("webhook: lapses revoke annual; past_due keeps grace; unknown prices never grant", async () => {
  subs.set("sub_x", annualSub("sub_x", "active", "price_somethingelse"));
  await webhook(annualSession("sub_x"));
  assert.ok(!alice()?.hasPaid);

  subs.set("sub_3", annualSub("sub_3", "active"));
  await webhook(annualSession("sub_3"));
  subs.set("sub_3", annualSub("sub_3", "past_due"));
  await webhook(evt("customer.subscription.updated", annualSub("sub_3", "past_due")));
  assert.equal(alice()?.hasPaid, true);
  assert.equal(alice()?.memberStatus, "past_due");
  subs.set("sub_3", annualSub("sub_3", "canceled"));
  await webhook(evt("customer.subscription.deleted", annualSub("sub_3", "canceled")));
  assert.equal(alice()?.hasPaid, false);
  assert.equal(alice()?.memberStatus, "canceled");
});

test("webhook: lifetime upgrade stops the annual renewal; old annual events are ignored", async () => {
  subs.set("sub_4", annualSub("sub_4", "active"));
  await webhook(annualSession("sub_4"));
  await webhook(lifetimeSession());
  assert.equal(alice()?.memberPlan, "lifetime");
  assert.ok(calls.includes("subscriptions.update:sub_4"));
  subs.set("sub_4", annualSub("sub_4", "canceled"));
  await webhook(evt("customer.subscription.deleted", annualSub("sub_4", "canceled")));
  assert.equal(alice()?.hasPaid, true);
  assert.equal(alice()?.memberPlan, "lifetime");
});

// ---------------------------------------------------------------- browser can't set paid

test("the browser can't set paid: grants are internal, and no public path writes hasPaid", async () => {
  for (const fn of [
    billingInternal.applyEvent,
    billingInternal.prepareCheckout,
    billingInternal.setStripeCustomer,
    billingInternal.preparePortal,
    billingInternal.eventSeen,
    stripeNode.createCheckout,
    stripeNode.processWebhook,
    stripeNode.createPortal,
  ]) {
    assert.equal((fn as unknown as { isInternal?: boolean }).isInternal, true);
  }
  // There is no confirm route: the checkout return URL can't grant anything.
  const routes = (http as unknown as { getRoutes(): Array<[string, string]> })
    .getRoutes()
    .map(([path, method]) => `${method} ${path}`)
    .sort();
  assert.deepEqual(routes, [
    "OPTIONS /billing/checkout",
    "OPTIONS /billing/portal",
    "POST /billing/checkout",
    "POST /billing/portal",
    "POST /stripe/webhook",
  ]);

  // Public Phase 2 paths leave membership alone.
  const a = makeCtx(db, ALICE);
  await findOrCreateUser({ db } as never, ALICE); // what users.ensure does
  await shipSave(a, { seed: "abc" });
  await rejectsWith(unlockHandler(a, { author: "A1" }), "NOT_A_MEMBER");

  // A checkout request claiming payment only ever yields a Stripe URL.
  const seen: unknown[] = [];
  const res = await handleCheckout(
    req("/billing/checkout", { plan: "lifetime", hasPaid: true, entitled: true, memberPlan: "lifetime" }),
    httpDeps({
      checkout: async (args) => {
        seen.push(args);
        return runCheckout(args, checkoutDeps());
      },
    }),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(seen[0] as object).sort(), ["email", "origin", "plan", "returnPath", "subject"]);
  assert.equal(alice()?.hasPaid, false);
  assert.equal((await entitlementHandler(a)).entitled, false);
});

// ---------------------------------------------------------------- checkout budget

test("checkout budget: per-minute, daily per-client and global cutoff all fail closed", async () => {
  const limits = { perMinute: 3, dailyPerClient: 5, dailyGlobal: 7 };
  const prep = (subject: string, at: number) =>
    prepareCheckoutHandler(ctx(), { subject, plan: "annual" }, limits, at);
  for (let i = 0; i < 3; i++) await prep("exo|a", NOW);
  await rejectsWith(prep("exo|a", NOW), "RATE_LIMITED");
  const counted = db.rows("rateCounters").map((r) => r.count);
  await rejectsWith(prep("exo|a", NOW), "RATE_LIMITED");
  assert.deepEqual(db.rows("rateCounters").map((r) => r.count), counted); // denials aren't counted
  await prep("exo|a", NOW + 60_000);
  await prep("exo|a", NOW + 60_000);
  await rejectsWith(prep("exo|a", NOW + 120_000), "DAILY_LIMIT");
  await prep("exo|b", NOW + 120_000);
  await prep("exo|b", NOW + 120_000);
  await rejectsWith(prep("exo|c", NOW + 120_000), "GLOBAL_CUTOFF");
  // A new UTC day resets the windows.
  await prep("exo|c", NOW + 86_400_000);
});

test("checkout budget: missing, zero or malformed limits fail closed", async () => {
  for (const raw of ["0", "lots", "-5", "1e9"]) {
    const bad = billingConfig({ ...ENV, CHECKOUT_DAILY_GLOBAL: raw }) as BillingConfig;
    assert.equal(bad.limits.dailyGlobal, 0);
    await rejectsWith(
      prepareCheckoutHandler(ctx(), { subject: "exo|a", plan: "annual" }, bad.limits, NOW),
      "GLOBAL_CUTOFF",
    );
  }
  assert.equal(db.rows("rateCounters").length, 0);
});

test("checkout: members can only move up; lifetime members never reach Stripe", async () => {
  await db.insert("users", { exoSubject: ALICE.subject, hasPaid: true, memberPlan: "lifetime" });
  const res = await runCheckout(
    { subject: ALICE.subject, plan: "lifetime", origin: ORIGIN, returnPath: "/" },
    { ...checkoutDeps(), stripe: async () => assert.fail("no Stripe call for a member") },
  );
  assert.deepEqual(res, { alreadyEntitled: true });
  assert.equal(db.rows("rateCounters").length, 0);
});

// ---------------------------------------------------------------- checkout session

function checkoutDeps() {
  return {
    cfg,
    prepare: (a: { subject: string; email?: string; plan: "annual" | "lifetime" }) =>
      prepareCheckoutHandler(ctx(), a, cfg.limits, NOW),
    saveCustomer: (a: { subject: string; customerId: string }) => setStripeCustomerHandler(ctx(), a),
    stripe: async () => fakeStripe,
    now: () => NOW,
  };
}

test("checkout: sessions use the configured price and allowlisted return URLs only", async () => {
  const res = await runCheckout(
    { subject: ALICE.subject, email: "a@x.io", plan: "annual", origin: ORIGIN, returnPath: "/cosmograph/", author: "A7" },
    checkoutDeps(),
  );
  assert.equal(res.url, "https://checkout.stripe.com/c/pay/cs_test_1");
  const p = lastSession!;
  assert.equal(p.mode, "subscription");
  assert.deepEqual(p.line_items, [{ price: ANNUAL, quantity: 1 }]);
  assert.equal(p.success_url, `${ORIGIN}/cosmograph/?checkout=success&author=A7`);
  assert.equal(p.cancel_url, `${ORIGIN}/cosmograph/?checkout=cancelled&author=A7`);
  assert.equal(p.client_reference_id, ALICE.subject);
  assert.deepEqual(p.metadata, { exoSubject: ALICE.subject, kind: "membership", plan: "annual", author: "A7" });
  assert.equal(p.expires_at, NOW / 1000 + 1800);
  assert.equal(p.allow_promotion_codes, false);
  assert.equal(alice()?.stripeCustomerId, "cus_new");
  // A second checkout reuses the customer; the price check is cached.
  await runCheckout({ subject: ALICE.subject, plan: "lifetime", origin: ORIGIN, returnPath: "/" }, checkoutDeps());
  assert.equal(calls.filter((c) => c === "customers.create").length, 1);
  assert.equal(lastSession!.mode, "payment");
  assert.deepEqual(lastSession!.line_items, [{ price: LIFETIME, quantity: 1 }]);
});

test("checkout: a configured price with the wrong terms is refused before any session", async () => {
  prices.set(ANNUAL, { id: ANNUAL, active: true, unit_amount: 0, currency: "usd", recurring: { interval: "year", interval_count: 1 } });
  await rejectsWith(
    runCheckout({ subject: ALICE.subject, plan: "annual", origin: ORIGIN, returnPath: "/" }, checkoutDeps()),
    "BILLING_UNAVAILABLE",
  );
  assert.ok(!calls.includes("sessions.create"));
  await rejectsWith(
    runCheckout({ subject: ALICE.subject, plan: "annual", origin: "https://evil.example", returnPath: "/" }, checkoutDeps()),
    "BILLING_UNAVAILABLE",
  );
});

// ---------------------------------------------------------------- HTTP edge

function req(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://deploy.convex.site${path}`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function httpDeps(over: Partial<BillingHttpDeps> = {}): BillingHttpDeps {
  return {
    env: ENV,
    identity: async () => ALICE,
    checkout: async () => ({ alreadyEntitled: false, url: "https://checkout.stripe.com/x" }),
    portal: async () => ({ url: "https://billing.stripe.com/x" }),
    webhook: async () => ({ status: 200 }),
    ...over,
  };
}

test("checkout HTTP: flag, Origin allowlist and auth are enforced before any work", async () => {
  let invoked = 0;
  const counting = httpDeps({ checkout: async () => { invoked++; return { alreadyEntitled: false, url: "u" }; } });
  const off = await handleCheckout(req("/billing/checkout", {}), { ...counting, env: { ...ENV, FEATURE_FLAG_OVERRIDES: "" } });
  assert.equal(off.status, 404);
  const noBilling = await handleCheckout(req("/billing/checkout", {}), { ...counting, env: { ...ENV, STRIPE_PRICE_ANNUAL: "" } });
  assert.equal(noBilling.status, 503);
  for (const origin of ["https://evil.example", "https://staging.exo.now.evil.example", "null", `${ORIGIN}/`]) {
    const res = await handleCheckout(req("/billing/checkout", {}, { Origin: origin }), counting);
    assert.equal(res.status, 403, origin);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
  }
  const noOrigin = new Request("https://deploy.convex.site/billing/checkout", { method: "POST", body: "{}" });
  assert.equal((await handleCheckout(noOrigin, counting)).status, 403);
  const anon = await handleCheckout(req("/billing/checkout", {}), { ...counting, identity: async () => null });
  assert.equal(anon.status, 401);
  assert.equal(invoked, 0);

  const ok = await handleCheckout(req("/billing/checkout", { plan: "annual", returnPath: "/cosmograph/" }), counting);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.equal(invoked, 1);
  assert.equal(handlePreflight(req("/billing/checkout", {}), ENV).status, 204);
  assert.equal(handlePreflight(req("/billing/checkout", {}, { Origin: "https://evil.example" }), ENV).status, 403);
});

test("checkout HTTP: inputs are bounded and return paths allowlisted", async () => {
  let invoked = 0;
  const deps = httpDeps({ checkout: async () => { invoked++; return { alreadyEntitled: false, url: "u" }; } });
  for (const body of [
    { plan: "free" },
    { plan: ["annual"] },
    { returnPath: "//evil.example/" },
    { returnPath: "https://evil.example/" },
    { returnPath: "/a?next=https://evil.example" },
    { returnPath: "/../etc" },
    { returnPath: `/${"a".repeat(300)}` },
    { author: "A1&x=1" },
    { ship: "battleship" },
    "not json",
    "[]",
  ]) {
    const res = await handleCheckout(req("/billing/checkout", body), deps);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  const big = await handleCheckout(req("/billing/checkout", { returnPath: "/", pad: "x".repeat(4096) }), deps);
  assert.equal(big.status, 413);
  assert.equal(invoked, 0);
});

test("checkout HTTP: budget and billing errors map to fail-closed statuses", async () => {
  const fails = (c: string) => httpDeps({ checkout: async () => { throw new ConvexError({ code: c, message: c }); } });
  assert.equal((await handleCheckout(req("/billing/checkout", {}), fails("RATE_LIMITED"))).status, 429);
  assert.equal((await handleCheckout(req("/billing/checkout", {}), fails("DAILY_LIMIT"))).status, 429);
  assert.equal((await handleCheckout(req("/billing/checkout", {}), fails("GLOBAL_CUTOFF"))).status, 503);
  assert.equal((await handleCheckout(req("/billing/checkout", {}), fails("BILLING_UNAVAILABLE"))).status, 503);
  const boom = httpDeps({ checkout: async () => { throw new Error("stripe exploded"); } });
  const res = await handleCheckout(req("/billing/checkout", {}), boom);
  assert.equal(res.status, 503);
  assert.ok(!(await res.text()).includes("exploded"));
});

test("webhook HTTP: signature header required, body bounded, flag enforced", async () => {
  const deps = httpDeps({ webhook: async () => ({ status: 200 }) });
  const hook = (body: string, headers: Record<string, string> = {}) =>
    new Request("https://deploy.convex.site/stripe/webhook", { method: "POST", headers, body });
  assert.equal((await handleWebhook(hook("{}"), deps)).status, 400);
  assert.equal((await handleWebhook(hook("x".repeat(600 * 1024), { "Stripe-Signature": "t=1,v1=a" }), deps)).status, 413);
  assert.equal((await handleWebhook(hook("{}", { "Stripe-Signature": "t=1,v1=a" }), { ...deps, env: { ...ENV, FEATURE_FLAG_OVERRIDES: "" } })).status, 404);
  assert.equal((await handleWebhook(hook("{}", { "Stripe-Signature": "t=1,v1=a" }), deps)).status, 200);
});

// ---------------------------------------------------------------- secrets

function fakeOp(values: Record<string, string>, onCreate?: () => void) {
  return async (token: string): Promise<OpClientLike> => {
    onCreate?.();
    assert.equal(token, ENV.OP_SERVICE_ACCOUNT_TOKEN);
    const titles = Object.keys(values);
    return {
      vaults: { list: async () => [{ id: "v1", title: "Interspace" }, { id: "v2", title: "Private" }] },
      items: {
        list: async (vaultId) => (vaultId === "v1" ? titles.map((title, i) => ({ id: `i${i}`, title })) : []),
        get: async (_v, itemId) => ({
          fields: [{ id: "credential", title: "credential", value: values[titles[Number(itemId.slice(1))]!]! }],
        }),
      },
    };
  };
}

test("secrets: Stripe keys come from the 1Password vault by item name, never env", async () => {
  const items = {
    "Cosmograph staging: STRIPE_SECRET_KEY": SK,
    "Cosmograph staging: STRIPE_WEBHOOK_SECRET": WHSEC,
  };
  let created = 0;
  const factory = fakeOp(items, () => created++);
  const got = await loadStripeSecrets(cfg, { env: ENV, factory, now: NOW });
  assert.deepEqual(got, { secretKey: SK, webhookSecret: WHSEC });
  await loadStripeSecrets(cfg, { env: ENV, factory, now: NOW + 1000 });
  assert.equal(created, 1); // cached in memory

  clearStripeSecretCache();
  for (const env of [
    { ...ENV, STRIPE_SECRET_KEY: SK },
    { ...ENV, STRIPE_WEBHOOK_SECRET: WHSEC },
    { ...ENV, OP_SERVICE_ACCOUNT_TOKEN: "" },
  ]) {
    await rejectsWith(loadStripeSecrets(cfg, { env, factory: fakeOp(items, () => assert.fail("no vault read")), now: NOW }), "BILLING_UNAVAILABLE");
  }
  const live = { ...items, "Cosmograph staging: STRIPE_SECRET_KEY": ["sk", "live", "fakefakefakefakefake"].join("_") };
  await rejectsWith(loadStripeSecrets(cfg, { env: ENV, factory: fakeOp(live), now: NOW }), "BILLING_UNAVAILABLE");
  const missing = { "Cosmograph staging: STRIPE_SECRET_KEY": SK };
  await rejectsWith(loadStripeSecrets(cfg, { env: ENV, factory: fakeOp(missing), now: NOW }), "BILLING_UNAVAILABLE");
});

test("config: billing stays off without price ids or vault item names", () => {
  assert.equal(billingConfig({ ...ENV, STRIPE_PRICE_ANNUAL: "" }), null);
  assert.equal(billingConfig({ ...ENV, STRIPE_PRICE_LIFETIME: "prod_123" }), null);
  assert.equal(billingConfig({ ...ENV, STRIPE_PRICE_LIFETIME: ANNUAL }), null);
  assert.equal(billingConfig({ ...ENV, OP_STRIPE_WEBHOOK_SECRET_ITEM: "" }), null);
  assert.equal(billingConfig({ ...ENV, STRIPE_MODE: "prod" }), null);
  const c = billingConfig({ ...ENV, ALLOWED_ORIGINS: "http://localhost:5173,http://evil.example,https://x.example/path" })!;
  assert.deepEqual(c.origins, [ORIGIN, "http://localhost:5173"]);
});
