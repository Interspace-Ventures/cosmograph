import type Stripe from "stripe";

/**
 * The slice of the Stripe SDK the billing actions use. The real client
 * satisfies it; tests pass a fake with the same shape (no network).
 * Note what is absent: nothing here can create or edit a Price.
 */
export interface StripeLike {
  webhooks: {
    constructEventAsync(
      payload: string,
      header: string,
      secret: string,
      tolerance?: number,
    ): Promise<Stripe.Event>;
  };
  prices: { retrieve(id: string): Promise<Stripe.Price> };
  customers: {
    create(
      params: Stripe.CustomerCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<{ id: string }>;
  };
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
      ): Promise<{ id: string; url: string | null }>;
    };
  };
  billingPortal: {
    sessions: {
      create(
        params: Stripe.BillingPortal.SessionCreateParams,
      ): Promise<{ url: string }>;
    };
  };
  subscriptions: {
    retrieve(id: string): Promise<Stripe.Subscription>;
    update(id: string, params: Stripe.SubscriptionUpdateParams): Promise<unknown>;
    cancel(id: string): Promise<unknown>;
  };
  charges: { retrieve(id: string): Promise<Stripe.Charge> };
}
