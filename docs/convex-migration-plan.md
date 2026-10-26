# Cosmograph: move to the approved Exo stack (Convex + Exo Key)

Status: PLAN, draft for Samir's review. Nothing here is merged, deployed or deleted without his yes.
Driver: Exo contract (exo#232, report mode). The approved stack is mandatory with no waivers.
Cosmograph's two violations: (1) data on Replit Postgres behind Express, (2) Clerk (PR #15 removes it).

## Target
- Data and server logic: Convex (queries, mutations, actions, HTTP actions). No Postgres, no Drizzle, no Express.
- Identity: Exo Key on Convex Auth. Convex validates the Exo ID JWT (issuer/audience/JWKS from the Exo registration in exo#229); `ctx.auth.getUserIdentity().subject` is the Exo subject. No Clerk, no custom auth middleware, no bypass.
- Secrets: Stripe, OpenAI and GitHub keys live in Cosmograph's 1Password vault. They are NOT copied into Convex or platform env: Node-runtime actions read them at runtime with @1password/sdk, in memory only (decided for Phase 3, 2026-10-26). The only platform secret is one read-only OP_SERVICE_ACCOUNT_TOKEN. Nothing in Railway, Replit or Vercel env.
- Delivery: Exo delivery (Convex deployment per environment + static SPA). Railway and Replit retire.
- Frontend: the Vite SPA stays; `fetch('/api/...')` calls become Convex client calls.

## Schema mapping (lib/db -> convex/schema.ts)
| Postgres | Convex table | Fields | Indexes |
|---|---|---|---|
| users (pk exo_subject) | users | exoSubject, email?, stripeCustomerId?, hasPaid (bool), shipSeed?, shipType?, referralCode?, referredBy? (Exo subject), referredAt? (ms) | by_exoSubject (unique by convention), by_referralCode, by_stripeCustomerId |
| researcher_unlocks (pk user_id+author_id) | researcherUnlocks | userId (Exo subject), authorId | by_user_author (idempotent upsert in mutation), by_user |
| ship_unlocks (pk user_id+sku) | shipUnlocks | userId, sku | by_user_sku, by_user |
| stripe.* (stripe-replit-sync) | not migrated | Stripe stays the source of truth. A Stripe webhook HTTP action records only what the app needs (subscription active, paid SKUs) on users / shipUnlocks. | |

Notes: `createdAt` becomes Convex `_creationTime`; `referredAt` is stored as epoch ms. Uniqueness that Postgres enforced with keys is enforced inside the single mutation that writes (Convex mutations are serializable), so unlocks and referrals stay idempotent.

## Endpoint mapping (api-server -> convex/)
| Express route | Convex | Guards kept |
|---|---|---|
| GET /me/entitlement | query `account.entitlement` | auth required |
| POST /me/unlock | mutation `billing.unlock` | auth, server-side cap (INCLUDED_UNLOCK_SLOTS) |
| POST /billing/checkout, /billing/confirm | action `billing.checkout`; confirm replaced by Stripe webhook HTTP action (signature-verified) | auth, prices from config never created at runtime, never trust browser payment state |
| GET/PUT /me/ship, POST /me/ship/claim, /me/ship/confirm | query/mutation `ship.*`, checkout via action + webhook | auth, ownership enforced server-side |
| GET/POST referral | query/mutation `referral.*` | new-account-only attribution |
| POST /ask (Ask Cosmo, OpenAI) | action `ask.ask` | Origin allowlist (HTTP action), per-minute + daily per-client limits, global daily cutoff that fails closed, bounded input, capped output; counters in a `spend` table |
| POST /feedback (Exo intake) | action `feedback.submit` | rate limits; intake secret via Exo Secure |
| GET /github/stars | action with cached result table | no secret in client |
| /health | HTTP action `/health` | |
| presence (ws server) | Convex reactive `presence` table with heartbeats + TTL cleanup cron | per-client caps, bounded payload |

## Data move
- Samir confirmed there is no real user data (2026-10-22). Rows in Replit dev/prod are test accounts.
- One-time export script reads users, researcher_unlocks, ship_unlocks from each Replit DB (read-only) and imports to the matching Convex deployment with `npx convex import` (JSONL per table). Counts are compared before and after and reported, no values.
- Stripe data is not copied; customer ids carry over on users.
- If Samir prefers, we skip the import and start clean (simpler, same result for test data).

## Phases (one draft PR each, into staging)
1. Convex scaffold + schema + Exo Key on Convex Auth (supersedes PR #15's Express middleware; #15 closes once this lands). Needs exo#229 merged for the issuer/audience.
2. Port account, unlocks, ship, referral to Convex; SPA switches to the Convex client.
3. Port billing to Convex actions + Stripe webhook HTTP action (Stripe test mode); keep every money guard. Absorbs PR #12 (Billing v2: $9.99/yr or $29.99 lifetime, refunds/disputes); entitlement only from the verified webhook.
4. Port Ask Cosmo, feedback, github stars, presence; spend guard in Convex.
5. Remove Express, Drizzle, lib/db, stripe-replit-sync, ws, railway.json; Exo delivery config. `exo-verify stack --fix-brief` must come back clean.

## Cutover
1. Exo staging deploy of Convex + SPA; smoke test sign-in, unlock, test-mode checkout, ask limits.
2. Import (or start clean) on the prod Convex deployment.
3. With Samir's yes: promote via Exo, point cosmograph.space DNS at the Exo delivery. Downtime is acceptable for Cosmograph.
4. With Samir's yes: delete Replit Development and Production databases (this also retires the leaked DATABASE_URL) and the Railway services; remove the old OpenAI key once OpenAI MFA is sorted.

## Open items
- exo#229 (Exo registration for cosmograph) must merge before phase 1 can sign in.
- Order with existing PRs: #14 (deps) and #11 (hardening) touch Express code that phase 5 deletes; recommend closing #11 and folding its guards into the Convex ports, and keeping #14 only for the SPA deps.
