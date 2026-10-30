import { ConvexError } from "convex/values";
import {
  forbiddenSecretEnv,
  type BillingConfig,
  type StripeMode,
} from "./billingConfig";

/**
 * Stripe secrets for the Node-runtime billing actions, read from Cosmograph's
 * 1Password vault with @1password/sdk using the read-only
 * OP_SERVICE_ACCOUNT_TOKEN (the only secret on the deployment).
 *
 * Values live in this module's memory for at most CACHE_TTL_MS and are never
 * written to the database, returned to a client, or logged. Item names come
 * from config (see billingConfig.ts). Items are found by vault and item title
 * through the SDK's list APIs rather than an op:// reference, because titles
 * like "Cosmograph staging: STRIPE_SECRET_KEY" contain characters secret
 * references don't support.
 */

export interface OpClientLike {
  vaults: { list(): Promise<Array<{ id: string; title: string }>> };
  items: {
    list(vaultId: string): Promise<Array<{ id: string; title: string }>>;
    get(
      vaultId: string,
      itemId: string,
    ): Promise<{ fields: Array<{ id: string; title: string; value: string }> }>;
  };
}

export type OpClientFactory = (token: string) => Promise<OpClientLike>;

export interface StripeSecrets {
  secretKey: string;
  webhookSecret: string;
}

export const CACHE_TTL_MS = 5 * 60_000;

let cache: { key: string; at: number; secrets: StripeSecrets } | null = null;

export function clearStripeSecretCache(): void {
  cache = null;
}

/** Loaded lazily so the WASM core only starts inside the Node action. */
export const defaultOpClientFactory: OpClientFactory = async (token) => {
  const { createClient } = await import("@1password/sdk");
  const client = await createClient({
    auth: token,
    integrationName: "Cosmograph Convex billing",
    integrationVersion: "1",
  });
  return client as unknown as OpClientLike;
};

class LookupError extends Error {}

function unavailable(): ConvexError<{ code: string; message: string }> {
  return new ConvexError({
    code: "BILLING_UNAVAILABLE",
    message: "Checkout is unavailable right now.",
  });
}

/** A Stripe API key whose mode matches the deployment's STRIPE_MODE. */
export function keyMatchesMode(key: string, mode: StripeMode): boolean {
  const pattern =
    mode === "live"
      ? /^(sk|rk)_live_[A-Za-z0-9]{10,}$/
      : /^(sk|rk)_test_[A-Za-z0-9]{10,}$/;
  return pattern.test(key);
}

export async function loadStripeSecrets(
  cfg: BillingConfig,
  opts: {
    env?: Record<string, string | undefined>;
    factory?: OpClientFactory;
    now?: number;
  } = {},
): Promise<StripeSecrets> {
  const env = opts.env ?? process.env;
  if (forbiddenSecretEnv(env).length > 0) {
    console.error(
      "billing: a Stripe secret is set as deployment env; refusing to run. Remove it (secrets come from 1Password only).",
    );
    throw unavailable();
  }
  const token = env.OP_SERVICE_ACCOUNT_TOKEN?.trim();
  if (!token) {
    console.error("billing: OP_SERVICE_ACCOUNT_TOKEN is not set");
    throw unavailable();
  }

  const now = opts.now ?? Date.now();
  const key = [
    cfg.vault.vault,
    cfg.vault.secretKeyItem,
    cfg.vault.webhookSecretItem,
    cfg.stripeMode,
  ].join("\u0000");
  if (cache && cache.key === key && now - cache.at < CACHE_TTL_MS) {
    return cache.secrets;
  }

  let secrets: StripeSecrets;
  try {
    const client = await (opts.factory ?? defaultOpClientFactory)(token);
    const vault = (await client.vaults.list()).find(
      (v) => v.title === cfg.vault.vault,
    );
    if (!vault) throw new LookupError("vault not found");
    const items = await client.items.list(vault.id);
    const read = async (title: string): Promise<string> => {
      const overview = items.find((item) => item.title === title);
      if (!overview) throw new LookupError("item not found");
      const item = await client.items.get(vault.id, overview.id);
      for (const name of cfg.vault.fields) {
        const field = item.fields.find((f) => f.id === name || f.title === name);
        if (field?.value?.trim()) return field.value.trim();
      }
      throw new LookupError("field not found");
    };
    secrets = {
      secretKey: await read(cfg.vault.secretKeyItem),
      webhookSecret: await read(cfg.vault.webhookSecretItem),
    };
  } catch (err) {
    // Only our own lookup messages are logged; SDK errors are not echoed.
    console.error(
      `billing: could not load Stripe secrets from 1Password (${
        err instanceof LookupError ? err.message : "sdk error"
      })`,
    );
    throw unavailable();
  }

  if (
    !keyMatchesMode(secrets.secretKey, cfg.stripeMode) ||
    !/^whsec_[A-Za-z0-9]{10,}$/.test(secrets.webhookSecret)
  ) {
    console.error(
      "billing: 1Password Stripe secrets have the wrong shape or the wrong mode for STRIPE_MODE",
    );
    throw unavailable();
  }
  cache = { key, at: now, secrets };
  return secrets;
}
