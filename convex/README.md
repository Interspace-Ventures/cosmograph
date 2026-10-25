# Cosmograph on Convex

Phase 1 of [docs/convex-migration-plan.md](../docs/convex-migration-plan.md):
scaffold, schema and Exo Key on Convex Auth. The Express API in
`artifacts/api-server` still serves the app until its routes are ported
(Phases 2-4) and removed (Phase 5).

| File | What it is |
|---|---|
| `schema.ts` | `users`, `researcherUnlocks`, `shipUnlocks`, mapped from `lib/db` (Postgres). Users are keyed by the Exo subject. |
| `auth.config.ts` | Exo ID as the only identity provider (`customJwt`, RS256, Exo's public JWKS). |
| `lib/exoKey.ts` | Reads `EXO_ID_ISSUER`, `EXO_ID_AUDIENCE`, `EXO_ID_CLIENT_ID` (non-secret); identity helpers. |
| `lib/server.ts` | Typed function builders (stand-in for `_generated/server` until codegen can run). |
| `users.ts` | `users.current` (query) and `users.ensure` (mutation, find-or-create on sign-in). |

Rules (exo#232): Convex only, Exo Key only, secrets only from the app's
1Password vault via Exo Secure, delivery through Exo. No auth bypass; the
account key always comes from `ctx.auth.getUserIdentity().subject`, never from
arguments. Clean start: no data is imported from Replit.

Local checks: `pnpm run typecheck:convex`. `npx convex codegen` needs a
configured deployment, so `convex/_generated` is not committed yet.

## Open

- TODO(exo#229): Exo must register app `cosmograph` and its `/auth/callback`
  redirect URIs before sign-in can be tested end to end.
- TODO(phase 2): create a dev deployment, run codegen, commit `_generated`,
  switch imports to `./_generated/server`, and call `users.ensure` from the SPA
  after sign-in.
