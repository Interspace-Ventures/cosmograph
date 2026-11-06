import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchProjectSecrets, readBitwardenConfig } from "./bitwarden.mjs";
import { convexEnvFromBitwarden, planEnvChanges } from "./convex-env.mjs";
import { deployArgs, guardDeploy, main, scrub } from "./deploy-from-bitwarden.mjs";

const ORG = "26d8cde4-6650-4416-b799-b4f90104b84c";
const PROJECT = "11111111-2222-4333-8444-555555555555";
const STAGING_KEY = "prod:shiny-magpie-750|eyFAKEstaging";
const PROD_KEY = "prod:marvelous-grouse-975|eyFAKEprod";

const stagingEnv = (extra = {}) => ({
  DEPLOY_ENVIRONMENT: "staging",
  VITE_CONVEX_URL: "https://shiny-magpie-750.convex.cloud",
  BWS_ACCESS_TOKEN: "0.fake-token",
  BWS_ORGANIZATION_ID: ORG,
  BWS_PROJECT_ID: PROJECT,
  ...extra,
});

function harness(secrets = { CONVEX_DEPLOY_KEY: STAGING_KEY }, opts = {}) {
  const calls = { fetched: 0, deploy: [], sync: [], smoke: [], log: [], error: [] };
  const deps = {
    fetchSecrets: async () => {
      calls.fetched += 1;
      return { values: new Map(Object.entries(secrets)), ambiguous: opts.ambiguous ?? [] };
    },
    deploy: async (key, args) => {
      calls.deploy.push({ key, args });
      return opts.deployCode ?? 0;
    },
    syncEnv: async (input) => {
      calls.sync.push(input);
    },
    smoke: async (deployment, origin) => {
      calls.smoke.push({ deployment, origin });
      return opts.smokeOk ?? true;
    },
    log: (line) => calls.log.push(line),
    error: (line) => calls.error.push(line),
  };
  return { calls, deps };
}

test("staging pre-deploy pushes the Bitwarden key to shiny-magpie-750 and smoke-tests it", async () => {
  const { calls, deps } = harness({ CONVEX_DEPLOY_KEY: STAGING_KEY, CONVEX_ENV_ASK_PER_MINUTE: "12" });
  const code = await main(["--pre-deploy"], stagingEnv({ RENDER_GIT_COMMIT: "abcdef1234567890" }), deps);
  assert.equal(code, 0);
  assert.equal(calls.deploy.length, 1);
  assert.equal(calls.deploy[0].key, STAGING_KEY);
  assert.deepEqual(calls.deploy[0].args, ["--typecheck", "disable", "--codegen", "disable", "--message", "render pre-deploy abcdef123456"]);
  assert.deepEqual(calls.smoke, [{ deployment: "shiny-magpie-750", origin: "https://staging.exo.now" }]);
  // env sync sees CONVEX_ENV_* only, never the deploy key as a value to sync
  assert.deepEqual([...calls.sync[0].values.keys()], ["CONVEX_ENV_ASK_PER_MINUTE"]);
  // no log line carries the key
  assert.ok(![...calls.log, ...calls.error].some((l) => l.includes("eyFAKE")));
});

test("pre-deploy with no token skips cleanly; an operator run fails", async () => {
  const env = stagingEnv({ BWS_ACCESS_TOKEN: "" });
  const a = harness();
  assert.equal(await main(["--pre-deploy"], env, a.deps), 0);
  assert.equal(a.calls.deploy.length, 0);
  const b = harness();
  assert.equal(await main([], env, b.deps), 1);
});

test("a plain CONVEX_DEPLOY_KEY in env is never used", async () => {
  const { calls, deps } = harness();
  const code = await main(["--pre-deploy"], stagingEnv({ BWS_ACCESS_TOKEN: "", CONVEX_DEPLOY_KEY: STAGING_KEY }), deps);
  assert.equal(code, 0);
  assert.equal(calls.deploy.length, 0);
  assert.equal(calls.fetched, 0);
});

test("production is refused before any secret is fetched", async () => {
  for (const env of [
    stagingEnv({ DEPLOY_ENVIRONMENT: "production", VITE_CONVEX_URL: "https://marvelous-grouse-975.convex.cloud" }),
    stagingEnv({ DEPLOY_ENVIRONMENT: "production", VITE_CONVEX_URL: "https://marvelous-grouse-975.convex.cloud", COSMOGRAPH_ALLOW_PROD_CONVEX_DEPLOY: "1" }),
    stagingEnv({ COSMOGRAPH_CONVEX_EXPECTED_DEPLOYMENT: "marvelous-grouse-975" }),
    stagingEnv({ VITE_CONVEX_URL: "https://marvelous-grouse-975.convex.cloud" }),
  ]) {
    const { calls, deps } = harness({ CONVEX_DEPLOY_KEY: PROD_KEY });
    assert.equal(await main(["--pre-deploy"], env, deps), 1);
    assert.equal(calls.fetched, 0);
    assert.equal(calls.deploy.length, 0);
  }
});

test("production runs only with both explicit flags and a production key", async () => {
  const env = {
    ...stagingEnv(),
    DEPLOY_ENVIRONMENT: "production",
    COSMOGRAPH_DEPLOYMENT_ENVIRONMENT: "production",
    COSMOGRAPH_ALLOW_PROD_CONVEX_DEPLOY: "1",
    VITE_CONVEX_URL: "https://marvelous-grouse-975.convex.cloud",
  };
  const ok = harness({ CONVEX_DEPLOY_KEY: PROD_KEY });
  assert.equal(await main(["--pre-deploy"], env, ok.deps), 0);
  assert.deepEqual(ok.calls.smoke, [{ deployment: "marvelous-grouse-975", origin: "https://cosmograph.space" }]);
  const wrong = harness({ CONVEX_DEPLOY_KEY: STAGING_KEY });
  assert.equal(await main(["--pre-deploy"], env, wrong.deps), 1);
  assert.equal(wrong.calls.deploy.length, 0);
});

test("staging refuses a production key or a key for another deployment", async () => {
  for (const key of [PROD_KEY, "prod:other-thing-123|x", "dev:shiny-magpie-750|x", "project:team:cosmograph|x", "not a key"]) {
    const { calls, deps } = harness({ CONVEX_DEPLOY_KEY: key });
    assert.equal(await main(["--pre-deploy"], stagingEnv(), deps), 1, key);
    assert.equal(calls.deploy.length, 0);
  }
});

test("guardDeploy rejects a VITE_CONVEX_URL or expected deployment that disagrees", () => {
  assert.equal(guardDeploy({ key: STAGING_KEY, env: { VITE_CONVEX_URL: "https://other-thing-1.convex.cloud" }, environment: "staging" }).ok, false);
  assert.equal(guardDeploy({ key: STAGING_KEY, env: { COSMOGRAPH_CONVEX_EXPECTED_DEPLOYMENT: "other-thing-1" }, environment: "staging" }).ok, false);
  assert.deepEqual(guardDeploy({ key: STAGING_KEY, env: {}, environment: "staging" }), { ok: true, deployment: "shiny-magpie-750" });
});

test("kill switches, PR previews and dry runs", async () => {
  const off = harness();
  assert.equal(await main(["--pre-deploy"], stagingEnv({ COSMOGRAPH_CONVEX_PREDEPLOY: "off" }), off.deps), 0);
  assert.equal(off.calls.fetched, 0);
  const pr = harness();
  assert.equal(await main(["--pre-deploy"], stagingEnv({ IS_PULL_REQUEST: "true" }), pr.deps), 0);
  assert.equal(pr.calls.fetched, 0);
  const noSync = harness();
  assert.equal(await main(["--pre-deploy"], stagingEnv({ COSMOGRAPH_CONVEX_ENV_SYNC: "off" }), noSync.deps), 0);
  assert.equal(noSync.calls.sync.length, 0);
  assert.equal(noSync.calls.deploy.length, 1);
  const dry = harness();
  assert.equal(await main(["--dry-run"], stagingEnv(), dry.deps), 0);
  assert.equal(dry.calls.deploy.length, 0);
  assert.equal(dry.calls.sync[0].dryRun, true);
});

test("failures stop the deploy: ambiguous key, failed push, failed smoke", async () => {
  const amb = harness({ CONVEX_DEPLOY_KEY: STAGING_KEY }, { ambiguous: ["CONVEX_DEPLOY_KEY"] });
  assert.equal(await main(["--pre-deploy"], stagingEnv(), amb.deps), 1);
  assert.equal(amb.calls.deploy.length, 0);
  const push = harness(undefined, { deployCode: 2 });
  assert.equal(await main(["--pre-deploy"], stagingEnv(), push.deps), 1);
  const smoke = harness(undefined, { smokeOk: false });
  assert.equal(await main(["--pre-deploy"], stagingEnv(), smoke.deps), 1);
});

test("readBitwardenConfig needs UUID ids and https URLs", () => {
  assert.equal(readBitwardenConfig({}), null);
  assert.throws(() => readBitwardenConfig({ BWS_ACCESS_TOKEN: "t" }));
  assert.throws(() => readBitwardenConfig({ BWS_ACCESS_TOKEN: "t", BWS_ORGANIZATION_ID: ORG, BWS_PROJECT_ID: PROJECT, BWS_API_URL: "http://x" }));
  assert.equal(readBitwardenConfig({ BWS_ACCESS_TOKEN: "t", BWS_ORGANIZATION_ID: ORG, BWS_PROJECT_ID: PROJECT }).apiUrl, "https://api.bitwarden.com");
});

test("fetchProjectSecrets reads only the configured project and flags duplicates", async () => {
  const config = readBitwardenConfig({ BWS_ACCESS_TOKEN: "t", BWS_ORGANIZATION_ID: ORG, BWS_PROJECT_ID: PROJECT });
  const other = "99999999-2222-4333-8444-555555555555";
  const rows = [
    { id: "1", key: "CONVEX_DEPLOY_KEY", projectId: PROJECT, value: STAGING_KEY },
    { id: "2", key: "CONVEX_DEPLOY_KEY", projectId: other, value: PROD_KEY },
    { id: "3", key: "CONVEX_ENV_A", projectId: PROJECT, value: "1" },
    { id: "4", key: "CONVEX_ENV_A", projectId: PROJECT, value: "2" },
    { id: "5", key: "UNRELATED", projectId: PROJECT, value: "x" },
  ];
  const factory = async () => ({
    listSecrets: async () => rows.map(({ id, key }) => ({ id, key })),
    getSecrets: async (ids) => rows.filter((r) => ids.includes(r.id)),
  });
  const got = await fetchProjectSecrets(config, (k) => k === "CONVEX_DEPLOY_KEY" || k.startsWith("CONVEX_ENV_"), factory);
  assert.deepEqual([...got.values], [["CONVEX_DEPLOY_KEY", STAGING_KEY]]);
  assert.deepEqual(got.ambiguous, ["CONVEX_ENV_A"]);
});

test("env sync helpers never sync CONVEX_* names and never delete", () => {
  const { wanted, rejected } = convexEnvFromBitwarden(new Map([["CONVEX_ENV_ASK_PER_MINUTE", "12"], ["CONVEX_ENV_CONVEX_URL", "x"], ["CONVEX_ENV_EMPTY", ""], ["OTHER", "y"]]));
  assert.deepEqual([...wanted], [["ASK_PER_MINUTE", "12"]]);
  assert.deepEqual(rejected, ["CONVEX_ENV_CONVEX_URL", "CONVEX_ENV_EMPTY"]);
  const plan = planEnvChanges(new Map([["A", "1"], ["B", "2"], ["C", "3"]]), new Map([["B", "2"], ["C", "old"], ["D", "keep"]]));
  assert.deepEqual(plan.added, ["A"]);
  assert.deepEqual(plan.updated, ["C"]);
  assert.deepEqual(plan.unchanged, ["B"]);
  assert.deepEqual(plan.changes.map((c) => c.name), ["A", "C"]);
});

test("scrub and deployArgs", () => {
  assert.equal(scrub(`x ${STAGING_KEY} y`, STAGING_KEY), "x [redacted] y");
  assert.deepEqual(deployArgs({}).slice(-2), ["--message", "render pre-deploy"]);
});
