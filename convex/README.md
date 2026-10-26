# Cosmograph on Convex

[docs/convex-migration-plan.md](../docs/convex-migration-plan.md). Phase 1:
scaffold, schema and Exo Key on Convex Auth. Phase 2: account, researcher
unlocks, ship unlocks and referrals ported from Express, with the SPA switched
to the Convex client behind the `convex-account` release flag (default off).
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
| `billing.ts` | `billing.unlock` (mutation): port of POST /me/unlock for the included slots. Checkout, webhook and the +$1/year add-on are Phase 3; beyond the included slots it fails closed (`ADDON_UNAVAILABLE`, nothing charged or recorded). |
| `ship.ts` | `ship.get` / `ship.save` / `ship.claim`: ports of GET/PUT /me/ship and the free-slot half of POST /me/ship/claim (`premium-ships` gated). The $1 checkout is Phase 3 (`checkoutRequired`). |
| `referral.ts` | `referral.mine` / `referral.ensure` / `referral.claim`: ports of GET /me/referral and POST /me/referral/claim (`referrals` gated, new-account-only attribution). |
| `lib/account.ts` | Shared account helpers (find-or-create, unlock lists, sanitizers, constants). |
| `lib/features.ts` | Release gates for Convex functions (RELEASE_CHANNEL / FEATURE_FLAG_OVERRIDES on the deployment), same contract as Express `requireFeature`. |

Rules (exo#232): Convex only, Exo Key only, secrets only from the app's
1Password vault via Exo Secure, delivery through Exo. No auth bypass; the
account key always comes from `ctx.auth.getUserIdentity().subject`, never from
arguments. Clean start: no data is imported from Replit.

Local checks: `pnpm run typecheck:convex` and `pnpm run test:convex` (handlers
run against an in-memory ctx in tests/convex, plus the SPA's Exo Key client). `npx convex codegen` needs a
configured deployment, so `convex/_generated` is not committed yet.

## Open

- Exo registration done (exo#229, merged as exo#240). End-to-end sign-in waits
  on EXO redeploying staging Convex (frugal-eel-930) and the staging grant.
- `users.ensure` is called from the SPA after Exo sign-in (Phase 2).
- TODO: once a dev deployment exists, run codegen, commit `_generated`, switch
  imports to `./_generated/server`, and replace the SPA's derived
  `src/lib/convexApi.ts` with the generated `api`. Skipped here: codegen needs
  a deployment and Phase 2 deploys nothing.
