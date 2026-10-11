import { logger } from "./logger";
import { stripeConfigured } from "./stripeClient";

// Billing needs no runtime setup: products/prices are created once with
// scripts/stripe-setup.mjs and the webhook endpoint is registered by that
// script (or the Stripe dashboard). This only reports the state at boot.
export async function initStripe(): Promise<void> {
  if (!stripeConfigured()) {
    logger.warn(
      "Stripe not configured (STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET); membership checkout disabled, galaxy stays free",
    );
    return;
  }
  const mode = process.env.STRIPE_SECRET_KEY!.startsWith("sk_live_") ? "live" : "test";
  logger.info({ mode }, "Stripe billing enabled");
}
