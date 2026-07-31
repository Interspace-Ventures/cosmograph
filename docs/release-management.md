# Feature releases

Cosmograph ships its already-built product surface in deliberate waves instead
of exposing every feature at the first friends-and-family release.

## Current F&F cadence

| Date (UTC) | Feature                 | Flag            |
| ---------- | ----------------------- | --------------- |
| 2026-07-30 | Guided tour             | `guided-tour`   |
| 2026-08-06 | Share cards             | `share-cards`   |
| 2026-08-13 | Ask Cosmo               | `ask-cosmo`     |
| 2026-08-20 | Live presence           | `live-presence` |
| 2026-08-27 | Premium cosmonaut ships | `premium-ships` |
| 2026-09-03 | Referral links          | `referrals`     |

The canonical flag identifiers, descriptions, owners, and dates live in
`lib/release-flags/src/index.ts`. This document is the human-readable release
brief and should change in the same pull request as that registry.

Public dates are intentionally unset. A friends-and-family release never
promotes itself to public.

## Channels

- `internal`: product and engineering preview;
- `friends-and-family`: the private initial cohort and default for Cosmograph;
- `public`: an independently approved public release.

Set the same channel on both application surfaces:

```text
VITE_RELEASE_CHANNEL=friends-and-family
RELEASE_CHANNEL=friends-and-family
```

The release channel controls feature visibility; it is not an access-control
boundary. Private staging must also set `STAGING_AUTH_REQUIRED=true` and follow
[`docs/staging.md`](staging.md).

The browser controls feature discovery. The API separately enforces paid,
costly, or state-changing features, so hiding a button is never the only gate.
Dates are evaluated at midnight UTC and do not require a rebuild once a build
containing the schedule is deployed.

For commerce features, disable creation of new checkouts—not confirmation,
webhook handling, or fulfillment for payments that may already be in flight.

## Operational overrides

Use overrides for a preview or kill switch, not as the long-term roadmap:

```text
VITE_FEATURE_FLAG_OVERRIDES=ask-cosmo=on,live-presence=off
FEATURE_FLAG_OVERRIDES=ask-cosmo=on,live-presence=off
```

Valid states are `on` and `off`. Unknown flags and malformed entries are
ignored. Keep browser and server overrides aligned for any API-backed feature.
Never use a client-side flag as authorization.

## Release workflow

1. Develop the feature behind its named flag and enforce server-side behavior
   where the feature creates cost, changes state, or exposes private data.
2. Preview with the `internal` channel or a short-lived explicit override.
3. Run `pnpm run release:check`, `pnpm run typecheck`, and the relevant focused
   tests.
4. Merge through staging without changing the F&F or public release date.
5. Confirm the F&F date and user-facing changelog entry in a separate,
   reviewable release change.
6. Verify the deployed channel, date, route behavior, and visible UI.
7. Set a public date only after explicit production approval.

For an emergency rollback, set the flag to `off` on both surfaces, redeploy the
configuration, verify the feature UI and APIs are unavailable, then record the
reason in the changelog and roadmap.

## Adding a flag

Add the identifier to `FEATURE_IDS`, add one complete entry to
`FEATURE_RELEASES`, integrate it at every relevant client and server boundary,
add date/override coverage to `index.test.ts`, and update the cadence table
above. Flags should represent user-visible capabilities, not individual code
paths or permanent permissions such as membership entitlements.
