# Browser tests plan (Playwright)

Status: plan, not built. Nothing here runs in the Render build gate. The gate
(`pnpm run gate`) stays fast and browser-free: typecheck, lint and the
node:test suites. Browser tests run against a deployed staging build, after
it is live, so they never spend Render build minutes.

## Why Playwright

The libraries-first pick for end-to-end browser tests: one maintained
library that drives Chromium, Firefox and WebKit, has auto-waiting locators,
traces and screenshots on failure, `storageState` for reusing a signed-in
session, and request interception for asserting on Convex calls. Cypress was
the alternative; it is Chromium-first, runs inside the page (awkward for the
Exo Imprint redirect to another origin) and its WebKit support is experimental, which
matters because Samir reviews on Safari and iPhone.

## Where it runs

GitHub Actions do not run on Interspace repos, and Samir runs no terminal
commands. So the suite runs as a tested code path, never by hand:

1. **Primary: Exo Overwatch** (`apps/overwatch` in the exo repo), which already
   runs Chromium apart from the control plane. A post-deploy job runs the
   Cosmograph suite against `https://staging.exo.now/cosmograph` after each
   live staging deploy and reports pass/fail with the trace.
2. Fallback: Hark runs the same suite in its sandbox on request.

The specs live in this repo (`tests/browser/`, a `test:browser` script and
`playwright.config.ts`), so they are reviewed in PRs with the code they test.
The browsers are installed by the runner, not by `pnpm install`, so the
Render install stays the same size.

## Test accounts and secrets

- One Exo Imprint test account on Exo staging (issuer
  `https://frugal-eel-930.convex.site/exo-id`) with a Cosmograph staging grant,
  and a second with no grant (for the 403 path).
- Its sign-in secret and TOTP seed, if Exo Imprint asks for one, live in the
  Bitwarden "Cosmograph Staging" project and are read by the runner's
  read-only machine account at run time. Never in the repo, never in env on
  Render, never printed.
- Stripe: test mode only. The runner asserts the Checkout URL is on
  `checkout.stripe.com` and that the session is a test-mode one, and refuses to
  continue otherwise.

## Suites

### 1. Sign-in through the Exo Imprint gateway

- Open `https://staging.exo.now/cosmograph` signed out: the gateway sends the
  browser to Exo Imprint.
- Sign in with the test account; land back on the app.
- `/cosmograph/auth/callback` completes (PKCE code exchange) and the account
  indicator shows the signed-in state.
- Save `storageState` so the other suites start signed in.
- Negative: the account without a staging grant gets the gateway's denial;
  the raw onrender.com origin answers 403 without the gateway token (checked
  with a plain request, not a page).

### 2. World load

- The galaxy renders: the WebGL canvas mounts, the default researcher's title
  and headline stats are visible, no console errors, no failed requests other
  than known optional ones (presence, GitHub stars).
- Click a domain and a paper; the detail panel opens with real data.
- Ask Cosmo: one question returns a streamed answer and highlights papers
  (staging Convex must have HTTP actions deployed; skip with a clear reason
  when `/health` says it is not ready).
- Budget: first meaningful paint and frame time are recorded, not asserted,
  until a quiet runner gives stable numbers (the isometric world's 15 fps
  phone gate is tracked separately in PR #20).

### 3. Membership checkout to Stripe test mode

- Signed in, start membership checkout (annual) from the unlock flow.
- The SPA calls `POST https://shiny-magpie-750.convex.site/billing/checkout`
  with the Exo Key Bearer token from the app origin; the response is 200 with
  a Checkout URL.
- The browser reaches Stripe Checkout in test mode; pay with Stripe's test
  card; return to the app.
- Membership turns on only after the signed webhook lands: poll the
  entitlement in the UI (no success-URL trust), within a bounded wait.
- Lifetime plan the same way. Portal: a member opens the billing portal.
- Cleanup: the test customer's subscription is cancelled in Stripe test mode
  by the runner at the end.

Preconditions for suite 3 on staging: `convex-account` released on the
friends-and-family channel (3.44.0), Convex functions pushed to
`shiny-magpie-750`, test-mode prices and Stripe test keys in the "Cosmograph
Staging" Bitwarden project, and a Stripe test webhook pointing at
`https://shiny-magpie-750.convex.site/stripe/webhook`.

## Order of work

1. `playwright.config.ts`, `tests/browser/` scaffold, `test:browser` script.
2. Suite 1 (its saved session feeds the others), then suite 2, then suite 3
   once its preconditions hold.
3. Overwatch post-deploy job; report to the PR or the release record.
