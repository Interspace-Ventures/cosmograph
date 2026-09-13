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
- access: authenticated Clerk sessions only

The health endpoint, Clerk sign-in routes, and static assets needed to render
sign-in stay public. Anonymous browser navigation redirects to `/sign-in` and
anonymous API requests return `401`. Staging responses are private, non-cacheable,
non-indexable, and non-embeddable.

Enable the boundary only in staging:

```text
STAGING_AUTH_REQUIRED=true
```

Production must not set this variable unless a separate production access
decision is explicitly approved.

## Naming

App staging is always reviewed through `staging.exo.now/{app}`. Railway domains
are provider fallbacks only and must not be handed to testers.

## Verification

Before sharing staging, verify all of the following:

1. Anonymous `/` redirects to `/sign-in`.
2. Anonymous `/api/health` returns `200`.
3. Anonymous non-health API requests return `401`.
4. An authenticated Clerk session can load `/`.
5. The deployed branch and commit match `staging`.
6. The database endpoint belongs to the Neon `staging` branch.
7. HTML and private responses include the staging security headers.
