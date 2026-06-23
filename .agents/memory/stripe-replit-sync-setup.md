---
name: Stripe (stripe-replit-sync) setup traps
description: Two non-obvious failures wiring Stripe into the esbuild-bundled api-server — connector credential field names and the silently-skipped migrations directory.
---

# Stripe + stripe-replit-sync in the bundled api-server

Two distinct traps, both of which present as "Stripe not initialized / paid unlock disabled" even though the integration is connected.

## 1. Connector credential field names

The Replit Stripe connection's `settings` exposes the secret as **`secret`** (and `publishable`, `webhook_secret`, `account_id`, `mcp`), **not** `secret_key`.
- The credential fetch in `stripeClient.ts` (`GET https://$REPLIT_CONNECTORS_HOSTNAME/api/v2/connection?include_secrets=true&connector_names=stripe`) returns `items[0].settings.secret`.
- Inspect live field names with `listConnections('stripe')` in the code_execution sandbox (read `settings` keys / `toonSchema`).

**Why:** a boilerplate that reads `settings.secret_key` silently fails the `if (!settings.secret_key)` guard and throws "not connected", masking that the connection is actually healthy.

## 2. esbuild bundling silently skips runMigrations table creation

`runMigrations({ databaseUrl })` from `stripe-replit-sync` creates the `stripe` SCHEMA via `CREATE SCHEMA IF NOT EXISTS`, then loads SQL migrations from `path.resolve(__dirname, "./migrations")`. If that directory is missing it logs "Migrations directory not found, skipping" and returns **without throwing** — so the schema exists but is empty, and the first `stripe.accounts` query fails with `relation "stripe.accounts" does not exist`.

When the api-server is bundled by esbuild, the library code is inlined into `dist/index.mjs`, so `__dirname` resolves to the api-server's `dist/` (no `migrations` folder) and every migration is skipped.

**Fix:** add `"stripe-replit-sync"` to the esbuild `external` array in `build.mjs` so it loads from `node_modules` at runtime with its bundled `./migrations` folder intact.

**How to apply:** any node library that reads files relative to its own `__dirname` at runtime (migrations, .proto, templates) must be externalized from the esbuild bundle, or it will silently no-op after bundling.

**Verify success:** `SELECT table_name FROM information_schema.tables WHERE table_schema='stripe'` should list ~29 tables; `stripe._managed_webhooks` should hold the `/api/stripe/webhook` URL and `stripe.accounts` the connected `acct_...`.

## 3. The app's own `users`/entitlement table reaches prod ONLY via Publish

`initStripe()`'s `runMigrations` creates the `stripe.*` SCHEMA only — it does **not** create the app-owned `public.users` table (`hasPaid`). That table is Drizzle-managed (`lib/db/src/schema/users.ts`); `pnpm --filter @workspace/db run push` applies it to the **dev** DB only. It reaches production solely through Replit's Publish diff flow (dev→prod), which also *creates the production Neon DB on first deploy* — before any deploy, prod has no DB at all (`executeSql({environment:"production"})` errors `does not have a production Neon database`).

**Why:** if prod is missing `public.users`, the Stripe webhook + confirm-on-redirect throw `relation "users" does not exist` and paid unlocks silently never persist even though endpoints respond.

**How to apply:** do NOT add startup-time `CREATE TABLE` DDL or a prod migration script to "self-heal" — both are forbidden. The only fix is: keep the Drizzle schema correct, `push` it to dev, then have the user **Publish** (Reserved VM) so the diff creates the table in prod.
