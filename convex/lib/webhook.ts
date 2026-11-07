import type Stripe from "stripe";
import type { BillingConfig } from "./billingConfig";
import type { BillingEvent, Followup } from "./entitlement";
import type { StripeSecrets } from "./opSecrets";
import { HANDLED_EVENTS, normalizeEvent } from "./stripeEvents";
import type { StripeLike } from "./stripeLike";

/** Stripe's default signature tolerance (#12 used 300 s too). */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export interface WebhookDeps {
  cfg: BillingConfig;
  secrets(): Promise<StripeSecrets>;
  stripeFor(secretKey: string): StripeLike;
  seen(eventId: string): Promise<boolean>;
  apply(args: {
    eventId: string;
    type: string;
    event: BillingEvent;
    annualPriceId: string;
  }): Promise<{ applied: boolean; followups: Followup[] }>;
}

export type WebhookOutcome =
  | "applied"
  | "duplicate"
  | "ignored"
  | "bad_signature"
  | "unavailable"
  | "error";

/**
 * The Stripe webhook, after the HTTP layer bounded the input. Nothing is
 * trusted until the signature verifies against the signing secret from
 * 1Password. Status codes follow Stripe's retry contract: 400 for a bad
 * signature (never retried into success), 5xx for our own failures (Stripe
 * retries), 200 once the event is applied or known.
 */
export async function runWebhook(
  payload: string,
  signature: string,
  deps: WebhookDeps,
): Promise<{ status: number; outcome: WebhookOutcome }> {
  let secrets: StripeSecrets;
  try {
    secrets = await deps.secrets();
  } catch {
    return { status: 503, outcome: "unavailable" };
  }
  const stripe = deps.stripeFor(secrets.secretKey);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      secrets.webhookSecret,
      SIGNATURE_TOLERANCE_SECONDS,
    );
  } catch {
    console.warn("billing: webhook signature verification failed");
    return { status: 400, outcome: "bad_signature" };
  }

  if (!HANDLED_EVENTS.has(event.type)) return { status: 200, outcome: "ignored" };
  // Cheap replay short-circuit before any Stripe read; the mutation re-checks
  // atomically, so a race still applies the event exactly once.
  if (await deps.seen(event.id)) return { status: 200, outcome: "duplicate" };

  try {
    const normalized = await normalizeEvent(event, stripe);
    const result = await deps.apply({
      eventId: event.id,
      type: event.type,
      event: normalized,
      annualPriceId: deps.cfg.priceIds.annual,
    });
    if (!result.applied) return { status: 200, outcome: "duplicate" };
    for (const step of result.followups) {
      try {
        if (step.kind === "cancelSubscription") {
          await stripe.subscriptions.cancel(step.subscriptionId);
        } else {
          await stripe.subscriptions.update(step.subscriptionId, {
            cancel_at_period_end: true,
          });
        }
      } catch {
        // Same as #12: entitlement is already correct; log and move on.
        console.warn(`billing: follow-up ${step.kind} failed for ${event.id}`);
      }
    }
    console.log(`billing: applied ${event.type} ${event.id}`);
    return { status: 200, outcome: "applied" };
  } catch {
    console.error(`billing: handling ${event.type} ${event.id} failed; Stripe will retry`);
    return { status: 500, outcome: "error" };
  }
}
