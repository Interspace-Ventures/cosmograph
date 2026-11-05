"use node";

import { ConvexError } from "convex/values";
import {
  forbiddenSecretEnv,
  type BillingConfig,
  type StripeMode,
} from "./billingConfig";

/**
 * Stripe secrets for the Node-runtime billing actions, read from Cosmograph's
 * Bitwarden Secrets Manager project with @bitwarden/sdk-wasm using the
 * read-only machine-account access token BWS_ACCESS_TOKEN (the only secret on
 * the deployment).
 *
 * Secrets are found by key name (e.g. COSMOGRAPH_PROD_STRIPE_SECRET_KEY)
 * within BWS_PROJECT_ID of BWS_ORGANIZATION_ID; the key names come from
 * config (see billingConfig.ts). A key that matches zero or more than one
 * secret in the project fails closed.
 *
 * Values live in this module's memory for at most CACHE_TTL_MS and are never
 * written to the database, returned to a client, or logged. Only our own
 * lookup messages are logged, never SDK or server error text.
 *
 * Why the WASM build and not @bitwarden/sdk-napi: Convex runs "use node"
 * actions on linux-arm64, and sdk-napi 1.0.0 ships no linux-arm64 binary.
 * convex.json marks @bitwarden/sdk-wasm as an external package because it
 * reads its .wasm file from its own package directory at runtime.
 */

export interface BwsSecretIdentifier {
  id: string;
  key: string;
}

export interface BwsSecret {
  id: string;
  key: string;
  value: string;
  projectId: string | null;
}

/** The narrow slice of the Bitwarden SDK this module uses (fakeable in tests). */
export interface BwsClientLike {
  /** Identifiers of every secret the machine account can read in the org. */
  listSecrets(organizationId: string): Promise<BwsSecretIdentifier[]>;
  /** Full secrets (with values) by id. */
  getSecrets(ids: string[]): Promise<BwsSecret[]>;
  /** Releases the SDK client. */
  close?(): void;
}

export interface BwsSettings {
  apiUrl: string;
  identityUrl: string;
}

export type BwsClientFactory = (
  token: string,
  settings: BwsSettings,
) => Promise<BwsClientLike>;

export interface StripeSecrets {
  secretKey: string;
  webhookSecret: string;
}

export const CACHE_TTL_MS = 5 * 60_000;

let cache: { key: string; at: number; secrets: StripeSecrets } | null = null;

export function clearStripeSecretCache(): void {
  cache = null;
}

class LookupError extends Error {}

type SdkResponse = { success?: boolean; data?: unknown };

/** Loaded lazily so the WASM core only starts inside the Node action. */
export const defaultBwsClientFactory: BwsClientFactory = async (token, settings) => {
  const mod = (await import("@bitwarden/sdk-wasm")) as unknown as {
    BitwardenClient?: new (settings?: string, logLevel?: number) => SdkClient;
    default?: { BitwardenClient: new (settings?: string, logLevel?: number) => SdkClient };
  };
  const Ctor = mod.BitwardenClient ?? mod.default?.BitwardenClient;
  if (!Ctor) throw new LookupError("sdk unavailable");
  const sdk = new Ctor(
    JSON.stringify({
      apiUrl: settings.apiUrl,
      identityUrl: settings.identityUrl,
      userAgent: "Cosmograph Convex billing",
      deviceType: "SDK",
    }),
    4, // LogLevel.Error: the SDK never logs secret values at any level we enable.
  );
  const run = async (command: unknown): Promise<unknown> => {
    const raw = await sdk.run_command(JSON.stringify(command));
    const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as SdkResponse;
    // errorMessage is deliberately dropped: it can carry server text.
    if (!parsed?.success) throw new LookupError("sdk command failed");
    return parsed.data;
  };
  await run({ accessTokenLogin: { accessToken: token } });
  return {
    listSecrets: async (organizationId) => {
      const data = (await run({ secrets: { list: { organizationId } } })) as {
        data?: BwsSecretIdentifier[];
      };
      return data?.data ?? [];
    },
    getSecrets: async (ids) => {
      const data = (await run({ secrets: { getByIds: { ids } } })) as { data?: BwsSecret[] };
      return data?.data ?? [];
    },
    close: () => sdk.free?.(),
  };
};

interface SdkClient {
  run_command(input: string): Promise<unknown>;
  free?(): void;
}

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

/**
 * Reads the named secrets from one project. Every name must match exactly one
 * secret in the project with a non-empty value, or the whole read fails.
 */
export async function readProjectSecrets(
  client: BwsClientLike,
  organizationId: string,
  projectId: string,
  names: readonly string[],
): Promise<Map<string, string>> {
  const identifiers = await client.listSecrets(organizationId);
  const ids = identifiers.filter((s) => names.includes(s.key)).map((s) => s.id);
  const secrets = ids.length ? await client.getSecrets(ids) : [];
  const out = new Map<string, string>();
  for (const name of names) {
    const matches = secrets.filter((s) => s.key === name && s.projectId === projectId);
    if (matches.length === 0) throw new LookupError("secret not found");
    if (matches.length > 1) throw new LookupError("secret key is ambiguous");
    const value = matches[0]!.value?.trim() ?? "";
    if (!value) throw new LookupError("secret is empty");
    out.set(name, value);
  }
  return out;
}

export async function loadStripeSecrets(
  cfg: BillingConfig,
  opts: {
    env?: Record<string, string | undefined>;
    factory?: BwsClientFactory;
    now?: number;
  } = {},
): Promise<StripeSecrets> {
  const env = opts.env ?? process.env;
  if (forbiddenSecretEnv(env).length > 0) {
    console.error(
      "billing: a Stripe secret is set as deployment env; refusing to run. Remove it (secrets come from Bitwarden Secrets Manager only).",
    );
    throw unavailable();
  }
  if ((env.OP_SERVICE_ACCOUNT_TOKEN ?? "").trim() !== "") {
    console.warn(
      "billing: OP_SERVICE_ACCOUNT_TOKEN is still set but 1Password is no longer read; remove it",
    );
  }
  const token = env.BWS_ACCESS_TOKEN?.trim();
  if (!token) {
    console.error("billing: BWS_ACCESS_TOKEN is not set");
    throw unavailable();
  }

  const now = opts.now ?? Date.now();
  const { bws } = cfg;
  const key = [
    bws.organizationId,
    bws.projectId,
    bws.secretKeyName,
    bws.webhookSecretName,
    bws.apiUrl,
    cfg.stripeMode,
  ].join("\u0000");
  if (cache && cache.key === key && now - cache.at < CACHE_TTL_MS) {
    return cache.secrets;
  }

  let secrets: StripeSecrets;
  let client: BwsClientLike | null = null;
  try {
    client = await (opts.factory ?? defaultBwsClientFactory)(token, {
      apiUrl: bws.apiUrl,
      identityUrl: bws.identityUrl,
    });
    const values = await readProjectSecrets(client, bws.organizationId, bws.projectId, [
      bws.secretKeyName,
      bws.webhookSecretName,
    ]);
    secrets = {
      secretKey: values.get(bws.secretKeyName)!,
      webhookSecret: values.get(bws.webhookSecretName)!,
    };
  } catch (err) {
    // Only our own lookup messages are logged; SDK errors are not echoed.
    console.error(
      `billing: could not load Stripe secrets from Bitwarden (${
        err instanceof LookupError ? err.message : "sdk error"
      })`,
    );
    throw unavailable();
  } finally {
    try {
      client?.close?.();
    } catch {
      // ignore
    }
  }

  if (
    !keyMatchesMode(secrets.secretKey, cfg.stripeMode) ||
    !/^whsec_[A-Za-z0-9]{10,}$/.test(secrets.webhookSecret)
  ) {
    console.error(
      "billing: Bitwarden Stripe secrets have the wrong shape or the wrong mode for STRIPE_MODE",
    );
    throw unavailable();
  }
  cache = { key, at: now, secrets };
  return secrets;
}
