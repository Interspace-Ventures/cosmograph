import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Cosmograph's Convex data model (Phase 1 of docs/convex-migration-plan.md).
 *
 * Mapped one-to-one from the legacy Postgres tables in lib/db/src/schema
 * (users, researcher_unlocks, ship_unlocks). Postgres `created_at` becomes the
 * built-in `_creationTime`. Every user reference is the Exo subject: the `sub`
 * of a verified Exo Key access token (`ctx.auth.getUserIdentity().subject`),
 * stable across Interspace apps.
 *
 * Convex has no unique constraints. Uniqueness that Postgres enforced with
 * primary keys is enforced by the single mutation that writes each table
 * (Convex mutations are serializable), always looking the row up through the
 * matching index first. Indexes below cover every lookup the current Express
 * routes make.
 *
 * Stripe-owned data (the `stripe` schema from stripe-replit-sync) is not
 * mirrored here; Stripe stays the source of truth. Phase 3 adds only what the
 * app needs to answer "is this account a member": the membership detail on
 * `users` (absorbed from PR #12), processed webhook event ids, and counters
 * for the money-costing endpoints. All of it is written only by internal
 * functions behind the signature-verified Stripe webhook or the checkout
 * budget; no public function can set it.
 */
export default defineSchema({
  users: defineTable({
    /** Exo subject (JWT `sub`). One row per subject, enforced in users.ensure. */
    exoSubject: v.string(),
    /** Only ever set from a verified Exo email claim (email_verified = true). */
    email: v.optional(v.string()),
    /** Ties the account to its Stripe customer so checkouts reuse one customer. */
    stripeCustomerId: v.optional(v.string()),
    /** Cached "active member" flag; written only by server-side billing code. */
    hasPaid: v.boolean(),
    /** Saved cosmonaut-ship seed (see shipLook.ts). */
    shipSeed: v.optional(v.string()),
    /** Equipped ship type; free "scout" is assumed when unset. */
    shipType: v.optional(v.string()),
    /** Stable short `?ref=` code. Unique by convention (allocated in Phase 2). */
    referralCode: v.optional(v.string()),
    /** Exo subject of the referrer, set once for genuinely new accounts. */
    referredBy: v.optional(v.string()),
    /** When the referral was attributed, epoch milliseconds. */
    referredAt: v.optional(v.number()),
    // Membership detail (Phase 3, from PR #12). Written only by the verified
    // Stripe webhook (billingInternal.applyEvent). `hasPaid` stays the single
    // "member right now" flag every feature checks.
    /** "annual" ($9.99/yr subscription) or "lifetime" ($29.99 once). */
    memberPlan: v.optional(v.union(v.literal("annual"), v.literal("lifetime"))),
    /** active | past_due | canceled | refunded | disputed */
    memberStatus: v.optional(v.string()),
    /** Annual: end of the paid period, epoch ms. Unset for lifetime. */
    memberUntil: v.optional(v.number()),
    /** First time the account became a member, epoch ms. */
    memberSince: v.optional(v.number()),
    /** Annual set to end at period end (portal cancel or lifetime upgrade). */
    cancelAtPeriodEnd: v.optional(v.boolean()),
    /** The annual subscription, so refunds/disputes can cancel it. */
    stripeSubscriptionId: v.optional(v.string()),
    /** The lifetime payment, so a full refund of exactly it revokes. */
    lifetimePaymentIntentId: v.optional(v.string()),
  })
    // Account lookup for every authenticated request (was the users PK).
    .index("by_exoSubject", ["exoSubject"])
    // Resolving `?ref=<code>` to its referrer (was a UNIQUE column).
    .index("by_referralCode", ["referralCode"])
    // Mapping a Stripe webhook's customer back to an account (Phase 3).
    .index("by_stripeCustomerId", ["stripeCustomerId"])
    // Counting how many accounts a referrer brought in.
    .index("by_referredBy", ["referredBy"]),

  researcherUnlocks: defineTable({
    /** Exo subject of the member. */
    userId: v.string(),
    /** OpenAlex author id. */
    authorId: v.string(),
  })
    // Idempotent unlock check (was the composite PK user_id + author_id).
    .index("by_user_author", ["userId", "authorId"])
    // Listing a member's unlocks and counting them against the cap.
    .index("by_user", ["userId"]),

  shipUnlocks: defineTable({
    /** Exo subject of the member. */
    userId: v.string(),
    /** Namespaced SKU, e.g. `type:fighter`. Free `scout` is never stored. */
    sku: v.string(),
  })
    // Idempotent claim / ownership check (was the composite PK user_id + sku).
    .index("by_user_sku", ["userId", "sku"])
    // Listing every SKU a member owns.
    .index("by_user", ["userId"]),

  /** Stripe event ids already applied; makes the webhook idempotent. */
  stripeEvents: defineTable({
    eventId: v.string(),
    type: v.string(),
  }).index("by_eventId", ["eventId"]),

  /** Fixed-window counters for money-costing endpoints (lib/rateLimit.ts). */
  rateCounters: defineTable({
    key: v.string(),
    count: v.number(),
    /** Epoch ms after which the row is dead weight; pruned by a cron. */
    expiresAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_expiresAt", ["expiresAt"]),
});
