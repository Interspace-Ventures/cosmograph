/**
 * Server secrets for the Express API, loaded once at boot from Cosmograph's
 * 1Password vault with @1password/sdk.
 *
 * The only secret on a hosted deployment (Render) is the read-only
 * OP_SERVICE_ACCOUNT_TOKEN. Everything else here is non-secret config naming
 * where each secret lives, matching the Convex side (convex/lib/opSecrets.ts,
 * convex/lib/billingConfig.ts):
 *
 *   OP_VAULT                    vault title (default "Interspace")
 *   OP_EXO_INTAKE_SECRET_ITEM   item title holding the EXO intake HMAC secret
 *   OP_SECRET_FIELDS            field ids/titles to read, default "credential,password"
 *
 * Items are found by vault and item title through the SDK's list APIs rather
 * than op:// references, because titles like "Cosmograph production:
 * EXO_INTAKE_SECRET" contain characters secret references don't support.
 *
 * Ask Cosmo no longer needs a key here: it runs as a Convex HTTP action on the
 * Convex AI Gateway (convex/lib/aiGateway.ts), where Convex holds the provider
 * credentials.
 *
 * The env fallback (EXO_INTAKE_SECRET) is read
 * only for local development (NODE_ENV !== "production") and only when no
 * service account token is set. On a hosted build they are ignored, with a
 * warning naming the variable so it gets removed.
 *
 * Fail closed: a secret that cannot be loaded leaves its feature disabled and
 * reported on /api/health (`integrations`). Secret values are held in this
 * module's memory only, never logged, and never returned by any route; only
 * our own lookup messages are logged, never SDK error text.
 */

export type SecretId = "exoIntakeSecret";

export type SecretSource = "1password" | "env" | "none";

export type SecretStatus = {
  ready: boolean;
  source: SecretSource;
  /** "ok" when ready, otherwise why it is disabled. Never a secret value. */
  reason: string;
};

type SecretSpec = {
  id: SecretId;
  /** Non-secret env naming the 1Password item. */
  itemEnv: string;
  /** Local-dev-only env fallback. */
  devEnv: string;
  valid: (value: string) => boolean;
};

export const SECRET_SPECS: readonly SecretSpec[] = [
  {
    id: "exoIntakeSecret",
    itemEnv: "OP_EXO_INTAKE_SECRET_ITEM",
    devEnv: "EXO_INTAKE_SECRET",
    // Same floor exoIntake.ts has always enforced for the HMAC key.
    valid: (v) => v.length >= 32 && !/\s/.test(v),
  },
];

/**
 * Settings from before Ask Cosmo moved to the Convex AI Gateway. Nothing reads
 * them; a leftover one is named (never echoed) so it gets removed.
 */
export const RETIRED_ENV = [
  "AI_INTEGRATIONS_OPENAI_API_KEY",
  "AI_INTEGRATIONS_OPENAI_BASE_URL",
  "OP_OPENAI_API_KEY_ITEM",
  "BWS_OPENAI_API_KEY_NAME",
] as const;

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

/** Loaded lazily so the WASM core only starts when a token is configured. */
export const defaultOpClientFactory: OpClientFactory = async (token) => {
  const { createClient } = await import("@1password/sdk");
  const client = await createClient({
    auth: token,
    integrationName: "Cosmograph API server",
    integrationVersion: "1",
  });
  return client as unknown as OpClientLike;
};

export type LoadLogger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

type Env = Record<string, string | undefined>;

export const LOAD_TIMEOUT_MS = 15_000;

class LookupError extends Error {}

const values = new Map<SecretId, string>();
const statuses = new Map<SecretId, SecretStatus>();

function initial(): SecretStatus {
  return { ready: false, source: "none", reason: "not-loaded" };
}

/** The loaded secret, or null when its feature must stay disabled. */
export function runtimeSecret(id: SecretId): string | null {
  return values.get(id) ?? null;
}

export function secretStatus(id: SecretId): SecretStatus {
  return { ...(statuses.get(id) ?? initial()) };
}

/** Test helper. */
export function resetRuntimeSecrets(): void {
  values.clear();
  statuses.clear();
}

function set(id: SecretId, value: string | null, status: SecretStatus): void {
  if (value === null) values.delete(id);
  else values.set(id, value);
  statuses.set(id, status);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LookupError("timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function snapshot(): Record<SecretId, SecretStatus> {
  return Object.fromEntries(
    SECRET_SPECS.map((s) => [s.id, secretStatus(s.id)]),
  ) as Record<SecretId, SecretStatus>;
}

export async function loadRuntimeSecrets(
  opts: {
    env?: Env;
    factory?: OpClientFactory;
    log?: LoadLogger;
    timeoutMs?: number;
  } = {},
): Promise<Record<SecretId, SecretStatus>> {
  const env = opts.env ?? process.env;
  const log: LoadLogger = opts.log ?? {
    info: (m) => console.info(m),
    warn: (m) => console.warn(m),
    error: (m) => console.error(m),
  };
  const localDev = (env["NODE_ENV"] ?? "").trim() !== "production";
  const token = env["OP_SERVICE_ACCOUNT_TOKEN"]?.trim() ?? "";
  const vaultTitle = env["OP_VAULT"]?.trim() || "Interspace";
  const fields = (env["OP_SECRET_FIELDS"] ?? "credential,password")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  for (const name of RETIRED_ENV) {
    if ((env[name] ?? "").trim() !== "") {
      log.warn(
        `secrets: ${name} is set but unused (Ask Cosmo runs on the Convex AI Gateway and needs no OpenAI key); remove it`,
      );
    }
  }

  // Hosted builds never read secrets from env. Say so by name, never value.
  if (!localDev) {
    for (const spec of SECRET_SPECS) {
      if ((env[spec.devEnv] ?? "").trim() !== "") {
        log.warn(
          `secrets: ${spec.devEnv} is set in the host env and is ignored outside local dev; remove it (secrets come from 1Password only)`,
        );
      }
    }
  }

  if (!token) {
    for (const spec of SECRET_SPECS) {
      const devValue = env[spec.devEnv]?.trim() ?? "";
      if (localDev && devValue) {
        if (spec.valid(devValue)) {
          set(spec.id, devValue, { ready: true, source: "env", reason: "ok" });
        } else {
          set(spec.id, null, { ready: false, source: "env", reason: "invalid-shape" });
          log.error(`secrets: ${spec.devEnv} has the wrong shape; ${spec.id} disabled`);
        }
      } else {
        set(spec.id, null, { ready: false, source: "none", reason: "op-token-missing" });
      }
    }
    if (!localDev) {
      log.error(
        "secrets: OP_SERVICE_ACCOUNT_TOKEN is not set; feedback intake is disabled",
      );
    }
    return snapshot();
  }

  const wanted = SECRET_SPECS.filter((spec) => {
    if (!(env[spec.itemEnv]?.trim() ?? "")) {
      set(spec.id, null, { ready: false, source: "1password", reason: "item-ref-missing" });
      log.error(`secrets: ${spec.itemEnv} is not set; ${spec.id} disabled`);
      return false;
    }
    return true;
  });
  if (wanted.length === 0) return snapshot();

  try {
    await withTimeout(
      (async () => {
        const client = await (opts.factory ?? defaultOpClientFactory)(token);
        const vault = (await client.vaults.list()).find((v) => v.title === vaultTitle);
        if (!vault) throw new LookupError("vault not found");
        const items = await client.items.list(vault.id);
        for (const spec of wanted) {
          const title = env[spec.itemEnv]!.trim();
          const overview = items.find((item) => item.title === title);
          if (!overview) {
            set(spec.id, null, { ready: false, source: "1password", reason: "item-not-found" });
            log.error(`secrets: 1Password item for ${spec.itemEnv} not found; ${spec.id} disabled`);
            continue;
          }
          const item = await client.items.get(vault.id, overview.id);
          let value = "";
          for (const name of fields) {
            const field = item.fields.find((f) => f.id === name || f.title === name);
            if (field?.value?.trim()) {
              value = field.value.trim();
              break;
            }
          }
          if (!value) {
            set(spec.id, null, { ready: false, source: "1password", reason: "field-not-found" });
            log.error(
              `secrets: 1Password item for ${spec.itemEnv} has no ${fields.join("/")} field; ${spec.id} disabled`,
            );
          } else if (!spec.valid(value)) {
            set(spec.id, null, { ready: false, source: "1password", reason: "invalid-shape" });
            log.error(`secrets: 1Password value for ${spec.itemEnv} has the wrong shape; ${spec.id} disabled`);
          } else {
            set(spec.id, value, { ready: true, source: "1password", reason: "ok" });
          }
        }
      })(),
      opts.timeoutMs ?? LOAD_TIMEOUT_MS,
    );
  } catch (err) {
    const why = err instanceof LookupError ? err.message : "sdk error";
    for (const spec of wanted) {
      if (!statuses.get(spec.id)?.ready) {
        set(spec.id, null, { ready: false, source: "1password", reason: "lookup-failed" });
      }
    }
    // Only our own lookup messages are logged; SDK errors are not echoed.
    log.error(`secrets: could not load from 1Password (${why})`);
  }

  const ready = SECRET_SPECS.filter((s) => statuses.get(s.id)?.ready).map((s) => s.id);
  log.info(`secrets: loaded ${ready.length}/${SECRET_SPECS.length} (${ready.join(", ") || "none"})`);
  return snapshot();
}
