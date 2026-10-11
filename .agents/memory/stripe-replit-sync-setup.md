---
name: stripe-replit-sync (retired)
description: Historical note. The Replit Stripe sync library was removed; do not reintroduce it.
---

# stripe-replit-sync is retired

The api-server no longer uses `stripe-replit-sync` (removed on branch
`agent/launch-billing`). Webhooks are verified directly with the Stripe SDK and
applied via `handleStripeEvent` in `artifacts/api-server/src/lib/billing.ts`;
products/prices come from `artifacts/api-server/scripts/stripe-setup.mjs`.

Leftover in existing databases: a `stripe` schema created by the old library.
Nothing reads it; it can be dropped once billing v2 is live. The app tables
(`users`, `researcher_unlocks`, `ship_unlocks`, `stripe_events`) are Drizzle
managed; apply schema changes with `pnpm --filter @workspace/db run push`
against the target DATABASE_URL before deploying code that needs them.

General lesson that still applies: any Node library that reads files relative
to its own `__dirname` at runtime must be externalized from the esbuild bundle.
