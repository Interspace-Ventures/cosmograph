import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./lib/server";
import { userBySubject } from "./lib/account";
import {
  billingConfig,
  billingError,
  type CheckoutLimits,
  type MemberPlan,
} from "./lib/billingConfig";
import { pruneExpiredCounters, takeBudget } from "./lib/rateLimit";
import { applyEventOnce, billingEvent, followup } from "./lib/entitlement";
import type { PrepareResult } from "./lib/checkout";

/**
 * Internal billing functions. None of these is callable from a browser
 * (internal only): they run behind the HTTP actions in http.ts and the Node
 * actions in stripeNode.ts. Entitlement (hasPaid, plan, unlocks granted with
 * a checkout) is written only by applyEvent, which only processWebhook calls
 * after the Stripe signature verified.
 */

type Writer = Pick<MutationCtx, "db">;

function limits(): CheckoutLimits {
  const cfg = billingConfig();
  if (!cfg) throw billingError("BILLING_UNAVAILABLE");
  return cfg.limits;
}

export async function prepareCheckoutHandler(
  ctx: Writer,
  args: { subject: string; email?: string; plan: MemberPlan },
  budget: CheckoutLimits,
  now: number,
): Promise<PrepareResult> {
  let user = await userBySubject(ctx, args.subject);
  if (!user) {
    const id = await ctx.db.insert("users", {
      exoSubject: args.subject,
      hasPaid: false,
      ...(args.email ? { email: args.email } : {}),
    });
    user = await ctx.db.get(id);
    if (!user) throw new Error("account insert did not persist");
  }
  if (user.hasPaid && (user.memberPlan === "lifetime" || args.plan === "annual")) {
    return { alreadyEntitled: true };
  }
  const taken = await takeBudget(ctx, "checkout", args.subject, budget, now);
  if (!taken.ok) throw billingError(taken.reason);
  const email = user.email ?? args.email;
  return {
    alreadyEntitled: false,
    ...(user.stripeCustomerId ? { stripeCustomerId: user.stripeCustomerId } : {}),
    ...(email ? { email } : {}),
  };
}

export const prepareCheckout = internalMutation({
  args: {
    subject: v.string(),
    email: v.optional(v.string()),
    plan: v.union(v.literal("annual"), v.literal("lifetime")),
  },
  returns: v.union(
    v.object({ alreadyEntitled: v.literal(true) }),
    v.object({
      alreadyEntitled: v.literal(false),
      stripeCustomerId: v.optional(v.string()),
      email: v.optional(v.string()),
    }),
  ),
  handler: (ctx, args) => prepareCheckoutHandler(ctx, args, limits(), Date.now()),
});

export async function setStripeCustomerHandler(
  ctx: Writer,
  args: { subject: string; customerId: string },
): Promise<null> {
  const user = await userBySubject(ctx, args.subject);
  if (!user || user.stripeCustomerId) return null;
  const taken = await ctx.db
    .query("users")
    .withIndex("by_stripeCustomerId", (q) => q.eq("stripeCustomerId", args.customerId))
    .first();
  if (!taken) await ctx.db.patch(user._id, { stripeCustomerId: args.customerId });
  return null;
}

export const setStripeCustomer = internalMutation({
  args: { subject: v.string(), customerId: v.string() },
  returns: v.null(),
  handler: (ctx, args) => setStripeCustomerHandler(ctx, args),
});

export async function preparePortalHandler(
  ctx: Writer,
  args: { subject: string },
  budget: CheckoutLimits,
  now: number,
): Promise<{ customerId: string }> {
  const user = await userBySubject(ctx, args.subject);
  if (!user?.stripeCustomerId) throw billingError("NOT_A_MEMBER");
  const taken = await takeBudget(ctx, "portal", args.subject, budget, now);
  if (!taken.ok) throw billingError(taken.reason);
  return { customerId: user.stripeCustomerId };
}

export const preparePortal = internalMutation({
  args: { subject: v.string() },
  returns: v.object({ customerId: v.string() }),
  handler: (ctx, args) => preparePortalHandler(ctx, args, limits(), Date.now()),
});

export async function eventSeenHandler(
  ctx: Pick<QueryCtx, "db">,
  args: { eventId: string },
): Promise<boolean> {
  const row = await ctx.db
    .query("stripeEvents")
    .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
    .first();
  return row !== null;
}

export const eventSeen = internalQuery({
  args: { eventId: v.string() },
  returns: v.boolean(),
  handler: (ctx, args) => eventSeenHandler(ctx, args),
});

export const applyEvent = internalMutation({
  args: {
    eventId: v.string(),
    type: v.string(),
    event: billingEvent,
    annualPriceId: v.string(),
  },
  returns: v.object({ applied: v.boolean(), followups: v.array(followup) }),
  handler: (ctx, args) => applyEventOnce(ctx, args, Date.now()),
});

export const pruneRateCounters = internalMutation({
  args: {},
  returns: v.number(),
  handler: (ctx) => pruneExpiredCounters(ctx, Date.now()),
});
