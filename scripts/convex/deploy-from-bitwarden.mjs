#!/usr/bin/env node
/**
 * Convex deploy for Cosmograph with the deploy key from Bitwarden Secrets Manager, so nobody runs
 * `npx convex deploy` (or `env set`) in a terminal (Samir, 2026-11-06; docs/runbooks/no-owner-terminal.md).
 * Render runs it as cosmograph-staging's Pre-Deploy Command, so every staging deploy pushes the
 * Convex functions first. Mirrors Construct's and Exo's scripts/convex/deploy-from-bitwarden.mjs
 * (construct#501, exo#354): same flags, same guards, Cosmograph's deployments and env names.
 *
 *   node scripts/convex/deploy-from-bitwarden.mjs --pre-deploy  # Render: skips (exit 0) when unconfigured
 *   node scripts/convex/deploy-from-bitwarden.mjs --dry-run     # fetch + guard + env plan, no writes
 *   node scripts/convex/deploy-from-bitwarden.mjs               # break-glass run; fails when unconfigured
 *
 * Which environment: COSMOGRAPH_DEPLOYMENT_ENVIRONMENT, else DEPLOY_ENVIRONMENT (render.yaml sets
 * it), staging | production. Each has exactly one Convex deployment:
 *   staging     shiny-magpie-750      (the Convex project's default "production" slot, so its key
 *                                      is prod:shiny-magpie-750|…)
 *   production  marvelous-grouse-975  prod:marvelous-grouse-975|…
 * COSMOGRAPH_CONVEX_EXPECTED_DEPLOYMENT and VITE_CONVEX_URL, when set, must agree with it.
 *
 * The key: the Bitwarden secret CONVEX_DEPLOY_KEY (override COSMOGRAPH_BWS_CONVEX_KEY_NAME) in the
 * project BWS_PROJECT_ID, read with the one read-only BWS_ACCESS_TOKEN on the service. There is no
 * plain-env key path: a Convex key never sits in Render's env.
 *
 * Before the push, every Bitwarden secret CONVEX_ENV_<NAME> in that project is set as Convex env
 * <NAME> (add/update only; COSMOGRAPH_CONVEX_ENV_SYNC=off turns it off). After the push, read-only
 * smoke checks: GET /health and an Ask Cosmo CORS preflight on https://<deployment>.convex.site.
 *
 * Hard stops (exit 1, nothing deployed): production unless COSMOGRAPH_DEPLOYMENT_ENVIRONMENT=production
 * AND COSMOGRAPH_ALLOW_PROD_CONVEX_DEPLOY=1 (checked before any secret is fetched); the key is for
 * another deployment than the environment's. Skips (exit 0): COSMOGRAPH_CONVEX_PREDEPLOY=off; Render
 * PR previews (IS_PULL_REQUEST=true) unless CONVEX_PREVIEW_PUSH=true; --pre-deploy with no token.
 * The key reaches the Convex CLI through its environment only, is never printed, and the CLI's
 * output is scrubbed of it as a second guard.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { BitwardenError, fetchProjectSecrets, readBitwardenConfig } from "./bitwarden.mjs";
import { CONVEX_ENV_PREFIX, syncConvexEnv } from "./convex-env.mjs";

export const STAGING_DEPLOYMENT = "shiny-magpie-750";
export const PRODUCTION_DEPLOYMENT = "marvelous-grouse-975";

/** Environment -> its one Convex deployment, the accepted key prefix, and the smoke-test Origin. */
export const TARGETS = {
  staging: { deployment: STAGING_DEPLOYMENT, prefixes: [`prod:${STAGING_DEPLOYMENT}|`], origin: "https://staging.exo.now" },
  production: { deployment: PRODUCTION_DEPLOYMENT, prefixes: [`prod:${PRODUCTION_DEPLOYMENT}|`], origin: "https://cosmograph.space" },
};

const TAG = "[convex-deploy]";
const DEPLOYMENT = /^[a-z]+-[a-z]+-\d+$/;
const KEY_NAME = /^[A-Z][A-Z0-9_]{0,127}$/;
const truthy = (value) => (value ?? "").trim().toLowerCase() === "true";
const isOff = (value) => ["off", "0", "false", "no"].includes((value ?? "").trim().toLowerCase());
const PROD_FLAGS = "COSMOGRAPH_DEPLOYMENT_ENVIRONMENT=production and COSMOGRAPH_ALLOW_PROD_CONVEX_DEPLOY=1";

/** The deployment a Convex deploy key is for, or null (project/preview keys and anything else). */
export function deploymentFromKey(key) {
  const match = /^(?:prod|preview|dev):([a-z]+-[a-z]+-\d+)\|./.exec(String(key ?? "").trim());
  return match ? match[1] : null;
}

/** The deployment named by a Convex URL (https://<name>.convex.cloud or .site), or null. */
export function deploymentFromUrl(url) {
  const match = /^https:\/\/([a-z]+-[a-z]+-\d+)\.convex\.(?:cloud|site)\/?$/.exec(url?.trim() ?? "");
  return match ? match[1] : null;
}

/** staging | production | null. */
export function environmentFrom(env) {
  const raw = (env.COSMOGRAPH_DEPLOYMENT_ENVIRONMENT || env.DEPLOY_ENVIRONMENT || "").trim().toLowerCase();
  return Object.hasOwn(TARGETS, raw) ? raw : null;
}

/** Production needs both explicit flags. Pure. */
export function prodAllowed(env) {
  return env.COSMOGRAPH_DEPLOYMENT_ENVIRONMENT?.trim() === "production" && env.COSMOGRAPH_ALLOW_PROD_CONVEX_DEPLOY?.trim() === "1";
}

/**
 * Refuse production before anything is fetched: the environment, an expected deployment, or a
 * VITE_CONVEX_URL naming production all need both flags. Returns a reason, or null.
 */
export function productionPreflight(env, environment) {
  const namesProd =
    environment === "production" ||
    env.COSMOGRAPH_CONVEX_EXPECTED_DEPLOYMENT?.trim() === PRODUCTION_DEPLOYMENT ||
    deploymentFromUrl(env.VITE_CONVEX_URL) === PRODUCTION_DEPLOYMENT;
  if (!namesProd || prodAllowed(env)) return null;
  return `${PRODUCTION_DEPLOYMENT} is production: needs ${PROD_FLAGS} (Samir approves wiring it)`;
}

/** Decide whether a deploy may go ahead. Returns { ok: true, deployment } or { ok: false, reason }. Pure. */
export function guardDeploy({ key, env, environment }) {
  const target = Object.hasOwn(TARGETS, environment) ? TARGETS[environment] : null;
  if (!target) return { ok: false, reason: "unknown deployment environment" };
  const explicit = env.COSMOGRAPH_CONVEX_EXPECTED_DEPLOYMENT?.trim() || null;
  if (explicit && !DEPLOYMENT.test(explicit)) return { ok: false, reason: "COSMOGRAPH_CONVEX_EXPECTED_DEPLOYMENT is not a Convex deployment name" };
  if (explicit && explicit !== target.deployment) {
    return { ok: false, reason: `COSMOGRAPH_CONVEX_EXPECTED_DEPLOYMENT (${explicit}) is not the ${environment} deployment (${target.deployment})` };
  }
  const fromUrl = deploymentFromUrl(env.VITE_CONVEX_URL);
  if (fromUrl && fromUrl !== target.deployment) {
    return { ok: false, reason: `VITE_CONVEX_URL (${fromUrl}) is not the ${environment} deployment (${target.deployment})` };
  }
  const fromKey = deploymentFromKey(key);
  if (!fromKey) return { ok: false, reason: "the value is not a deployment-scoped Convex deploy key" };
  if (fromKey === PRODUCTION_DEPLOYMENT && !prodAllowed(env)) {
    return { ok: false, reason: `${PRODUCTION_DEPLOYMENT} is production: needs ${PROD_FLAGS}` };
  }
  if (fromKey !== target.deployment || !target.prefixes.some((p) => key.trim().startsWith(p))) {
    return { ok: false, reason: `the key is for ${fromKey}, expected ${target.deployment}` };
  }
  return { ok: true, deployment: fromKey };
}

/** Read-only smoke checks on https://<deployment>.convex.site. Logs status codes only. */
export async function smokeCheck(deployment, origin, fetchImpl = fetch, log = console.log) {
  const site = `https://${deployment}.convex.site`;
  let failures = 0;
  // 1. /health answers 200 with the Ask Cosmo gateway state.
  let verdict = "no response";
  try {
    const response = await fetchImpl(`${site}/health`, { signal: AbortSignal.timeout(20_000) });
    const body = await response.json().catch(() => null);
    const ask = body?.integrations?.askCosmo;
    verdict =
      response.status === 200 && body?.status === "ok" && typeof ask?.reason === "string"
        ? `ok (askCosmo ${ask.reason}, released ${ask.released === true})`
        : `HTTP ${response.status}`;
  } catch {
    verdict = "no response";
  }
  if (!verdict.startsWith("ok")) failures += 1;
  log(`${TAG} ${verdict.startsWith("ok") ? "ok  " : "FAIL"} GET /health -> ${verdict}`);
  // 2. Ask Cosmo's CORS preflight from the app's origin (204, or 404 while the flag is off).
  let code = 0;
  try {
    const response = await fetchImpl(`${site}/ask/chat`, {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
      signal: AbortSignal.timeout(20_000),
    });
    code = response.status;
  } catch {
    code = 0;
  }
  const ok = code === 204 || code === 404;
  if (!ok) failures += 1;
  log(`${TAG} ${ok ? "ok  " : "FAIL"} OPTIONS /ask/chat (Origin ${origin}) -> ${code || "no response"} (wanted 204, or 404 while ask-cosmo is off)`);
  return failures === 0;
}

/** Replace every occurrence of the secret in a chunk of CLI output. */
export const scrub = (text, secret) => (secret ? String(text).split(secret).join("[redacted]") : String(text));

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function runConvexDeploy(key, extraArgs, cwd = ROOT) {
  const childEnv = { ...process.env, CONVEX_DEPLOY_KEY: key };
  // The child never needs the Bitwarden token, and CONVEX_DEPLOYMENT would fight the deploy key.
  delete childEnv.BWS_ACCESS_TOKEN;
  delete childEnv.CONVEX_DEPLOYMENT;
  return new Promise((done) => {
    const child = spawn("npx", ["--no", "convex", "deploy", "-y", ...extraArgs], { cwd, env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => process.stdout.write(scrub(chunk, key)));
    child.stderr.on("data", (chunk) => process.stderr.write(scrub(chunk, key)));
    child.on("error", () => done(1));
    child.on("close", (code) => done(code ?? 1));
  });
}

/**
 * The CLI flags. The Render build already compiled the app, and Cosmograph's Convex functions
 * import ./lib/server (convex/_generated is not committed), so typecheck and codegen are skipped;
 * the push still bundles every function. The audit-log message names the commit.
 */
export function deployArgs(env) {
  const commit = (env.RENDER_GIT_COMMIT ?? "").trim().slice(0, 12);
  return ["--typecheck", "disable", "--codegen", "disable", "--message", `render pre-deploy${commit ? ` ${commit}` : ""}`];
}

/**
 * Returns the exit code. Everything external is injectable for tests: deps.fetchSecrets(config,
 * wanted), deps.deploy(key, args), deps.syncEnv(input), deps.smoke(deployment, origin), deps.log / deps.error.
 */
export async function main(argv = process.argv.slice(2), env = process.env, deps = {}) {
  const log = deps.log ?? console.log;
  const error = deps.error ?? console.error;
  const preDeploy = argv.includes("--pre-deploy");
  const dryRun = argv.includes("--dry-run");

  if (isOff(env.COSMOGRAPH_CONVEX_PREDEPLOY)) {
    log(`${TAG} COSMOGRAPH_CONVEX_PREDEPLOY is off; skipping the Convex push.`);
    return 0;
  }
  if (truthy(env.IS_PULL_REQUEST) && !truthy(env.CONVEX_PREVIEW_PUSH)) {
    log(`${TAG} PR preview; skipping the Convex push (set CONVEX_PREVIEW_PUSH=true to push).`);
    return 0;
  }

  const environment = environmentFrom(env);
  if (!environment) {
    const line = `${TAG} no deployment environment (COSMOGRAPH_DEPLOYMENT_ENVIRONMENT / DEPLOY_ENVIRONMENT is not staging or production); skipping the Convex push.`;
    if (preDeploy) {
      log(line);
      return 0;
    }
    error(line.replace("skipping the Convex push", "nothing to deploy"));
    return 1;
  }

  // Production is refused before any secret is fetched.
  const refusal = productionPreflight(env, environment);
  if (refusal) {
    error(`${TAG} refusing to deploy: ${refusal}.`);
    return 1;
  }

  let config;
  try {
    config = readBitwardenConfig(env);
  } catch (err) {
    error(`${TAG} ${err instanceof BitwardenError ? err.message : "bad Bitwarden configuration"}; stopping.`);
    return 1;
  }
  if (!config) {
    const line = `${TAG} BWS_ACCESS_TOKEN is not set; skipping the Convex push for ${environment}. Set BWS_ACCESS_TOKEN on this service to push Convex on every deploy.`;
    if (preDeploy) {
      log(line);
      return 0;
    }
    error(line.replace("skipping the Convex push", "nothing to deploy with"));
    return 1;
  }

  const keyName = env.COSMOGRAPH_BWS_CONVEX_KEY_NAME?.trim() || "CONVEX_DEPLOY_KEY";
  if (!KEY_NAME.test(keyName)) {
    error(`${TAG} COSMOGRAPH_BWS_CONVEX_KEY_NAME is not an UPPER_SNAKE key name; stopping.`);
    return 1;
  }
  let key = "";
  let values = new Map();
  try {
    const fetched = await (deps.fetchSecrets ?? fetchProjectSecrets)(config, (name) => name === keyName || name.startsWith(CONVEX_ENV_PREFIX));
    if (fetched.ambiguous.includes(keyName)) {
      error(`${TAG} more than one Bitwarden secret is named ${keyName} in the project; stopping.`);
      return 1;
    }
    for (const name of fetched.ambiguous) log(`${TAG} env: more than one Bitwarden secret is named ${name}; skipping it.`);
    values = fetched.values;
    key = (values.get(keyName) ?? "").trim();
    values.delete(keyName);
  } catch (err) {
    error(`${TAG} ${(err instanceof BitwardenError ? err.message : "could not load from Bitwarden").replace(/\.$/, "")}; stopping.`);
    return 1;
  }
  if (!key) {
    error(`${TAG} no Bitwarden secret named ${keyName} in the project; stopping.`);
    return 1;
  }

  const verdict = guardDeploy({ key, env, environment });
  if (!verdict.ok) {
    error(`${TAG} refusing to deploy: ${verdict.reason}.`);
    return 1;
  }
  const deployment = verdict.deployment;
  log(`${TAG} ${keyName} from Bitwarden is for ${deployment} (${environment}, expected); ${dryRun ? "dry run, not deploying" : "deploying"}.`);

  if (isOff(env.COSMOGRAPH_CONVEX_ENV_SYNC)) {
    log(`${TAG} env: COSMOGRAPH_CONVEX_ENV_SYNC is off; Convex env left as is.`);
  } else {
    try {
      await (deps.syncEnv ?? syncConvexEnv)({ deployment, adminKey: key, values, log, dryRun });
    } catch (err) {
      error(`${TAG} env sync failed: ${scrub(err instanceof Error ? err.message : "error", key)}; stopping.`);
      return 1;
    }
  }
  values = new Map();
  if (dryRun) return 0;

  const code = await (deps.deploy ?? runConvexDeploy)(key, deployArgs(env));
  key = "";
  if (code !== 0) {
    error(`${TAG} npx convex deploy failed (exit ${code}).`);
    return 1;
  }
  log(`${TAG} smoke test on https://${deployment}.convex.site:`);
  const healthy = await (deps.smoke ?? ((d, o) => smokeCheck(d, o, fetch, log)))(deployment, TARGETS[environment].origin);
  log(healthy ? `${TAG} done.` : `${TAG} some smoke checks failed.`);
  return healthy ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(
    (code) => process.exit(code),
    () => {
      console.error(`${TAG} unexpected error; stopping.`);
      process.exit(1);
    },
  );
}
