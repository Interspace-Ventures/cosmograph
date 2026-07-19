import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";
import { logger } from "./logger";

// Initialize the Stripe sync schema + managed webhook on startup. This is
// best-effort and NON-fatal: if Stripe isn't connected the api-server still
// boots and serves presence, GitHub stars and the (read-only) entitlement
// endpoint. The galaxy itself is static and free regardless.
export async function initStripe(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL missing; skipping Stripe initialization");
    return;
  }

  try {
    await runMigrations({ databaseUrl });

    const sync = await getStripeSync();

    const domain =
      process.env.PUBLIC_APP_DOMAIN?.trim() ||
      process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
    if (domain) {
      const webhook = await sync.findOrCreateManagedWebhook(
        `https://${domain}/api/stripe/webhook`,
      );
      logger.info(
        { webhook: webhook?.url ?? "configured" },
        "Stripe managed webhook ready",
      );
    }

    sync
      .syncBackfill()
      .then(() => logger.info("Stripe data synced"))
      .catch((err) => logger.error({ err }, "Stripe backfill failed"));
  } catch (err) {
    logger.warn(
      { err },
      "Stripe not initialized (integration likely not connected); paid unlock disabled, galaxy stays free",
    );
  }
}
