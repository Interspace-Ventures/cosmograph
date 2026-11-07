import { v, type Infer } from "convex/values";
import type { Doc, MutationCtx } from "./server";
import {
  MEMBER_UNLOCK_LIMIT,
  PREMIUM_SHIP_TYPES,
  sanitizeAuthorId,
  shipTypeSku,
  userBySubject,
} from "./account";
import { PLAN_AMOUNTS } from "./billingConfig";

/**
 * Entitlement writes, ported from PR #12's grant/sync/revoke logic and
 * adapted to Convex. Only billingInternal.applyEvent calls this, after the
 * Node action verified the Stripe signature, so membership can never come
 * from the browser or the checkout return URL.
 *
 * The Node action normalizes each Stripe event into a BillingEvent (fetching
 * the live subscription or the disputed charge where #12 did), and this code
 * applies it inside one serializable mutation, together with recording the
 * event id. Stripe calls the grant implies (cancel a subscription, stop an
 * annual renewal) come back as follow-ups for the action to perform.
 */

type Writer = Pick<MutationCtx, "db">;

export const subscriptionSnapshot = v.object({
  id: v.string(),
  status: v.string(),
  customerId: v.optional(v.string()),
  metadataSubject: v.optional(v.string()),
  /** Epoch ms. */
  currentPeriodEnd: v.optional(v.number()),
  cancelAtPeriodEnd: v.boolean(),
  priceIds: v.array(v.string()),
});
export type SubscriptionSnapshot = Infer<typeof subscriptionSnapshot>;

export const billingEvent = v.union(
  v.object({
    kind: v.literal("checkout"),
    sessionId: v.string(),
    mode: v.string(),
    paymentStatus: v.string(),
    clientReferenceId: v.optional(v.string()),
    customerId: v.optional(v.string()),
    amountSubtotal: v.number(),
    currency: v.string(),
    paymentIntentId: v.optional(v.string()),
    metaKind: v.optional(v.string()),
    metaSubject: v.optional(v.string()),
    metaPlan: v.optional(v.string()),
    metaAuthor: v.optional(v.string()),
    metaShip: v.optional(v.string()),
    subscription: v.optional(subscriptionSnapshot),
  }),
  v.object({ kind: v.literal("subscription"), subscription: subscriptionSnapshot }),
  v.object({
    kind: v.literal("refund"),
    fullyRefunded: v.boolean(),
    customerId: v.optional(v.string()),
    metadataSubject: v.optional(v.string()),
    paymentIntentId: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("dispute"),
    customerId: v.optional(v.string()),
    metadataSubject: v.optional(v.string()),
  }),
  v.object({ kind: v.literal("ignored") }),
);
export type BillingEvent = Infer<typeof billingEvent>;

export const followup = v.union(
  v.object({ kind: v.literal("cancelSubscription"), subscriptionId: v.string() }),
  v.object({ kind: v.literal("stopRenewal"), subscriptionId: v.string() }),
);
export type Followup = Infer<typeof followup>;

/** Subscription states that keep access (#12: past_due is grace). */
const ACTIVE_STATES = new Set(["active", "trialing", "past_due"]);

/**
 * Prefer our own customer mapping over object metadata: metadata on objects we
 * didn't create could name any account (#12).
 */
async function subjectFor(
  ctx: Writer,
  customerId: string | undefined,
  metadataSubject: string | undefined,
): Promise<string | null> {
  if (customerId) {
    const mapped = await ctx.db
      .query("users")
      .withIndex("by_stripeCustomerId", (q) => q.eq("stripeCustomerId", customerId))
      .first();
    if (mapped) return mapped.exoSubject;
  }
  return metadataSubject ?? null;
}

async function ensureRow(ctx: Writer, subject: string): Promise<Doc<"users">> {
  const existing = await userBySubject(ctx, subject);
  if (existing) return existing;
  const id = await ctx.db.insert("users", { exoSubject: subject, hasPaid: false });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("account insert did not persist");
  return created;
}

async function grantLifetime(
  ctx: Writer,
  subject: string,
  paymentIntentId: string | undefined,
  now: number,
): Promise<Followup[]> {
  const prev = await ensureRow(ctx, subject);
  await ctx.db.patch(prev._id, {
    hasPaid: true,
    memberPlan: "lifetime",
    memberStatus: "active",
    memberUntil: undefined,
    cancelAtPeriodEnd: false,
    lifetimePaymentIntentId: paymentIntentId,
    memberSince: prev.memberSince ?? now,
  });
  console.log("billing: lifetime membership granted");
  // Upgrading from annual: stop the renewal so they're never charged again.
  return prev.stripeSubscriptionId
    ? [{ kind: "stopRenewal", subscriptionId: prev.stripeSubscriptionId }]
    : [];
}

async function syncSubscription(
  ctx: Writer,
  sub: SubscriptionSnapshot,
  annualPriceId: string,
  now: number,
): Promise<void> {
  // Only the configured annual price grants membership.
  if (!sub.priceIds.includes(annualPriceId)) {
    console.warn("billing: subscription for an unexpected price ignored");
    return;
  }
  const subject = await subjectFor(ctx, sub.customerId, sub.metadataSubject);
  if (!subject) {
    console.warn("billing: subscription without a known account ignored");
    return;
  }
  const prev = await ensureRow(ctx, subject);
  // A lifetime member's old annual subscription ending changes nothing.
  if (prev.memberPlan === "lifetime" && prev.hasPaid) return;
  // A refunded/disputed account stays revoked unless Stripe says active again.
  if (
    (prev.memberStatus === "refunded" || prev.memberStatus === "disputed") &&
    sub.status !== "active"
  ) {
    return;
  }
  const active = ACTIVE_STATES.has(sub.status);
  const status = !active ? "canceled" : sub.status === "past_due" ? "past_due" : "active";
  await ctx.db.patch(prev._id, {
    hasPaid: active,
    memberPlan: "annual",
    memberStatus: status,
    memberUntil: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    stripeSubscriptionId: sub.id,
    memberSince: prev.memberSince ?? (active ? now : undefined),
  });
  console.log(`billing: annual membership synced (${status})`);
}

async function revoke(
  ctx: Writer,
  subject: string,
  status: "refunded" | "disputed",
): Promise<void> {
  const user = await userBySubject(ctx, subject);
  if (!user) return;
  await ctx.db.patch(user._id, {
    hasPaid: false,
    memberStatus: status,
    cancelAtPeriodEnd: false,
  });
  console.warn(`billing: membership revoked (${status})`);
}

/** Map a Stripe customer to the account once; never steal another's mapping. */
async function mapCustomer(
  ctx: Writer,
  subject: string,
  customerId: string | undefined,
): Promise<void> {
  if (!customerId) return;
  const user = await ensureRow(ctx, subject);
  if (user.stripeCustomerId) return;
  const taken = await ctx.db
    .query("users")
    .withIndex("by_stripeCustomerId", (q) => q.eq("stripeCustomerId", customerId))
    .first();
  if (!taken) await ctx.db.patch(user._id, { stripeCustomerId: customerId });
}

/**
 * What the checkout was started for (#12 carried the researcher; Phase 3 also
 * carries a ship). Granted only once the account is a member.
 */
async function grantIntent(
  ctx: Writer,
  subject: string,
  author: string | undefined,
  ship: string | undefined,
): Promise<void> {
  const user = await userBySubject(ctx, subject);
  if (!user?.hasPaid) return;
  const authorId = sanitizeAuthorId(author);
  if (authorId) {
    const rows = await ctx.db
      .query("researcherUnlocks")
      .withIndex("by_user", (q) => q.eq("userId", subject))
      .collect();
    if (
      !rows.some((r) => r.authorId === authorId) &&
      rows.length < MEMBER_UNLOCK_LIMIT
    ) {
      await ctx.db.insert("researcherUnlocks", { userId: subject, authorId });
    }
  }
  if (ship && PREMIUM_SHIP_TYPES.has(ship)) {
    const sku = shipTypeSku(ship);
    const owned = await ctx.db
      .query("shipUnlocks")
      .withIndex("by_user_sku", (q) => q.eq("userId", subject).eq("sku", sku))
      .first();
    if (!owned) await ctx.db.insert("shipUnlocks", { userId: subject, sku });
  }
}

export async function applyBillingEvent(
  ctx: Writer,
  event: BillingEvent,
  opts: { annualPriceId: string; now: number },
): Promise<Followup[]> {
  switch (event.kind) {
    case "checkout": {
      if (event.metaKind !== "membership") return [];
      const subject = event.metaSubject;
      if (!subject || event.clientReferenceId !== subject) {
        console.warn("billing: membership session without a matching account");
        return [];
      }
      if (event.paymentStatus !== "paid") return [];
      await mapCustomer(ctx, subject, event.customerId);
      let followups: Followup[] = [];
      if (event.metaPlan === "lifetime") {
        if (
          event.mode !== "payment" ||
          event.currency !== "usd" ||
          event.amountSubtotal < PLAN_AMOUNTS.lifetime
        ) {
          console.error("billing: lifetime session amount/mode mismatch; not granting");
          return [];
        }
        followups = await grantLifetime(ctx, subject, event.paymentIntentId, opts.now);
      } else {
        if (event.mode !== "subscription" || !event.subscription) return [];
        await syncSubscription(ctx, event.subscription, opts.annualPriceId, opts.now);
      }
      await grantIntent(ctx, subject, event.metaAuthor, event.metaShip);
      return followups;
    }
    case "subscription":
      await syncSubscription(ctx, event.subscription, opts.annualPriceId, opts.now);
      return [];
    case "refund": {
      if (!event.fullyRefunded) return []; // partial refund: membership stays
      const subject = await subjectFor(ctx, event.customerId, event.metadataSubject);
      if (!subject) return [];
      const user = await userBySubject(ctx, subject);
      if (
        user?.memberPlan === "lifetime" &&
        event.paymentIntentId &&
        event.paymentIntentId === user.lifetimePaymentIntentId
      ) {
        await revoke(ctx, subject, "refunded");
        return [];
      }
      if (user?.memberPlan === "annual" && user.stripeSubscriptionId) {
        await revoke(ctx, subject, "refunded");
        return [{ kind: "cancelSubscription", subscriptionId: user.stripeSubscriptionId }];
      }
      return [];
    }
    case "dispute": {
      const subject = await subjectFor(ctx, event.customerId, event.metadataSubject);
      if (!subject) return [];
      const user = await userBySubject(ctx, subject);
      await revoke(ctx, subject, "disputed");
      return user?.stripeSubscriptionId
        ? [{ kind: "cancelSubscription", subscriptionId: user.stripeSubscriptionId }]
        : [];
    }
    case "ignored":
      return [];
  }
}

/**
 * Idempotent wrapper: the event id is recorded in the same transaction that
 * applies it, so a replay (or Stripe's at-least-once redelivery) is a no-op,
 * and a failure records nothing so Stripe retries.
 */
export async function applyEventOnce(
  ctx: Writer,
  args: {
    eventId: string;
    type: string;
    event: BillingEvent;
    annualPriceId: string;
  },
  now: number,
): Promise<{ applied: boolean; followups: Followup[] }> {
  const seen = await ctx.db
    .query("stripeEvents")
    .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
    .first();
  if (seen) return { applied: false, followups: [] };
  await ctx.db.insert("stripeEvents", { eventId: args.eventId, type: args.type });
  const followups = await applyBillingEvent(ctx, args.event, {
    annualPriceId: args.annualPriceId,
    now,
  });
  return { applied: true, followups };
}
