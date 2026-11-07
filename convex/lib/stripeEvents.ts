import type Stripe from "stripe";
import type { BillingEvent, SubscriptionSnapshot } from "./entitlement";
import type { StripeLike } from "./stripeLike";

/** The events the webhook acts on (same set as PR #12). */
export const HANDLED_EVENTS: ReadonlySet<string> = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.refunded",
  "charge.dispute.created",
]);

function idOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  const id = (value as { id?: unknown } | null | undefined)?.id;
  return typeof id === "string" ? id : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 256 ? value : undefined;
}

export function snapshotSubscription(sub: Stripe.Subscription): SubscriptionSnapshot {
  // Newer API versions moved current_period_end onto subscription items.
  const item = sub.items?.data?.[0] as unknown as
    | { current_period_end?: number }
    | undefined;
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  const end = item?.current_period_end ?? legacy;
  return {
    id: sub.id,
    status: sub.status,
    customerId: idOf(sub.customer),
    metadataSubject: str(sub.metadata?.exoSubject),
    currentPeriodEnd: typeof end === "number" ? end * 1000 : undefined,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    priceIds: (sub.items?.data ?? [])
      .map((i) => idOf(i.price))
      .filter((id): id is string => !!id),
  };
}

/**
 * Turn a signature-verified Stripe event into the BillingEvent the mutation
 * applies. Like #12, subscription events re-read the live subscription
 * (events arrive out of order) and disputes read their charge.
 */
export async function normalizeEvent(
  event: Stripe.Event,
  stripe: StripeLike,
): Promise<BillingEvent> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      const meta = session.metadata ?? {};
      const subId = idOf(session.subscription);
      return {
        kind: "checkout",
        sessionId: session.id,
        mode: session.mode ?? "",
        paymentStatus: session.payment_status ?? "",
        clientReferenceId: str(session.client_reference_id),
        customerId: idOf(session.customer),
        amountSubtotal: session.amount_subtotal ?? 0,
        currency: session.currency ?? "",
        paymentIntentId: idOf(session.payment_intent),
        metaKind: str(meta.kind),
        metaSubject: str(meta.exoSubject),
        metaPlan: str(meta.plan),
        metaAuthor: str(meta.author),
        metaShip: str(meta.ship),
        subscription:
          session.mode === "subscription" && subId
            ? snapshotSubscription(await stripe.subscriptions.retrieve(subId))
            : undefined,
      };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const live = await stripe.subscriptions.retrieve(sub.id).catch(() => sub);
      return { kind: "subscription", subscription: snapshotSubscription(live) };
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      return {
        kind: "refund",
        fullyRefunded: charge.refunded === true,
        customerId: idOf(charge.customer),
        metadataSubject: str(charge.metadata?.exoSubject),
        paymentIntentId: idOf(charge.payment_intent),
      };
    }
    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      const charge =
        typeof dispute.charge === "string"
          ? await stripe.charges.retrieve(dispute.charge)
          : dispute.charge;
      return {
        kind: "dispute",
        customerId: idOf(charge.customer),
        metadataSubject: str(charge.metadata?.exoSubject),
      };
    }
    default:
      return { kind: "ignored" };
  }
}
