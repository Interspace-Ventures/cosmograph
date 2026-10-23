# Staging environment

Cosmograph staging is a private review surface, not a second public launch.

## Canonical contract

- canonical URL: `https://staging.exo.now/cosmograph`
- provider fallback: `https://cosmograph-staging.up.railway.app/cosmograph`
- source branch: `staging`
- provider environment: `staging`
- health endpoint: `/cosmograph/api/health`
- database: dedicated Neon branch named `staging`
- release audience: `friends-and-family`
- access: verified Exo Key (Exo ID) access tokens for the `cosmograph` audience only

The health endpoint, the sign-in routes (`/sign-in`, `/sign-up`), the Exo ID
callback (`/auth/callback`), and static assets needed to render sign-in stay
public. Anonymous browser navigation redirects to `/sign-in` and
anonymous API requests return `401`. Staging responses are private, non-cacheable,
non-indexable, and non-embeddable.

Enable the boundary only in staging:

```text
STAGING_AUTH_REQUIRED=true
```

Production must not set this variable unless a separate production access
decision is explicitly approved.

## Exo Key sign-in

Cosmograph signs in only through Exo Key (Exo ID), mirroring Universe
(Interspace-Ventures/universe #29, #33, #34):

1. The EXO staging gateway signs the visitor in to Exo first (its own audience,
   `exo-staging`) and forwards requests with its own token as
   `Authorization: Bearer`.
2. Cosmograph's server does not accept that token by default. Anonymous
   navigation is redirected to `/sign-in?next=<path>`, which starts the Exo ID
   authorization-code + PKCE hand-off for app `cosmograph` on its own. Exo
   already holds the session, so it returns straight to
   `/cosmograph/auth/callback`. A loop guard stops automatic tries after two per
   minute per tab and shows a "Continue with Exo" button instead.
3. The browser stores Cosmograph's tokens and mirrors the access token into the
   `exo_access` cookie (path `/cosmograph`, SameSite=Lax). The server verifies
   every presented token in turn (Bearer, then cookie) and accepts the first
   valid one, so the gateway's `exo-staging` Bearer plus Cosmograph's cookie
   works, while an `exo-staging` token alone is rejected.

Non-secret configuration (no auth secrets exist):

```text
VITE_EXO_ID_ISSUER=https://frugal-eel-930.convex.site/exo-id
EXO_ID_ISSUER=https://frugal-eel-930.convex.site/exo-id
EXO_ID_AUDIENCE=cosmograph
```

`EXO_ID_AUDIENCE` is a comma-separated allow-list. Adding `exo-staging` would
let the gateway's token act as a Cosmograph session (and let any Exo staging
token be replayed against the raw provider URL), so it stays off unless that is
an explicit, reviewed decision.

Exo-side prerequisite: Exo's app registry (`convex/lib/exoIdApps.ts` in
Interspace-Ventures/exo) must list app `cosmograph` with the exact redirect URIs
(`https://staging.exo.now/cosmograph/auth/callback`, the production callback,
and a local dev callback matching the dev base path, e.g.
`http://localhost:3000/cosmograph/auth/callback`) and browser origins.
Until it does, Exo's authorize page rejects the hand-off.

## Naming

App staging is always reviewed through `staging.exo.now/{app}`. Railway domains
are provider fallbacks only and must not be handed to testers.

## Verification

Before sharing staging, verify all of the following:

1. Anonymous `/` redirects to `/sign-in`.
2. Anonymous `/api/health` returns `200`.
3. Anonymous non-health API requests return `401`.
4. A signed-in Exo Key session (app `cosmograph`) can load `/`, and the API accepts its `exo_access` cookie.
5. The deployed branch and commit match `staging`.
6. The database endpoint belongs to the Neon `staging` branch.
7. HTML and private responses include the staging security headers.
