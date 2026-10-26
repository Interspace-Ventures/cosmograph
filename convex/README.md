# Cosmograph on Convex

[docs/convex-migration-plan.md](../docs/convex-migration-plan.md). Phase 1:
scaffold, schema and Exo Key on Convex Auth. Phase 2: account, researcher
unlocks, ship unlocks and referrals ported from Express, with the SPA switched
to the Convex client behind the `convex-account` release flag (default off).
Phase 3: billing ($9.99/yr or $29.99 lifetime, absorbed from PR #12) with a
signature-verified Stripe webhook, still behind the same flag.
The Express API in `artifacts/api-server` keeps serving every build with the
flag off, and stays until Phase 5.

| File | What it is |
|---|---|
| `schema.ts` | `users`, `researcherUnlocks`, `shipUnlocks`, mapped from `lib/db` (Postgres). Users are keyed by the Exo subject. |
| `auth.config.ts` | Exo ID as the only identity provider (`customJwt`, RS256, Exo's public JWKS). |
| `lib/exoKey.ts` | Reads `EXO_ID_ISSUER`, `EXO_ID_AUDIENCE`, `EXO_ID_CLIENT_ID` (non-secret); identity helpers. |
| `lib/server.ts` | Typed function builders (stand-in for `_generated/server` until codegen can run). |
| `users.ts` | `users.current` (query) and `users.ensure` (mutation, find-or-create on sign-in). |
| `account.ts` | `account.entitlement` (query): port of GET /me/entitlement. |
| `billing.ts` | `billing.unlock` (mutation): port of POST /me/unlock. #12's model: members pin researchers with no add-on charge, up to `MEMBER_UNLOCK_LIMIT` (100, an abuse bound); non-members get `NOT_A_MEMBER` and the SPA starts membership checkout. |
| `ship.ts` | `ship.get` / `ship.save` / `ship.claim`: ports of GET/PUT /me/ship and POST /me/ship/claim (`premium-ships` gated). Ships are included in membership (#12); a non-member's claim returns `checkoutRequired` and the SPA starts membership checkout carrying the hull. |
| `http.ts` | HTTP routes: `POST/OPTIONS /billing/checkout`, `POST/OPTIONS /billing/portal`, `POST /stripe/webhook`. All 404 while `convex-account` is off. |
| `billingInternal.ts` | Internal only: `prepareCheckout` (entitlement check + budget), `setStripeCustomer`, `preparePortal`, `eventSeen`, `applyEvent` (the only writer of membership), `pruneRateCounters`. |
| `stripeNode.ts` | `"use node"` internal actions: `createCheckout`, `createPortal`, `processWebhook`. Load Stripe secrets from 1Password, call Stripe. |
| `crons.ts` | Daily prune of expired rate counters. |
| `lib/billingConfig.ts` | Non-secret billing config from env (price ids, origins, limits, vault item names, `STRIPE_MODE`). |
| `lib/opSecrets.ts` | Reads `STRIPE_SECRET_KEY` and the webhook signing secret from the 1Password vault via `@1password/sdk`, in memory only. Refuses to run if a Stripe secret is set as env. |
| `lib/checkout.ts` / `lib/webhook.ts` / `lib/entitlement.ts` / `lib/stripeEvents.ts` | Checkout + portal sessions, webhook verification, event normalization, and the entitlement writes (grant, sync, revoke on refund/dispute). |
| `lib/httpBilling.ts` / `lib/rateLimit.ts` | HTTP edge (flag, Origin allowlist, Exo Key auth, bounded input) and the per-minute / daily per-client / global daily budget. |
| `referral.ts` | `referral.mine` / `referral.ensure` / `referral.claim`: ports of GET /me/referral and POST /me/referral/claim (`referrals` gated, new-account-only attribution). |
| `lib/account.ts` | Shared account helpers (find-or-create, unlock lists, sanitizers, constants). |
| `lib/features.ts` | Release gates for Convex functions (RELEASE_CHANNEL / FEATURE_FLAG_OVERRIDES on the deployment), same contract as Express `requireFeature`. |

Rules (exo#232): Convex only, Exo Key only, secrets only from the app's
1Password vault, delivery through Exo. No auth bypass; the
account key always comes from `ctx.auth.getUserIdentity().subject`, never from
arguments. Clean start: no data is imported from Replit.

Local checks: `pnpm run typecheck:convex` and `pnpm run test:convex` (handlers
run against an in-memory ctx in tests/convex, plus the SPA's Exo Key client). `npx convex codegen` needs a
configured deployment, so `convex/_generated` is not committed yet.

## Billing (Phase 3)

Trust model, carried over from #12 and tightened:

- Membership (`hasPaid`, `memberPlan`, status, and the researcher/ship a
  checkout was started for) is written only by `billingInternal.applyEvent`,
  which only `stripeNode.processWebhook` calls after
  `stripe.webhooks.constructEventAsync` verified the signature (300 s
  tolerance). Never from the browser and never from the checkout return URL:
  #12's success-redirect confirm is intentionally not ported.
- Each event id is recorded in `stripeEvents` in the same transaction that
  applies it, so replays are no-ops and a failure records nothing (Stripe
  retries on 5xx).
- Prices are pre-existing ids (`STRIPE_PRICE_ANNUAL`, `STRIPE_PRICE_LIFETIME`),
  only read, and refused unless amount, currency and interval match. Lifetime
  also requires `mode=payment` and `amount_subtotal >= 2999` in USD.
- Annual: subscription events re-read the live subscription; `past_due` keeps
  access, terminal states revoke, only the configured annual price counts.
  Annual -> lifetime stops the renewal. Full refund and dispute revoke and
  cancel any subscription; partial refunds keep membership.
- Checkout creation: allowlisted Origin, Exo Key Bearer token, body <= 2 KB,
  allowlisted return path, `CHECKOUT_PER_MINUTE` (3), `CHECKOUT_DAILY_PER_CLIENT`
  (20), `CHECKOUT_DAILY_GLOBAL` (5000) failing closed; sessions expire in 30 min.

Secrets: no Stripe secret is Convex or platform env. The only secret is a
read-only `OP_SERVICE_ACCOUNT_TOKEN`; the Node actions read the Stripe secret
key and webhook signing secret from the vault items named by
`OP_STRIPE_SECRET_KEY_ITEM` / `OP_STRIPE_WEBHOOK_SECRET_ITEM` in `OP_VAULT`
(e.g. "Cosmograph staging: STRIPE_SECRET_KEY" in "Interspace"), keep them in
memory for up to 5 minutes, and refuse a key whose mode doesn't match
`STRIPE_MODE` (default `test`). `convex.json` marks `@1password/sdk` as an
external Node package (it ships a WASM core).

Before enabling on staging: create the test-mode prices once (outside the
app), set the non-secret env above, add the two vault items, register
`<deployment>.convex.site/stripe/webhook` in Stripe test mode for the events in
`lib/stripeEvents.ts`, and set `VITE_CONVEX_SITE_URL` if the site URL isn't the
`.convex.cloud` -> `.convex.site` default.

## Open

- Exo registration done (exo#229, merged as exo#240). End-to-end sign-in waits
  on EXO redeploying staging Convex (frugal-eel-930) and the staging grant.
- `users.ensure` is called from the SPA after Exo sign-in (Phase 2).
- TODO: once a dev deployment exists, run codegen, commit `_generated`, switch
  imports to `./_generated/server`, and replace the SPA's derived
  `src/lib/convexApi.ts` with the generated `api`. Skipped here: codegen needs
  a deployment and Phase 2 deploys nothing.
