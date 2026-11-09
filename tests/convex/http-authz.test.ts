/**
 * Authorization matrix for the Convex HTTP routes (convex/http.ts), at the
 * handler level with the same dependency wiring http.ts uses. Runs in the
 * Render build gate (`pnpm run test:convex`). No network: Stripe signatures
 * are made and checked locally with the SDK's helper.
 *
 *   POST/OPTIONS /billing/checkout, /billing/portal
 *     - missing Exo Imprint token (anonymous)        -> 401, no work
 *     - token Convex Auth rejects (identity throws)  -> 401, no work
 *     - identity without a subject                   -> 401, no work
 *     - disallowed, lookalike, null or missing Origin -> 403, no CORS grant,
 *       checked before identity is even read
 *     - public channel (production)                  -> 404
 *   POST /stripe/webhook
 *     - bad, forged, stale or missing signature      -> 400, nothing applied
 *   POST/OPTIONS /ask/chat
 *     - disallowed Origin                            -> 403, no budget, no spend
 *     - body cap, per-minute cap                     -> 413 / 429, no spend
 *   Exo Key provider config
 *     - incomplete issuer / audience / client id     -> no provider (anonymous)
 */
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import Stripe from "stripe";
import type { UserIdentity } from "convex/server";
import { FakeDb, identity } from "./fakeCtx";
import {
  handleCheckout,
  handlePortal,
  handlePreflight,
  handleWebhook,
  type BillingHttpDeps,
} from "../../convex/lib/httpBilling";
import { billingConfig, type BillingConfig } from "../../convex/lib/billingConfig";
import { runWebhook } from "../../convex/lib/webhook";
import type { StripeLike } from "../../convex/lib/stripeLike";
import { handleAsk, handleAskPreflight, type AskHttpDeps } from "../../convex/lib/httpAsk";
import { takeAskHandler } from "../../convex/askInternal";
import { MAX_ASK_BODY } from "../../convex/lib/askRequest";
import { exoKeyConfig } from "../../convex/lib/exoKey";

// Obviously fake key material, assembled so no scanner mistakes it for a secret.
const SK = ["sk", "test", "authzfakeauthzfake00"].join("_");
const WHSEC = ["whsec", "authzfakeauthzfake00"].join("_");
const OTHER_WHSEC = ["whsec", "attackerattacker0000"].join("_");
const local = new Stripe(SK);

const ORIGIN = "https://staging.exo.now";
const BAD_ORIGINS = [
  "https://evil.example",
  "https://staging.exo.now.evil.example",
  "https://evil-staging.exo.now",
  "http://staging.exo.now",
  `${ORIGIN}/`,
  "null",
];

const ENV: Record<string, string> = {
  // convex-account is released to internal by date; no override needed.
  RELEASE_CHANNEL: "internal",
  STRIPE_PRICE_ANNUAL: "price_authzannual01",
  STRIPE_PRICE_LIFETIME: "price_authzlifetime1",
  BWS_ORGANIZATION_ID: "11111111-1111-4111-8111-111111111111",
  BWS_PROJECT_ID: "22222222-2222-4222-8222-222222222222",
  BWS_STRIPE_SECRET_KEY_NAME: "COSMOGRAPH_STAGING_STRIPE_SECRET_KEY",
  BWS_STRIPE_WEBHOOK_SECRET_NAME: "COSMOGRAPH_STAGING_STRIPE_WEBHOOK_SECRET",
  PUBLIC_APP_ORIGINS: ORIGIN,
  BWS_ACCESS_TOKEN: "0.dummy-machine-account-token-for-tests",
};

const ALICE = identity("exo|alice", { email: "a@x.io", email_verified: true });

let work: { identity: number; checkout: number; portal: number; webhook: number; applied: number };
beforeEach(() => {
  work = { identity: 0, checkout: 0, portal: 0, webhook: 0, applied: 0 };
});

function billingDeps(over: Partial<BillingHttpDeps> = {}, env = ENV): BillingHttpDeps {
  return {
    env,
    identity: async () => {
      work.identity++;
      return ALICE;
    },
    checkout: async () => {
      work.checkout++;
      return { alreadyEntitled: false, url: "https://checkout.stripe.com/c/test" };
    },
    portal: async () => {
      work.portal++;
      return { url: "https://billing.stripe.com/p/test" };
    },
    webhook: async () => {
      work.webhook++;
      return { status: 200 };
    },
    ...over,
  };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://deploy.convex.site${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const BILLING = [
  ["/billing/checkout", handleCheckout],
  ["/billing/portal", handlePortal],
] as const;

// ------------------------------------------------------------- billing: identity

for (const [path, handler] of BILLING) {
  test(`${path}: a missing Exo Imprint token is 401 and does no work`, async () => {
    const res = await handler(
      post(path, {}, { Origin: ORIGIN }),
      billingDeps({ identity: async () => null }),
    );
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as { code: string }).code, "UNAUTHENTICATED");
    assert.equal(work.checkout + work.portal, 0);
  });

  test(`${path}: a token Convex Auth rejects is 401, not a 500, and does no work`, async () => {
    const res = await handler(
      post(path, {}, { Origin: ORIGIN, Authorization: "Bearer not.a.valid-jwt" }),
      billingDeps({
        identity: async () => {
          throw new Error("Could not verify token claim");
        },
      }),
    );
    assert.equal(res.status, 401);
    assert.equal(work.checkout + work.portal, 0);
  });

  test(`${path}: an identity with no subject is 401`, async () => {
    const res = await handler(
      post(path, {}, { Origin: ORIGIN }),
      billingDeps({ identity: async () => ({ ...ALICE, subject: "" }) as UserIdentity }),
    );
    assert.equal(res.status, 401);
    assert.equal(work.checkout + work.portal, 0);
  });

  // ------------------------------------------------------------- billing: Origin

  test(`${path}: a disallowed or missing Origin is 403 with no CORS grant, before identity is read`, async () => {
    for (const origin of BAD_ORIGINS) {
      const res = await handler(post(path, {}, { Origin: origin }), billingDeps());
      assert.equal(res.status, 403, origin);
      assert.equal(res.headers.get("Access-Control-Allow-Origin"), null, origin);
      const pre = handlePreflight(
        new Request(`https://deploy.convex.site${path}`, { method: "OPTIONS", headers: { Origin: origin } }),
        ENV,
      );
      assert.equal(pre.status, 403, `preflight ${origin}`);
    }
    const noOrigin = await handler(post(path, {}), billingDeps());
    assert.equal(noOrigin.status, 403);
    assert.equal(work.identity, 0);
    assert.equal(work.checkout + work.portal, 0);
  });

  test(`${path}: the production (public) channel answers 404 before anything else`, async () => {
    const res = await handler(
      post(path, {}, { Origin: ORIGIN }),
      billingDeps({}, { ...ENV, RELEASE_CHANNEL: "public" }),
    );
    assert.equal(res.status, 404);
    assert.equal(work.identity, 0);
  });

  test(`${path}: a Convex deployment with no RELEASE_CHANNEL is treated as public (404)`, async () => {
    const { RELEASE_CHANNEL: _omit, ...noChannel } = ENV;
    void _omit;
    const res = await handler(post(path, {}, { Origin: ORIGIN }), billingDeps({}, noChannel));
    assert.equal(res.status, 404);
  });

  test(`${path}: a signed-in caller from the app origin gets through (control)`, async () => {
    const res = await handler(
      post(path, { returnPath: "/cosmograph/" }, { Origin: ORIGIN }),
      billingDeps(),
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
    assert.equal(work.checkout + work.portal, 1);
  });
}

// ------------------------------------------------------------- webhook: signature

const cfg = billingConfig(ENV) as BillingConfig;
const fakeStripe: StripeLike = {
  webhooks: local.webhooks,
  prices: { retrieve: async () => { throw new Error("no Stripe reads in authz tests"); } },
  subscriptions: { retrieve: async () => { throw new Error("no Stripe reads in authz tests"); } },
  charges: { retrieve: async () => { throw new Error("no Stripe reads in authz tests"); } },
} as unknown as StripeLike;

/** The real path http.ts wires: HTTP edge -> processWebhook -> runWebhook. */
function webhookDeps(): BillingHttpDeps {
  return billingDeps({
    webhook: async ({ payload, signature }) => {
      work.webhook++;
      const { status } = await runWebhook(payload, signature, {
        cfg,
        secrets: async () => ({ secretKey: SK, webhookSecret: WHSEC }),
        stripeFor: () => fakeStripe,
        seen: async () => false,
        apply: async () => {
          work.applied++;
          return { applied: true, followups: [] };
        },
      });
      return { status };
    },
  });
}

const EVENT = JSON.stringify({
  id: "evt_authz_1",
  object: "event",
  type: "checkout.session.completed",
  data: { object: { id: "cs_test_authz", object: "checkout.session" } },
});

function hook(body: string, signature?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signature !== undefined) headers["Stripe-Signature"] = signature;
  return new Request("https://deploy.convex.site/stripe/webhook", { method: "POST", headers, body });
}

test("/stripe/webhook: bad, forged, stale or missing signatures are 400 and apply nothing", async () => {
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    const deps = webhookDeps();
    const forged = local.webhooks.generateTestHeaderString({ payload: EVENT, secret: OTHER_WHSEC });
    const stale = local.webhooks.generateTestHeaderString({
      payload: EVENT,
      secret: WHSEC,
      timestamp: Math.floor(Date.now() / 1000) - 3600,
    });
    const tampered = local.webhooks.generateTestHeaderString({ payload: EVENT, secret: WHSEC });
    for (const [label, body, sig] of [
      ["garbage", EVENT, "t=1,v1=deadbeef"],
      ["forged with another secret", EVENT, forged],
      ["older than the tolerance", EVENT, stale],
      ["valid signature over a different body", EVENT.replace("evt_authz_1", "evt_authz_2"), tampered],
      ["empty", EVENT, ""],
    ] as const) {
      const res = await handleWebhook(hook(body, sig), deps);
      assert.equal(res.status, 400, label);
    }
    const missing = await handleWebhook(hook(EVENT), deps);
    assert.equal(missing.status, 400);
    assert.equal(work.applied, 0);
  } finally {
    console.warn = origWarn;
  }
});

test("/stripe/webhook: answers 404 on the public channel, without verifying anything", async () => {
  const res = await handleWebhook(
    hook(EVENT, "t=1,v1=deadbeef"),
    { ...webhookDeps(), env: { ...ENV, RELEASE_CHANNEL: "public" } },
  );
  assert.equal(res.status, 404);
  assert.equal(work.webhook, 0);
});

// ------------------------------------------------------------- Ask: Origin + caps

const ASK_ENV: Record<string, string> = {
  RELEASE_CHANNEL: "internal",
  FEATURE_FLAG_OVERRIDES: "ask-cosmo=on",
  PUBLIC_APP_ORIGINS: ORIGIN,
};
const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);

const ASK_BODY = {
  messages: [{ role: "user", content: "What is their most cited paper?" }],
  summary: {
    authorName: "Test Scientist",
    institution: "Example University",
    totalPapers: 10,
    totalCitations: 100,
    hIndex: 5,
    i10Index: 3,
    uniqueCoAuthors: 12,
    firstYear: 2000,
    lastYear: 2020,
    avgCitations: 10,
    topDomains: ["Genetics"],
    mostCitedTitle: "A paper",
    mostCitedCount: 50,
  },
};

function askDeps(db: FakeDb, spend: { take: number; complete: number }): AskHttpDeps {
  return {
    env: ASK_ENV,
    clientIp: async () => "198.51.100.9",
    take: async (args) => {
      spend.take++;
      return takeAskHandler({ db } as never, args, ASK_ENV, NOW);
    },
    complete: async () => {
      spend.complete++;
      return (async function* () {
        yield '{"action":"explain"}\n===THINK===\nx\n===ANSWER===\ny';
      })();
    },
  };
}

function ask(body: unknown, origin: string | null = ORIGIN): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin !== null) headers.Origin = origin;
  return new Request("https://deploy.convex.site/ask/chat", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("/ask/chat: a disallowed or missing Origin is 403, reserves no budget and spends nothing", async () => {
  const db = new FakeDb();
  const spend = { take: 0, complete: 0 };
  for (const origin of [...BAD_ORIGINS, null]) {
    const res = await handleAsk(ask(ASK_BODY, origin), askDeps(db, spend));
    assert.equal(res.status, 403, String(origin));
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
    if (origin !== null) {
      const pre = handleAskPreflight(
        new Request("https://deploy.convex.site/ask/chat", { method: "OPTIONS", headers: { Origin: origin } }),
        ASK_ENV,
      );
      assert.equal(pre.status, 403, `preflight ${origin}`);
    }
  }
  assert.deepEqual(spend, { take: 0, complete: 0 });
});

test("/ask/chat: oversized bodies are 413 and the per-minute cap is 429, neither spends", async () => {
  const db = new FakeDb();
  const spend = { take: 0, complete: 0 };
  const big = await handleAsk(ask("x".repeat(MAX_ASK_BODY + 1)), askDeps(db, spend));
  assert.equal(big.status, 413);
  assert.deepEqual(spend, { take: 0, complete: 0 });

  for (let i = 0; i < 12; i++) {
    const ok = await handleAsk(ask(ASK_BODY), askDeps(db, spend));
    assert.equal(ok.status, 200, `call ${i + 1}`);
    await ok.text();
  }
  const capped = await handleAsk(ask(ASK_BODY), askDeps(db, spend));
  assert.equal(capped.status, 429);
  assert.equal(((await capped.json()) as { code: string }).code, "RATE_LIMITED");
  assert.equal(spend.complete, 12);
});

// ------------------------------------------------------------- Exo Key provider

test("Exo Key: an incomplete or non-https issuer config registers no provider (fail closed)", () => {
  const good = {
    EXO_ID_ISSUER: "https://frugal-eel-930.convex.site/exo-id",
    EXO_ID_AUDIENCE: "cosmograph",
    EXO_ID_CLIENT_ID: "cosmograph",
  };
  assert.ok(exoKeyConfig(good));
  for (const bad of [
    {},
    { ...good, EXO_ID_ISSUER: "" },
    { ...good, EXO_ID_ISSUER: "http://frugal-eel-930.convex.site/exo-id" },
    { ...good, EXO_ID_AUDIENCE: "" },
    { ...good, EXO_ID_CLIENT_ID: "" },
    { ...good, EXO_ID_CLIENT_ID: "someone-else" },
  ]) {
    assert.equal(exoKeyConfig(bad), null, JSON.stringify(bad));
  }
});
