---
name: Iframe auth handoff
description: Why Cosmograph auth detects iframing and hands Exo Key sign-in off to a new top-level tab.
---

Sign-in is Exo Key (Exo ID) only: `/sign-in` and `/sign-up` start the Exo ID
authorization-code + PKCE hand-off to Exo's hosted authorize page, and
`/auth/callback` redeems the code (see `src/lib/auth.tsx`, `src/lib/exoId/`,
`src/components/AuthPages.tsx`). Clerk is removed everywhere.

Exo's authorize page and the Google/GitHub consent screens behind it refuse to
render inside an iframe (embedded previews, anyone embedding cosmograph.space).

**Decision:** `AuthHandoff` (wraps `ExoSignInPanel` in the auth drawer and the
`/sign-in` route) detects `window.self !== window.top` (try/catch, a cross-origin
throw means framed) and, when framed, shows a "Continue in a new window" button
that opens `<base>/<mode>` top-level. The sign-in route skips its automatic
hand-off while framed. Tokens land in this origin's localStorage, so the framed
app picks the session up through the `storage` event. When not framed it renders
the real panel unchanged.

## Signed-out "Sign In" vs "Sign Up" hint
`lib/authMemory.ts` keeps a per-browser "seen" flag (set by `AuthMemoryBridge`
after any sign-in) so the cockpit shows Sign Up to brand-new visitors and Sign In
to returners. Exo's access token does not say which provider was used (Exo's own
page remembers the last provider), so no SSO hint is stored any more; stale
Clerk-era hints are cleared on the next sign-in.

## Staging gateway loop
Behind the EXO staging gateway the visitor already has an Exo session, so
`/sign-in` starts the hand-off without a click (loop guard: two automatic tries
per minute per tab, `lib/exoId/autoSignIn.ts`), and only returns to `next` once
a fresh token is mirrored into the `exo_access` cookie. The server verifies the
gateway's Bearer and the cookie in turn and accepts the first valid `cosmograph`
token (Universe #33/#34).
