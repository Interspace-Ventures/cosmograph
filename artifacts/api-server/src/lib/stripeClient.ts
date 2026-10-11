import Stripe from "stripe";

/**
 * Stripe credentials from the deployment environment. Billing is OFF (routes
 * return 503) unless both the secret key and the webhook signing secret are
 * set, so a half-configured deploy can never take money without being able to
 * record it.
 */
export function stripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() &&
      process.env.STRIPE_WEBHOOK_SECRET?.trim(),
  );
}

export function webhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  return secret;
}

let cached: { key: string; client: Stripe } | null = null;

/** Authenticated Stripe client; rebuilt if the key is rotated. */
export async function getUncachableStripeClient(): Promise<Stripe> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (cached?.key !== key) {
    cached = {
      key,
      client: new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 }),
    };
  }
  return cached.client;
}
