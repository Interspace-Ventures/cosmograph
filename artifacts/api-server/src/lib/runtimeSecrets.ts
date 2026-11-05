/**
 * Server secrets for the Express API, loaded once at boot from Cosmograph's
 * Bitwarden Secrets Manager project with @bitwarden/sdk-wasm.
 *
 * The only secret on a hosted deployment (Render) is the read-only
 * machine-account access token BWS_ACCESS_TOKEN. Everything else here is
 * non-secret config naming where each secret lives, matching the Convex side
 * (convex/lib/bwsSecrets.ts, convex/lib/billingConfig.ts):
 *
 *   BWS_ORGANIZATION_ID          Bitwarden organization id (UUID)
 *   BWS_PROJECT_ID               Secrets Manager project id (UUID)
 *   BWS_OPENAI_API_KEY_NAME      secret key name, e.g. COSMOGRAPH_PROD_OPENAI_API_KEY
 *   BWS_EXO_INTAKE_SECRET_NAME   secret key name, e.g. COSMOGRAPH_PROD_EXO_INTAKE_SECRET
 *   BWS_API_URL / BWS_IDENTITY_URL  optional; default Bitwarden US cloud
 *
 * Secrets are found by key name within BWS_PROJECT_ID. A name that matches no
 * secret, or more than one, in that project leaves its feature disabled.
 *
 * Env fallbacks (AI_INTEGRATIONS_OPENAI_API_KEY, EXO_INTAKE_SECRET) are read
 * only for local development (NODE_ENV !== "production") and only when no
 * access token is set. On a hosted build they are ignored, with a warning
 * naming the variable so it gets removed.
 *
 * Fail closed: a secret that cannot be loaded leaves its feature disabled and
 * reported on /api/health (`integrations`). Secret values are held in this
 * module's memory only, never logged, and never returned by any route; only
 * our own lookup messages are logged, never SDK or server error text.
 */

export type SecretId = "openaiApiKey" | "exoIntakeSecret";

export type SecretSource = "bitwarden" | "env" | "none";

export type SecretStatus = {
  ready: boolean;
  source: SecretSource;
  /** "ok" when ready, otherwise why it is disabled. Never a secret value. */
  reason: string;
};

type SecretSpec = {
  id: SecretId;
  /** Non-secret env naming the Bitwarden secret's key. */
  nameEnv: string;
  /** Local-dev-only env fallback. */
  devEnv: string;
  valid: (value: string) => boolean;
};

export const SECRET_SPECS: readonly SecretSpec[] = [
  {
    id: "openaiApiKey",
    nameEnv: "BWS_OPENAI_API_KEY_NAME",
    devEnv: "AI_INTEGRATIONS_OPENAI_API_KEY",
    valid: (v) => v.length >= 20 && !/\s/.test(v),
  },
  {
    id: "exoIntakeSecret",
    nameEnv: "BWS_EXO_INTAKE_SECRET_NAME",
    devEnv: "EXO_INTAKE_SECRET",
    // Same floor exoIntake.ts has always enforced for the HMAC key.
    valid: (v) => v.length >= 32 && !/\s/.test(v),
  },
];

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
  listSecrets(organizationId: string): Promise<BwsSecretIdentifier[]>;
  getSecrets(ids: string[]): Promise<BwsSecret[]>;
}

export interface BwsSettings {
  apiUrl: string;
  identityUrl: string;
}

export type BwsClientFactory = (
  token: string,
  settings: BwsSettings,
) => Promise<BwsClientLike>;

class LookupError extends Error {}

interface SdkClient {
  run_command(input: string): Promise<unknown>;
}
type SdkCtor = new (settings?: string, logLevel?: number) => SdkClient;

/**
 * One SDK client per process. sdk-wasm 0.1.0 installs a global logger when a
 * client is constructed and panics on a second construction in the same
 * process, so the client is created once and reused (re-login per load).
 */
let sdkSingleton: { settings: string; sdk: SdkClient } | null = null;

async function sharedSdk(settings: BwsSettings): Promise<SdkClient> {
  const serialized = JSON.stringify({
    apiUrl: settings.apiUrl,
    identityUrl: settings.identityUrl,
    userAgent: "Cosmograph API server",
    deviceType: "SDK",
  });
  if (sdkSingleton) {
    if (sdkSingleton.settings !== serialized) throw new LookupError("sdk settings changed");
    return sdkSingleton.sdk;
  }
  const mod = (await import("@bitwarden/sdk-wasm")) as unknown as {
    BitwardenClient?: SdkCtor;
    default?: { BitwardenClient?: SdkCtor };
  };
  const Ctor = mod.BitwardenClient ?? mod.default?.BitwardenClient;
  if (!Ctor) throw new LookupError("sdk unavailable");
  if (sdkSingleton) return (sdkSingleton as { sdk: SdkClient }).sdk;
  // LogLevel.Error (4): the SDK logs nothing at the levels we enable.
  sdkSingleton = { settings: serialized, sdk: new Ctor(serialized, 4) };
  return sdkSingleton.sdk;
}

/**
 * Loaded lazily so the WASM core only starts when a token is configured.
 * @bitwarden/sdk-wasm reads its .wasm file from its own package directory, so
 * build.mjs keeps it external (a real node_modules import).
 */
export const defaultBwsClientFactory: BwsClientFactory = async (token, settings) => {
  const sdk = await sharedSdk(settings);
  const run = async (command: unknown): Promise<unknown> => {
    const raw = await sdk.run_command(JSON.stringify(command));
    const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
      success?: boolean;
      data?: unknown;
    };
    // errorMessage is deliberately dropped: it can carry server text.
    if (!parsed?.success) throw new LookupError("sdk command failed");
    return parsed.data;
  };
  await run({ accessTokenLogin: { accessToken: token } });
  return {
    listSecrets: async (organizationId) =>
      ((await run({ secrets: { list: { organizationId } } })) as { data?: BwsSecretIdentifier[] })
        ?.data ?? [],
    getSecrets: async (ids) =>
      ((await run({ secrets: { getByIds: { ids } } })) as { data?: BwsSecret[] })?.data ?? [],
  };
};

export type LoadLogger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

type Env = Record<string, string | undefined>;

export const LOAD_TIMEOUT_MS = 15_000;
export const DEFAULT_BWS_API_URL = "https://api.bitwarden.com";
export const DEFAULT_BWS_IDENTITY_URL = "https://identity.bitwarden.com";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,127}$/;

function bwsUrl(raw: string | undefined, fallback: string): string | null {
  const value = raw?.trim();
  if (!value) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      return null;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

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
    factory?: BwsClientFactory;
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
  const token = env["BWS_ACCESS_TOKEN"]?.trim() ?? "";

  // Hosted builds never read secrets from env. Say so by name, never value.
  if (!localDev) {
    for (const spec of SECRET_SPECS) {
      if ((env[spec.devEnv] ?? "").trim() !== "") {
        log.warn(
          `secrets: ${spec.devEnv} is set in the host env and is ignored outside local dev; remove it (secrets come from Bitwarden Secrets Manager only)`,
        );
      }
    }
  }
  if ((env["OP_SERVICE_ACCOUNT_TOKEN"] ?? "").trim() !== "") {
    log.warn(
      "secrets: OP_SERVICE_ACCOUNT_TOKEN is still set but 1Password is no longer read; remove it",
    );
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
        set(spec.id, null, { ready: false, source: "none", reason: "bws-token-missing" });
      }
    }
    if (!localDev) {
      log.error(
        "secrets: BWS_ACCESS_TOKEN is not set; Ask Cosmo and feedback intake are disabled",
      );
    }
    return snapshot();
  }

  const organizationId = env["BWS_ORGANIZATION_ID"]?.trim() ?? "";
  const projectId = env["BWS_PROJECT_ID"]?.trim() ?? "";
  const apiUrl = bwsUrl(env["BWS_API_URL"], DEFAULT_BWS_API_URL);
  const identityUrl = bwsUrl(env["BWS_IDENTITY_URL"], DEFAULT_BWS_IDENTITY_URL);
  if (!UUID.test(organizationId) || !UUID.test(projectId) || !apiUrl || !identityUrl) {
    for (const spec of SECRET_SPECS) {
      set(spec.id, null, { ready: false, source: "bitwarden", reason: "bws-config-missing" });
    }
    log.error(
      "secrets: BWS_ORGANIZATION_ID / BWS_PROJECT_ID (UUIDs) or BWS_API_URL / BWS_IDENTITY_URL (https) are missing or malformed; Ask Cosmo and feedback intake are disabled",
    );
    return snapshot();
  }

  const wanted = SECRET_SPECS.filter((spec) => {
    const name = env[spec.nameEnv]?.trim() ?? "";
    if (!name) {
      set(spec.id, null, { ready: false, source: "bitwarden", reason: "key-name-missing" });
      log.error(`secrets: ${spec.nameEnv} is not set; ${spec.id} disabled`);
      return false;
    }
    if (!SECRET_NAME.test(name)) {
      set(spec.id, null, { ready: false, source: "bitwarden", reason: "key-name-invalid" });
      log.error(`secrets: ${spec.nameEnv} is not an UPPER_SNAKE key name; ${spec.id} disabled`);
      return false;
    }
    return true;
  });
  if (wanted.length === 0) return snapshot();

  try {
    await withTimeout(
      (async () => {
        const client = await (opts.factory ?? defaultBwsClientFactory)(token, { apiUrl, identityUrl });
        const names = wanted.map((spec) => env[spec.nameEnv]!.trim());
        const identifiers = await client.listSecrets(organizationId);
        const ids = identifiers.filter((s) => names.includes(s.key)).map((s) => s.id);
        const secrets = ids.length ? await client.getSecrets(ids) : [];
        for (const spec of wanted) {
          const name = env[spec.nameEnv]!.trim();
          const matches = secrets.filter((s) => s.key === name && s.projectId === projectId);
          const value = matches.length === 1 ? (matches[0]!.value?.trim() ?? "") : "";
          if (matches.length === 0) {
            set(spec.id, null, { ready: false, source: "bitwarden", reason: "secret-not-found" });
            log.error(`secrets: no secret named by ${spec.nameEnv} in the project; ${spec.id} disabled`);
          } else if (matches.length > 1) {
            set(spec.id, null, { ready: false, source: "bitwarden", reason: "secret-ambiguous" });
            log.error(`secrets: more than one secret named by ${spec.nameEnv} in the project; ${spec.id} disabled`);
          } else if (!value) {
            set(spec.id, null, { ready: false, source: "bitwarden", reason: "secret-empty" });
            log.error(`secrets: the secret named by ${spec.nameEnv} is empty; ${spec.id} disabled`);
          } else if (!spec.valid(value)) {
            set(spec.id, null, { ready: false, source: "bitwarden", reason: "invalid-shape" });
            log.error(`secrets: Bitwarden value for ${spec.nameEnv} has the wrong shape; ${spec.id} disabled`);
          } else {
            set(spec.id, value, { ready: true, source: "bitwarden", reason: "ok" });
          }
        }
      })(),
      opts.timeoutMs ?? LOAD_TIMEOUT_MS,
    );
  } catch (err) {
    const why = err instanceof LookupError ? err.message : "sdk error";
    for (const spec of wanted) {
      if (!statuses.get(spec.id)?.ready) {
        set(spec.id, null, { ready: false, source: "bitwarden", reason: "lookup-failed" });
      }
    }
    // Only our own lookup messages are logged; SDK errors are not echoed.
    log.error(`secrets: could not load from Bitwarden (${why})`);
  }

  const ready = SECRET_SPECS.filter((s) => statuses.get(s.id)?.ready).map((s) => s.id);
  log.info(`secrets: loaded ${ready.length}/${SECRET_SPECS.length} (${ready.join(", ") || "none"})`);
  return snapshot();
}
