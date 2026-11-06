// Bitwarden Secrets Manager reader for the Convex pre-deploy
// (scripts/convex/deploy-from-bitwarden.mjs). Same contract and SDK calls as
// Construct's scripts/lib/convex-deploy-prod.mjs (construct#501) and Exo's
// src/lib/exo-secure/bitwarden.mjs (exo#354): one read-only machine-account
// token (BWS_ACCESS_TOKEN), plus the non-secret BWS_ORGANIZATION_ID and
// BWS_PROJECT_ID. Only secrets in that one project are read, and only the ones
// the caller names (the deploy key and CONVEX_ENV_* values). Values are never
// logged; every error message here is ours and value-free.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_BWS_API_URL = "https://api.bitwarden.com";
const DEFAULT_BWS_IDENTITY_URL = "https://identity.bitwarden.com";

/** Our own, value-free error; its message is safe to log. */
export class BitwardenError extends Error {}

const httpsUrl = (raw, fallback) => {
  const value = raw?.trim();
  if (!value) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
};

/**
 * The Bitwarden settings from env, or null when BWS_ACCESS_TOKEN is not set.
 * Throws BitwardenError when the token is set but the rest is malformed.
 */
export function readBitwardenConfig(env) {
  const token = env.BWS_ACCESS_TOKEN?.trim() ?? "";
  if (!token) return null;
  const organizationId = env.BWS_ORGANIZATION_ID?.trim() ?? "";
  const projectId = env.BWS_PROJECT_ID?.trim() ?? "";
  if (!UUID.test(organizationId) || !UUID.test(projectId)) {
    throw new BitwardenError("BWS_ORGANIZATION_ID and BWS_PROJECT_ID must be set (UUIDs)");
  }
  const apiUrl = httpsUrl(env.BWS_API_URL, DEFAULT_BWS_API_URL);
  const identityUrl = httpsUrl(env.BWS_IDENTITY_URL, DEFAULT_BWS_IDENTITY_URL);
  if (!apiUrl || !identityUrl) throw new BitwardenError("BWS_API_URL / BWS_IDENTITY_URL must be https");
  return { token, organizationId, projectId, apiUrl, identityUrl };
}

/** Default client: the official @bitwarden/sdk-wasm, imported only when used. */
export async function createBitwardenClient(token, settings) {
  let mod;
  try {
    mod = await import("@bitwarden/sdk-wasm");
  } catch {
    throw new BitwardenError("Bitwarden SDK unavailable");
  }
  const Ctor = mod.BitwardenClient ?? mod.default?.BitwardenClient;
  if (!Ctor) throw new BitwardenError("Bitwarden SDK unavailable");
  // LogLevel.Error (4): the SDK logs nothing at the levels we enable.
  const sdk = new Ctor(JSON.stringify({ ...settings, userAgent: "Cosmograph deploy", deviceType: "SDK" }), 4);
  const run = async (command) => {
    const raw = await sdk.run_command(JSON.stringify(command));
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    // errorMessage is deliberately dropped: it can carry server text.
    if (!parsed?.success) throw new BitwardenError("Bitwarden SDK command failed");
    return parsed.data;
  };
  await run({ accessTokenLogin: { accessToken: token } });
  return {
    listSecrets: async (organizationId) => (await run({ secrets: { list: { organizationId } } }))?.data ?? [],
    getSecrets: async (ids) => (await run({ secrets: { getByIds: { ids } } }))?.data ?? [],
  };
}

/**
 * Fetch the secrets in the configured project whose key is wanted.
 * `wanted(key)` picks names (e.g. the deploy key and CONVEX_ENV_*).
 * Returns { values: Map<key, value>, ambiguous: key[] }; a name held by more
 * than one secret in the project is left out of `values` and listed instead.
 */
export async function fetchProjectSecrets(config, wanted, factory = createBitwardenClient) {
  try {
    const client = await factory(config.token, { apiUrl: config.apiUrl, identityUrl: config.identityUrl });
    const ids = (await client.listSecrets(config.organizationId))
      .filter((s) => typeof s?.key === "string" && wanted(s.key))
      .map((s) => s.id);
    const secrets = ids.length ? await client.getSecrets(ids) : [];
    const seen = new Map();
    for (const s of secrets) {
      if (s?.projectId !== config.projectId || typeof s.key !== "string" || !wanted(s.key)) continue;
      seen.set(s.key, [...(seen.get(s.key) ?? []), typeof s.value === "string" ? s.value : ""]);
    }
    const values = new Map();
    const ambiguous = [];
    for (const [key, list] of seen) {
      if (list.length > 1) ambiguous.push(key);
      else values.set(key, list[0]);
    }
    return { values, ambiguous };
  } catch (error) {
    throw error instanceof BitwardenError ? error : new BitwardenError("could not reach Bitwarden");
  }
}
