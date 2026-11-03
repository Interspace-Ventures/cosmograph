import { makeFunctionReference } from "convex/server";
import type { MemberPlan } from "./billingConfig";
import type { CheckoutArgs, PrepareResult } from "./checkout";
import type { BillingEvent, Followup } from "./entitlement";

/**
 * Typed references to the internal billing functions (what `convex codegen`
 * would expose as `internal.*`). Codegen needs a deployment, which Phase 3
 * doesn't create, so they are declared by name here (see lib/server.ts).
 */
export const refs = {
  prepareCheckout: makeFunctionReference<
    "mutation",
    { subject: string; email?: string; plan: MemberPlan },
    PrepareResult
  >("billingInternal:prepareCheckout"),
  setStripeCustomer: makeFunctionReference<
    "mutation",
    { subject: string; customerId: string },
    null
  >("billingInternal:setStripeCustomer"),
  preparePortal: makeFunctionReference<
    "mutation",
    { subject: string },
    { customerId: string }
  >("billingInternal:preparePortal"),
  eventSeen: makeFunctionReference<"query", { eventId: string }, boolean>(
    "billingInternal:eventSeen",
  ),
  applyEvent: makeFunctionReference<
    "mutation",
    { eventId: string; type: string; event: BillingEvent; annualPriceId: string },
    { applied: boolean; followups: Followup[] }
  >("billingInternal:applyEvent"),
  pruneRateCounters: makeFunctionReference<"mutation", Record<string, never>, number>(
    "billingInternal:pruneRateCounters",
  ),
  createCheckout: makeFunctionReference<
    "action",
    CheckoutArgs,
    { alreadyEntitled: boolean; url?: string }
  >("stripeNode:createCheckout"),
  createPortal: makeFunctionReference<
    "action",
    { subject: string; origin: string; returnPath: string },
    { url: string }
  >("stripeNode:createPortal"),
  processWebhook: makeFunctionReference<
    "action",
    { payload: string; signature: string },
    { status: number }
  >("stripeNode:processWebhook"),
};
