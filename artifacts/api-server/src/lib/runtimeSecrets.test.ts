import assert from "node:assert/strict";
import test from "node:test";
import {
  loadRuntimeSecrets,
  resetRuntimeSecrets,
  runtimeSecret,
  secretStatus,
  SECRET_SPECS,
  type BwsClientFactory,
  type BwsClientLike,
  type BwsSecret,
} from "./runtimeSecrets";

const OPENAI = "sk-proj-test0000000000000000000000000000";
const INTAKE = "intake-hmac-test-0123456789abcdefghijklmnopqrstuvwxyz";
const INTAKE_OTHER = "intake-hmac-other-project-0123456789abcdefghijklmn";

const ORG = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const OTHER_PROJECT = "33333333-3333-4333-8333-333333333333";

const HOSTED = {
  NODE_ENV: "production",
  BWS_ACCESS_TOKEN: "0.test-machine-account-token",
  BWS_ORGANIZATION_ID: ORG,
  BWS_PROJECT_ID: PROJECT,
  BWS_EXO_INTAKE_SECRET_NAME: "COSMOGRAPH_PROD_EXO_INTAKE_SECRET",
};

type Item = { key: string; value: string; projectId?: string };

function fakeBws(
  items: Item[],
  calls: { tokens: string[]; apiUrls: string[]; gets: string[] } = { tokens: [], apiUrls: [], gets: [] },
): BwsClientFactory {
  const all: BwsSecret[] = items.map((s, i) => ({
    id: `s${i}`,
    key: s.key,
    value: s.value,
    projectId: s.projectId ?? PROJECT,
  }));
  const client: BwsClientLike = {
    listSecrets: async (org) => (org === ORG ? all.map(({ id, key }) => ({ id, key })) : []),
    getSecrets: async (ids) => {
      calls.gets.push(...ids);
      return all.filter((s) => ids.includes(s.id));
    },
  };
  return async (token, settings) => {
    calls.tokens.push(token);
    calls.apiUrls.push(settings.apiUrl);
    return client;
  };
}

function capture() {
  const lines: string[] = [];
  return {
    lines,
    log: {
      info: (m: string) => lines.push(m),
      warn: (m: string) => lines.push(m),
      error: (m: string) => lines.push(m),
    },
  };
}

function assertNoSecretsLogged(lines: string[]) {
  for (const line of lines) {
    assert.ok(
      !line.includes(OPENAI) && !line.includes(INTAKE) && !line.includes(INTAKE_OTHER),
      "a secret value was logged",
    );
    assert.ok(!line.includes(HOSTED.BWS_ACCESS_TOKEN), "the access token was logged");
  }
}

test("the server holds no OpenAI key: the intake secret is the only runtime secret", () => {
  assert.deepEqual(
    SECRET_SPECS.map((s) => s.id),
    ["exoIntakeSecret"],
  );
});

test("hosted: loads the intake secret from the Bitwarden project with the access token", async () => {
  resetRuntimeSecrets();
  const calls = { tokens: [] as string[], apiUrls: [] as string[], gets: [] as string[] };
  const { log, lines } = capture();
  const status = await loadRuntimeSecrets({
    env: HOSTED,
    log,
    factory: fakeBws(
      [
        { key: HOSTED.BWS_EXO_INTAKE_SECRET_NAME, value: INTAKE },
        // Same key in a project this app does not use: never read.
        { key: HOSTED.BWS_EXO_INTAKE_SECRET_NAME, value: INTAKE_OTHER, projectId: OTHER_PROJECT },
      ],
      calls,
    ),
  });
  assert.deepEqual(calls.tokens, [HOSTED.BWS_ACCESS_TOKEN]);
  assert.deepEqual(calls.apiUrls, ["https://api.bitwarden.com"]);
  assert.equal(runtimeSecret("exoIntakeSecret"), INTAKE);
  assert.deepEqual(status.exoIntakeSecret, { ready: true, source: "bitwarden", reason: "ok" });
  assertNoSecretsLogged(lines);
});

test("retired OpenAI settings are never read, only named so they get removed", async () => {
  resetRuntimeSecrets();
  const calls = { tokens: [] as string[], apiUrls: [] as string[], gets: [] as string[] };
  const { log, lines } = capture();
  await loadRuntimeSecrets({
    env: {
      ...HOSTED,
      AI_INTEGRATIONS_OPENAI_API_KEY: OPENAI,
      BWS_OPENAI_API_KEY_NAME: "COSMOGRAPH_PROD_OPENAI_API_KEY",
    },
    log,
    factory: fakeBws(
      [
        { key: "COSMOGRAPH_PROD_OPENAI_API_KEY", value: OPENAI },
        { key: HOSTED.BWS_EXO_INTAKE_SECRET_NAME, value: INTAKE },
      ],
      calls,
    ),
  });
  // Only the intake secret (s1) is fetched; the OpenAI secret (s0) is never read.
  assert.deepEqual(calls.gets, ["s1"]);
  for (const name of ["AI_INTEGRATIONS_OPENAI_API_KEY", "BWS_OPENAI_API_KEY_NAME"]) {
    assert.ok(lines.some((l) => l.includes(`${name} is set but unused`)), name);
  }
  assertNoSecretsLogged(lines);
});

test("hosted: env secrets are ignored (named, never echoed) without a token", async () => {
  resetRuntimeSecrets();
  const { log, lines } = capture();
  await loadRuntimeSecrets({
    env: { NODE_ENV: "production", EXO_INTAKE_SECRET: INTAKE },
    log,
    factory: async () => {
      throw new Error("must not be called");
    },
  });
  assert.equal(runtimeSecret("exoIntakeSecret"), null);
  assert.equal(secretStatus("exoIntakeSecret").reason, "bws-token-missing");
  assert.ok(lines.some((l) => l.includes("EXO_INTAKE_SECRET is set in the host env")));
  assert.ok(lines.some((l) => l.includes("BWS_ACCESS_TOKEN is not set")));
  assertNoSecretsLogged(lines);
});

test("hosted: env secrets are ignored even when Bitwarden is configured", async () => {
  resetRuntimeSecrets();
  await loadRuntimeSecrets({
    env: { ...HOSTED, EXO_INTAKE_SECRET: INTAKE },
    log: capture().log,
    factory: fakeBws([]),
  });
  assert.equal(runtimeSecret("exoIntakeSecret"), null);
  assert.equal(secretStatus("exoIntakeSecret").reason, "secret-not-found");
});

test("local dev: falls back to env only when no token is set", async () => {
  resetRuntimeSecrets();
  await loadRuntimeSecrets({
    env: { NODE_ENV: "development", EXO_INTAKE_SECRET: INTAKE },
    log: capture().log,
  });
  assert.equal(runtimeSecret("exoIntakeSecret"), INTAKE);
  assert.deepEqual(secretStatus("exoIntakeSecret"), { ready: true, source: "env", reason: "ok" });

  resetRuntimeSecrets();
  await loadRuntimeSecrets({
    env: { NODE_ENV: "development", EXO_INTAKE_SECRET: "short" },
    log: capture().log,
  });
  assert.equal(runtimeSecret("exoIntakeSecret"), null);
  assert.equal(secretStatus("exoIntakeSecret").reason, "invalid-shape");
});

test("fails closed: config missing, key name missing/invalid, ambiguous, empty, wrong shape, SDK error, timeout", async () => {
  for (const env of [
    { ...HOSTED, BWS_PROJECT_ID: "" },
    { ...HOSTED, BWS_ORGANIZATION_ID: "my-org" },
    { ...HOSTED, BWS_API_URL: "http://api.bitwarden.com" },
  ]) {
    resetRuntimeSecrets();
    await loadRuntimeSecrets({
      env,
      log: capture().log,
      factory: async () => {
        throw new Error("must not be called");
      },
    });
    assert.equal(secretStatus("exoIntakeSecret").reason, "bws-config-missing");
  }

  resetRuntimeSecrets();
  await loadRuntimeSecrets({
    env: { ...HOSTED, BWS_EXO_INTAKE_SECRET_NAME: "" },
    log: capture().log,
    factory: fakeBws([]),
  });
  assert.equal(secretStatus("exoIntakeSecret").reason, "key-name-missing");

  resetRuntimeSecrets();
  await loadRuntimeSecrets({
    env: { ...HOSTED, BWS_EXO_INTAKE_SECRET_NAME: "Cosmograph production: EXO_INTAKE_SECRET" },
    log: capture().log,
    factory: fakeBws([]),
  });
  assert.equal(secretStatus("exoIntakeSecret").reason, "key-name-invalid");

  resetRuntimeSecrets();
  await loadRuntimeSecrets({
    env: HOSTED,
    log: capture().log,
    factory: fakeBws([
      { key: HOSTED.BWS_EXO_INTAKE_SECRET_NAME, value: INTAKE },
      { key: HOSTED.BWS_EXO_INTAKE_SECRET_NAME, value: INTAKE_OTHER },
    ]),
  });
  assert.equal(secretStatus("exoIntakeSecret").reason, "secret-ambiguous");
  assert.equal(runtimeSecret("exoIntakeSecret"), null);

  resetRuntimeSecrets();
  await loadRuntimeSecrets({
    env: HOSTED,
    log: capture().log,
    factory: fakeBws([{ key: HOSTED.BWS_EXO_INTAKE_SECRET_NAME, value: "   " }]),
  });
  assert.equal(secretStatus("exoIntakeSecret").reason, "secret-empty");

  resetRuntimeSecrets();
  await loadRuntimeSecrets({
    env: HOSTED,
    log: capture().log,
    factory: fakeBws([{ key: HOSTED.BWS_EXO_INTAKE_SECRET_NAME, value: "too short" }]),
  });
  assert.equal(secretStatus("exoIntakeSecret").reason, "invalid-shape");
  assert.equal(runtimeSecret("exoIntakeSecret"), null);

  resetRuntimeSecrets();
  const { log, lines } = capture();
  await loadRuntimeSecrets({
    env: HOSTED,
    log,
    factory: async () => {
      throw new Error(`boom ${INTAKE}`);
    },
  });
  assert.equal(secretStatus("exoIntakeSecret").reason, "lookup-failed");
  assert.ok(lines.some((l) => l.includes("(sdk error)")));
  assertNoSecretsLogged(lines);

  resetRuntimeSecrets();
  await loadRuntimeSecrets({
    env: HOSTED,
    log: capture().log,
    timeoutMs: 20,
    factory: () => new Promise(() => {}),
  });
  assert.equal(secretStatus("exoIntakeSecret").reason, "lookup-failed");
  assert.equal(runtimeSecret("exoIntakeSecret"), null);
});
