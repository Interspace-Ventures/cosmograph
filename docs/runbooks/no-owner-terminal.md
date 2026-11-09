# No terminal for the owner: Convex deploys

Samir never runs a terminal command for Cosmograph (standing rule, 2026-11-06).
Every Convex step that used to be `npx convex deploy` or `npx convex env set`
runs as tested code inside the Render deploy, with reviewable PRs as the
oversight. Same pattern as Construct (construct#501) and Exo (exo#354).

## What runs

`cosmograph-staging` (Render, branch `staging`) has the pre-deploy command

```
node scripts/convex/deploy-from-bitwarden.mjs --pre-deploy
```

On every staging deploy, after the build and before the new instance starts:

1. Refuse production before any secret is read (see Production below).
2. Read, with the service's one read-only `BWS_ACCESS_TOKEN`, the Bitwarden
   Secrets Manager project `BWS_PROJECT_ID` ("Cosmograph Staging"):
   `CONVEX_DEPLOY_KEY` and any `CONVEX_ENV_<NAME>` secrets.
3. Check the key is for `shiny-magpie-750` (`prod:shiny-magpie-750|…`; staging
   is the Convex project's default production slot) and agrees with
   `VITE_CONVEX_URL`. Anything else stops the deploy.
4. Set each `CONVEX_ENV_<NAME>` as Convex env `<NAME>` (add or update, never
   delete; `CONVEX_*` names are never synced).
5. `npx convex deploy` with the key in the child's env only
   (`--typecheck disable --codegen disable`, audit message
   `render pre-deploy <commit>`). Output is scrubbed of the key.
6. Read-only smoke checks on `https://shiny-magpie-750.convex.site`:
   `GET /health` returns 200 with the Ask Cosmo gateway reason, and
   `OPTIONS /ask/chat` from `https://staging.exo.now` returns 204 (404 while
   `ask-cosmo` is off).

A failure in any step exits 1, so Render fails the deploy and the previous one
keeps serving. With no `BWS_ACCESS_TOKEN` on the service it logs one line and
skips (exit 0), so the app still deploys.

There is no plain-env key path: a Convex deploy key is never set as a Render
environment variable.

## Where the key lives

| What | Where |
| --- | --- |
| Convex deploy key for shiny-magpie-750 | Bitwarden org Interspace Ventures, SM project "Cosmograph Staging", secret `CONVEX_DEPLOY_KEY` |
| Read access | Machine account `cosmograph-staging`, read-only, that project only |
| On the host | `BWS_ACCESS_TOKEN` (secret, dashboard), `BWS_ORGANIZATION_ID`, `BWS_PROJECT_ID` (not secret) |

Rotate: generate a new deploy key for shiny-magpie-750 in the Convex
dashboard, replace the Bitwarden secret value, revoke the old key. No Render
change is needed; the next deploy reads the new value.

## Switches

| Env on the Render service | Effect |
| --- | --- |
| `COSMOGRAPH_CONVEX_PREDEPLOY=off` | skip the Convex push entirely |
| `COSMOGRAPH_CONVEX_ENV_SYNC=off` | push, but leave Convex env untouched |
| `COSMOGRAPH_BWS_CONVEX_KEY_NAME` | Bitwarden secret name (default `CONVEX_DEPLOY_KEY`) |
| `COSMOGRAPH_CONVEX_EXPECTED_DEPLOYMENT` | extra pin; must equal the environment's deployment |
| `IS_PULL_REQUEST=true` (Render previews) | skip unless `CONVEX_PREVIEW_PUSH=true` |

## Production

Wired in `render.yaml` (Samir approved, 2026-11-07): `cosmograph-production`
runs the same pre-deploy with `COSMOGRAPH_DEPLOYMENT_ENVIRONMENT=production`
and `COSMOGRAPH_ALLOW_PROD_CONVEX_DEPLOY=1`. `marvelous-grouse-975` is refused,
before any secret is read, unless both are set, and then only with a
`prod:marvelous-grouse-975|…` key from the "Cosmograph Production" Bitwarden
project, read with that service's own read-only token. Any manual production
deploy names `--deployment production`, since the project's default production
slot is staging.

## Current state (2026-11-08)

- Staging: `cosmograph-staging` has no `BWS_ACCESS_TOKEN` yet, so the
  pre-deploy logs one line and skips. `shiny-magpie-750` therefore has no HTTP
  actions deployed (`/health`, `/ask/chat` and `/billing/*` answer Convex's
  "does not have HTTP actions enabled" 404). It needs the "Cosmograph Staging"
  Bitwarden project, its `CONVEX_DEPLOY_KEY`, and the machine-account token on
  the service.
- Production: the 3.43.4 deploy (`e780d94`) failed in the pre-deploy because
  the "Cosmograph Production" project has no `CONVEX_DEPLOY_KEY`; `3576b2f`
  keeps serving and `marvelous-grouse-975` has no HTTP actions deployed either.

## Rollback

Rolling back a Convex push is redeploying the last good commit through this
same pre-deploy; see [rollback.md](rollback.md).

## Tests

`pnpm run test:deploy` (node:test, no network): staging push, skip without a
token, no plain-env key, production refusals, wrong-deployment keys, kill
switches, dry run, failure paths, Bitwarden project filtering, env sync plan.
