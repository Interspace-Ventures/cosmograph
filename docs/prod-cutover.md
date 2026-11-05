# Production cutover: Railway to Render

Moves cosmograph.space off Railway onto the Render service
`cosmograph-production` defined in `render.yaml`. Every step below is a
manual, approved action; nothing here runs from CI. Downtime of a few minutes
during the DNS move is acceptable for Cosmograph.

Production contract: branch `main`, served at the root of
`https://cosmograph.space` (and `www`), health `/api/health`,
`DEPLOY_ENVIRONMENT=production`, `RELEASE_CHANNEL=public`, Convex deployment
`marvelous-grouse-975`, Exo Imprint issuer
`https://befitting-bullfrog-619.convex.site/exo-id`.

## 0. Before you start

- This PR is merged into `staging` and reviewed at `staging.exo.now/cosmograph`.
- Secrets live in Bitwarden Secrets Manager (moved from 1Password,
  2026-11-05). Cosmograph's production project holds these secrets, looked
  up by key name; each key name must be unique within the project:
  - `COSMOGRAPH_PROD_OPENAI_API_KEY` (Ask Cosmo)
  - `COSMOGRAPH_PROD_EXO_INTAKE_SECRET` (feedback intake HMAC, 32+ chars)
  - for the Convex billing actions: `COSMOGRAPH_PROD_STRIPE_SECRET_KEY` and
    `COSMOGRAPH_PROD_STRIPE_WEBHOOK_SECRET` (live mode, matching
    `STRIPE_MODE=live` on the Convex production deployment)
- Two machine accounts exist, each with **Can read** on that project only, and
  each with one access token: one for the Render service, one for the Convex
  production deployment. A token is the only secret either host ever holds.
  Access is per project, so the Render token can also read the Stripe
  secrets in the same project; for least privilege put the Stripe secrets in
  a separate project that only the Convex machine account can read, and set
  that project's id as the Convex deployment's `BWS_PROJECT_ID`.
- Note the organization id and the project id(s) (UUIDs, not secret). The
  code defaults to Bitwarden's US cloud; for the EU cloud also set
  `BWS_API_URL=https://api.bitwarden.eu` and
  `BWS_IDENTITY_URL=https://identity.bitwarden.eu` on both hosts.
- EXO has issued the production Exo Imprint client id for Cosmograph, with
  `https://cosmograph.space/auth/callback` registered.

## 1. Create the Render production service

In the Render project "Cosmograph" (Production environment), sync the
Blueprint from `render.yaml` so `cosmograph-production` is created (Starter,
virginia, branch `main`, 1 instance). Do not change the plan or scale it out:
presence and the spend guards need a single long-lived process.

## 2. Set the dashboard-only values

On `cosmograph-production` set the `sync: false` values:

- `BWS_ACCESS_TOKEN`: the Render machine account's read-only access token
- `BWS_ORGANIZATION_ID` and `BWS_PROJECT_ID`: the UUIDs noted above
  (`BWS_OPENAI_API_KEY_NAME` / `BWS_EXO_INTAKE_SECRET_NAME` come from
  `render.yaml`)
- `VITE_EXO_ID_CLIENT_ID`: the production client id from EXO (build-time;
  redeploy after setting it)

Never set `AI_INTEGRATIONS_OPENAI_API_KEY`, `EXO_INTAKE_SECRET` or any Stripe
secret as Render env, and remove any leftover `OP_SERVICE_ACCOUNT_TOKEN`
(the server logs a warning while it is set). The server ignores them outside local dev and logs a
warning naming the variable. Set `EXO_INTAKE_API_URL` (non-secret) once EXO
gives the production intake URL; until then `/api/health` reports
`exoIntake.reason = "api-url-missing"`.

## 3. Push Convex production

Cosmograph's Convex project default "prod" deployment is `shiny-magpie-750`,
which is **staging**. Every deploy to production must name the deployment
explicitly; a bare `npx convex deploy` ships to staging's slot.

```sh
npx convex deploy --deployment production   # marvelous-grouse-975
```

Before that, confirm the production deployment's env (non-secret billing
config, `BWS_ACCESS_TOKEN` (the Convex machine account's token),
`BWS_ORGANIZATION_ID`, `BWS_PROJECT_ID`,
`BWS_STRIPE_SECRET_KEY_NAME=COSMOGRAPH_PROD_STRIPE_SECRET_KEY`,
`BWS_STRIPE_WEBHOOK_SECRET_NAME=COSMOGRAPH_PROD_STRIPE_WEBHOOK_SECRET`, no
`OP_*` variables, `STRIPE_MODE=live`, price ids, `PUBLIC_APP_ORIGINS`) and the Exo Key
issuer in `convex/auth.config.ts` for production.

## 4. Promote staging to main

Open a `staging` -> `main` PR. Merge only with Samir's explicit approval.
Render auto-deploys `main` to `cosmograph-production`. Check on the
onrender.com URL:

1. `/api/health` returns 200 with `environment: "production"`, the merged
   commit, and `integrations.openai.ready: true` with `source: "bitwarden"`
   (and `exoIntake` once its URL is set). A `reason` of `bws-token-missing`,
   `bws-config-missing`, `key-name-missing`, `secret-not-found`,
   `secret-ambiguous` or `lookup-failed` names what to fix.
2. `/` serves the galaxy (no 403: the staging boundary is off).
3. Response headers carry the CSP (report-only) with the
   `marvelous-grouse-975` and `befitting-bullfrog-619` origins.

## 5. Add the custom domain on Render

On `cosmograph-production` add `cosmograph.space` and `www.cosmograph.space`.
Render shows the DNS records to create and issues certificates once DNS
resolves.

## 6. Move DNS at Spaceship

Lower the TTL first if it is long. Replace the records that point at Railway
with the ones Render showed (apex `A`/`ALIAS` and `www` `CNAME`). Then wait for
Render to verify both hostnames and issue certificates, and confirm
`https://cosmograph.space/api/health` is served by Render (no
`x-railway-*` / `server: railway-*` headers) and reports the merged commit.

## 7. Re-measure TRUST_PROXY_HOPS

With the custom domain live, repeat the staging measurement: send requests
with a forged `X-Forwarded-For` and confirm the per-IP rate-limit bucket keeps
counting down. If the edge chain changed, set the measured hop count, redeploy
and re-check. Two hops was measured on staging (lib/trustProxy.ts).

## 8. Switch off Railway

Only after production on Render has been healthy and DNS has fully moved:
remove the custom domains from the Railway service, then stop and delete the
Railway production service and its variables (this also retires any secrets
that lived there). Nothing in the repo references Railway any more.

Once both hosts report `source: "bitwarden"`, revoke the old 1Password
service account token (`OP_SERVICE_ACCOUNT_TOKEN`); nothing reads it.

## Rollback

Before step 6: nothing public changed; fix forward on Render. After step 6:
point Spaceship DNS back at Railway (keep Railway running until step 8), or
roll back to a previous Render deploy.
