// Convex env sync for the pre-deploy, ported from Exo's scripts/convex/post-deploy.mjs (exo#354)
// so `npx convex env set` is never a terminal step. Every Bitwarden secret named
// CONVEX_ENV_<NAME> in the service's project becomes the Convex deployment env var <NAME>.
// Add or update only, never delete; names are logged, values never. Runs before the push so new
// functions find their env. COSMOGRAPH_CONVEX_ENV_SYNC=off turns it off.

export const CONVEX_ENV_PREFIX = "CONVEX_ENV_";
const ENV_NAME = /^[A-Za-z][A-Za-z0-9_]{0,99}$/;
const TAG = "[convex-deploy]";

/** Convex-managed names (CONVEX_*) and invalid names are never synced. */
export function isSyncableEnvName(name) {
  return ENV_NAME.test(name) && !name.startsWith("CONVEX_");
}

/** Pick CONVEX_ENV_<NAME> entries out of the Bitwarden values. */
export function convexEnvFromBitwarden(values) {
  const wanted = new Map();
  const rejected = [];
  for (const [key, value] of values) {
    if (!key.startsWith(CONVEX_ENV_PREFIX)) continue;
    const name = key.slice(CONVEX_ENV_PREFIX.length);
    if (!isSyncableEnvName(name) || value === "") {
      rejected.push(key);
      continue;
    }
    wanted.set(name, value);
  }
  return { wanted, rejected };
}

/** The changes needed so the deployment carries every wanted value. Never deletes. */
export function planEnvChanges(wanted, existing) {
  const changes = [];
  const added = [];
  const updated = [];
  const unchanged = [];
  for (const [name, value] of wanted) {
    const current = existing.get(name);
    if (current === undefined) added.push(name);
    else if (current !== value) updated.push(name);
    else {
      unchanged.push(name);
      continue;
    }
    changes.push({ name, value });
  }
  return { changes, added, updated, unchanged };
}

const cloudUrl = (deployment) => `https://${deployment}.convex.cloud`;

/** POST to the deployment's admin API with the deploy key. Errors never carry the key. */
async function adminPost({ deployment, adminKey, path, body, fetchImpl = fetch }) {
  const response = await fetchImpl(`${cloudUrl(deployment)}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Convex ${adminKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) throw new Error(`${path} answered HTTP ${response.status}`);
  return json;
}

/** Sync CONVEX_ENV_<NAME> values onto the deployment. Logs names only. */
export async function syncConvexEnv({ deployment, adminKey, values, fetchImpl = fetch, log = console.log, dryRun = false }) {
  const { wanted, rejected } = convexEnvFromBitwarden(values);
  for (const key of rejected) log(`${TAG} env: skipping ${key} (empty, or names a CONVEX_* / invalid variable).`);
  if (wanted.size === 0) {
    log(`${TAG} env: no ${CONVEX_ENV_PREFIX}* secrets in Bitwarden; Convex env left as is.`);
    return { added: [], updated: [], unchanged: [], rejected };
  }
  const listed = await adminPost({
    deployment,
    adminKey,
    path: "/api/query",
    body: { path: "_system/cli/queryEnvironmentVariables:default", format: "convex_encoded_json", args: {} },
    fetchImpl,
  });
  if (listed?.status !== "success") throw new Error("could not read the deployment's env");
  const existing = new Map((Array.isArray(listed.value) ? listed.value : []).map((v) => [String(v.name), String(v.value)]));
  const plan = planEnvChanges(wanted, existing);
  const summary = `added ${plan.added.join(", ") || "none"}; updated ${plan.updated.join(", ") || "none"}; unchanged ${plan.unchanged.length}`;
  if (plan.changes.length > 0 && !dryRun) {
    await adminPost({ deployment, adminKey, path: "/api/update_environment_variables", body: { changes: plan.changes }, fetchImpl });
  }
  log(`${TAG} env: ${dryRun ? "dry run, would set: " : ""}${summary}.`);
  return { added: plan.added, updated: plan.updated, unchanged: plan.unchanged, rejected };
}
