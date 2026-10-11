---
name: Stripe membership entitlement (launch model)
description: $9.99/yr or $29.99 lifetime membership; how it is granted, revoked, and kept tamper-proof.
---

# Membership entitlement (rebuilt Oct 2026, branch agent/launch-billing)

Supersedes the $7/yr + $1/yr add-on + $1 ship model, which is retired.

- Plans: `annual` ($9.99/yr subscription) and `lifetime` ($29.99 one-time
  payment). Prices have lookup keys `cosmograph_member_annual_v1` /
  `cosmograph_member_lifetime_v1`, created ONCE by
  `artifacts/api-server/scripts/stripe-setup.mjs`. The server only reads them
  and refuses any price whose amount/currency/interval don't match
  (`priceMatchesPlan`). Never create or edit prices at runtime. Changing a
  price = new `_v2` lookup key.
- State on `users`: `has_paid` stays the single "member right now" flag every
  feature checks; detail in `member_plan`, `member_status`, `member_until`,
  `member_since`, `cancel_at_period_end`, `stripe_subscription_id`,
  `lifetime_payment_intent_id`.
- Grant paths: signature-verified webhook (`stripe.webhooks.constructEventAsync`
  with `STRIPE_WEBHOOK_SECRET`, 300 s tolerance) and the success-redirect
  confirm, which re-fetches the session and requires
  `metadata.userId === client_reference_id === caller`. Lifetime also requires
  `mode=payment` and `amount_subtotal >= 2999`.
- Idempotency: every event id is inserted into `stripe_events` first; a
  duplicate is a no-op; on handler failure the row is deleted and 500 returned
  so Stripe retries.
- Subscription events re-fetch the live subscription (events arrive out of
  order). past_due keeps access (Stripe retries the card); canceled / unpaid /
  incomplete_expired revoke. Lifetime members ignore old annual subscription
  events. Upgrading annual -> lifetime sets the annual sub to cancel at period end.
- Full refund (`charge.refunded` with `refunded=true`) and chargeback
  (`charge.dispute.created`) revoke and cancel any subscription. Partial
  refunds keep membership.
- User lookup prefers our `stripe_customer_id` mapping over object metadata.
- Billing is OFF (503) unless BOTH `STRIPE_SECRET_KEY` and
  `STRIPE_WEBHOOK_SECRET` are set. Checkout creation is capped at 20/day/user
  (`CHECKOUT_DAILY_PER_USER`) and 5000/day globally (`CHECKOUT_DAILY_GLOBAL`).
- Product rule: lapse/refund/dispute stops member extras, but published gift
  links stay live (enforced in the publishing feature, not yet built).
