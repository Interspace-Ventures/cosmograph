---
name: Stripe membership entitlement (Cosmograph full access)
description: How the $10/year membership entitlement is granted/revoked without fighting stripe-replit-sync.
---

# $10/year membership entitlement

The app gates exploring *searched* (non-default) scientists behind a **$10/year recurring
Stripe subscription** ("Cosmograph — Full Access"), tied to a Clerk user. The default
scientist is always free. Donations are **GitHub Sponsors** (link-out), NOT Stripe.

## Shape (as actually shipped)
- Entitlement lives on `users.has_paid` (bool) in the public schema — repurposed to mean
  "active member" (NOT a one-time flag). No per-author rows; no separate `entitlements`
  table. `stripe_customer_id` ties the account to its Stripe customer.
- Price is created just-in-time (`getOrCreateMembershipPrice`): product looked up by
  `metadata['galactic_unlock']='true'` (legacy key kept to reuse the product), then a
  **recurring yearly** price (`recurring.interval='year'`, $10) is found-or-created. Filter
  by `p.recurring?.interval==='year'` so an old one-time price on the same product is never
  reused. Product name/desc are back-filled via `products.update` to stay on-brand.
- Checkout: `mode:"subscription"`, `subscription_data.metadata.userId` (NOT
  `payment_intent_data`, which is invalid in subscription mode). Session also carries
  `metadata.userId`.
- Grant paths (both require **payment actually settled**):
  - Confirm-on-redirect: live `checkout.sessions.retrieve`; grant if
    `payment_status==='paid'` and the session's `metadata.userId` matches.
  - Webhook: `checkout.session.completed` / `async_payment_succeeded` → grant ONLY when
    `payment_status==='paid'`. Do NOT also accept `status==='complete'` — it can precede
    settlement for some payment methods (delayed cases arrive via async_payment_succeeded).
- Revoke path (webhook): `customer.subscription.deleted` always revokes;
  `customer.subscription.updated` revokes only on terminal statuses (canceled / unpaid /
  incomplete_expired) — stay lenient on `past_due` retries. Find the user by the
  subscription's `metadata.userId`, else by `stripe_customer_id`.

**Why:** `stripe-replit-sync.processWebhook` resolves the webhook secret itself; a
boot-captured secret is unreliable, so grant/revoke parse the already-verified payload (or
live-retrieve) instead of our own `constructEvent`.

**Known limitation:** `GET /me/entitlement` is a pure DB read of `has_paid` (resilient if
Stripe is down). There is **no live re-check / periodic reconciliation**, so a *missed
revoke webhook* leaves a lapsed member entitled. If this matters, add a reconciliation
against synced `stripe.subscriptions` (read-only) — never INSERT into the `stripe` schema.
