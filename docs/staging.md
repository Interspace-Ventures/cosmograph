# Staging environment

Cosmograph staging is a private review surface, not a second public launch.

## Canonical contract

- canonical URL: `https://staging.exo.now/cosmograph`
- provider fallback: `https://cosmograph-staging.up.railway.app/cosmograph`
- source branch: `staging`
- provider environment: `staging`
- health endpoint: `/cosmograph/api/health`
- data: the Cosmograph staging Convex deployment
- release audience: `friends-and-family`
- access: only through the EXO gateway (Exo Imprint sign-in + staging grant)

The EXO gateway signs the reviewer in with Exo Imprint, checks their staging
grant, and forwards the request with a short-lived RS256 token
(`x-exo-gateway-token`, `aud = exo-gateway:cosmograph`). The origin verifies it
against Exo Key's public JWKS and answers `403` to anything without it, so the
Railway fallback URL is useless on its own. Only the health endpoint and static
assets stay public. Staging responses are private, non-cacheable,
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

## Naming

App staging is always reviewed through `staging.exo.now/{app}`. Railway domains
are provider fallbacks only and must not be handed to testers.

## Verification

Before sharing staging, verify all of the following:

1. The Railway fallback URL returns `403` for `/`.
2. `/api/health` returns `200` on both URLs.
3. A forged or expired `x-exo-gateway-token` returns `403`.
4. `https://staging.exo.now/cosmograph` loads after Exo Imprint sign-in.
5. The deployed branch and commit match `staging`.
6. `VITE_CONVEX_URL` points at the Cosmograph staging Convex deployment.
7. HTML and private responses include the staging security headers.
