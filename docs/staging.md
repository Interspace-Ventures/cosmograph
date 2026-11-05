# Staging environment

Cosmograph staging is a private review surface, not a second public launch.

## Canonical contract

- canonical URL: `https://staging.exo.now/cosmograph`
- origin: Render web service `cosmograph-staging` (`render.yaml`),
  `https://cosmograph-staging.onrender.com/cosmograph`
- source branch: `staging`
- deployment name: `DEPLOY_ENVIRONMENT=staging`
- health endpoint: `/cosmograph/api/health` (reports `RENDER_GIT_COMMIT`)
- data: the Cosmograph staging Convex deployment
- release audience: `friends-and-family` (`RELEASE_CHANNEL`)
- access: only through the EXO gateway (Exo Imprint sign-in + staging grant)

The EXO gateway signs the reviewer in with Exo Imprint, checks their staging
grant, and forwards the request with a short-lived RS256 token
(`x-exo-gateway-token`, `aud = exo-gateway:cosmograph`). The origin verifies it
against Exo Key's public JWKS and answers `403` to anything without it, so the
onrender.com origin URL is useless on its own. Only the health endpoint and
static assets stay public. Staging responses are private, non-cacheable,
non-indexable, and non-embeddable.

Enable the boundary only in staging:

```text
STAGING_AUTH_REQUIRED=true
EXO_KEY_ISSUER=https://frugal-eel-930.convex.site/exo-id
```

Both are public, non-secret. EXO must send gateway tokens for Cosmograph
(`EXO_GATEWAY_TOKENS=dual` or `only`); the origin never reads the legacy
shared `STAGING_GATEWAY_SECRET`.

Production must not set this variable unless a separate production access
decision is explicitly approved.

## Host

Render runs the Express API and the built SPA as one always-on web service:
`pnpm install --frozen-lockfile && pnpm run deploy:build`, then
`pnpm run deploy:start`. Node comes from `.node-version`. All platform env is
public configuration listed in `render.yaml`; no secret is set on the host
except, later, one read-only Bitwarden Secrets Manager machine-account token
(`BWS_ACCESS_TOKEN`). Rollback is a previous
Render deploy.

## Naming

App staging is always reviewed through `staging.exo.now/{app}`. The
onrender.com origin is for the gateway and health checks only and must not be
handed to testers.

## Verification

Before sharing staging, verify all of the following:

1. The onrender.com origin returns `403` for `/cosmograph/`.
2. `/cosmograph/api/health` returns `200` on both URLs.
3. A forged or expired `x-exo-gateway-token` returns `403`.
4. `https://staging.exo.now/cosmograph` loads after Exo Imprint sign-in.
5. The deployed branch and commit match `staging`.
6. `VITE_CONVEX_URL` points at the Cosmograph staging Convex deployment.
7. HTML and private responses include the staging security headers.
