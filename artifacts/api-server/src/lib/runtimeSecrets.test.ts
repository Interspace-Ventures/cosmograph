import assert from "node:assert/strict";
import test from "node:test";
import {
  loadRuntimeSecrets,
  resetRuntimeSecrets,
  runtimeSecret,
  secretStatus,
  SECRET_SPECS,
  type OpClientFactory,
  type OpClientLike,
} from "./runtimeSecrets";

const OPENAI = "sk-proj-test0000000000000000000000000000";
const INTAKE = "intake-hmac-test-0123456789abcdefghijklmnopqrstuvwxyz";

const HOSTED = {
  NODE_ENV: "production",
  OP_SERVICE_ACCOUNT_TOKEN: "ops_test_token",
  OP_VAULT: "Interspace",
  OP_EXO_INTAKE_SECRET_ITEM: "Cosmograph production: EXO_INTAKE_SECRET",
};

type Field = { id: string; title: string; value: string };

function fakeVault(
  items: Record<string, Field[]>,
  calls: { tokens: string[]; gets: string[] } = { tokens: [], gets: [] },
): OpClientFactory {
  const client: OpClientLike = {
    vaults: { list: async () => [{ id: "v1", title: "Interspace" }] },
    items: {
      list: async () => Object.keys(items).map((title) => ({ id: title, title })),
      get: async (_vault, id) => {
        calls.gets.push(id);
        return { fields: items[id] ?? [] };
      },
    },
  };
  return async (token) => {
    calls.tokens.push(token);
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
    assert.ok(!line.includes(OPENAI) && !line.includes(INTAKE), "a secret value was logged");
  }
}

test("the server holds no OpenAI key: the intake secret is the only runtime secret", () => {
  assert.deepEqual(
    SECRET_SPECS.map((s) => s.id),
    ["exoIntakeSecret"],
  );
});

test("hosted: loads the intake secret from 1Password with the service account token", async () => {
  resetRuntimeSecrets();
  const calls = { tokens: [] as string[], gets: [] as string[] };
  const { log, lines } = capture();
  const status = await loadRuntimeSecrets({
    env: HOSTED,
    log,
    factory: fakeVault(
      {
        [HOSTED.OP_EXO_INTAKE_SECRET_ITEM]: [{ id: "password", title: "password", value: INTAKE }],
      },
      calls,
    ),
  });
  assert.deepEqual(calls.tokens, ["ops_test_token"]);
  assert.equal(runtimeSecret("exoIntakeSecret"), INTAKE);
  assert.deepEqual(status.exoIntakeSecret, { ready: true, source: "1password", reason: "ok" });
  assertNoSecretsLogged(lines);
});

test("retired OpenAI settings are never read, only named so they get removed", async () => {
  resetRuntimeSecrets();
  const calls = { tokens: [] as string[], gets: [] as string[] };
  const { log, lines } = capture();
  await loadRuntimeSecrets({
    env: {
      ...HOSTED,
      OP_OPENAI_API_KEY_ITEM: "Cosmograph production: OPENAI_API_KEY",
      AI_INTEGRATIONS_OPENAI_API_KEY: OPENAI,
      BWS_OPENAI_API_KEY_NAME: "cosmograph-openai",
    },
    log,
    factory: fakeVault(
      {
        "Cosmograph production: OPENAI_API_KEY": [{ id: "credential", title: "credential", value: OPENAI }],
        [HOSTED.OP_EXO_INTAKE_SECRET_ITEM]: [{ id: "password", title: "password", value: INTAKE }],
      },
      calls,
    ),
  });
  assert.deepEqual(calls.gets, [HOSTED.OP_EXO_INTAKE_SECRET_ITEM]);
  for (const name of ["OP_OPENAI_API_KEY_ITEM", "AI_INTEGRATIONS_OPENAI_API_KEY", "BWS_OPENAI_API_KEY_NAME"]) {
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
  assert.equal(secretStatus("exoIntakeSecret").reason, "op-token-missing");
  assert.ok(lines.some((l) => l.includes("EXO_INTAKE_SECRET is set in the host env")));
  assertNoSecretsLogged(lines);
});

test("hosted: env secrets are ignored even when 1Password is configured", async () => {
  resetRuntimeSecrets();
  await loadRuntimeSecrets({
    env: { ...HOSTED, EXO_INTAKE_SECRET: INTAKE },
    log: capture().log,
    factory: fakeVault({}),
  });
  assert.equal(runtimeSecret("exoIntakeSecret"), null);
  assert.equal(secretStatus("exoIntakeSecret").reason, "item-not-found");
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

test("fails closed: missing item ref, wrong shape, SDK error, timeout", async () => {
  resetRuntimeSecrets();
  await loadRuntimeSecrets({
    env: { ...HOSTED, OP_EXO_INTAKE_SECRET_ITEM: "" },
    log: capture().log,
    factory: fakeVault({}),
  });
  assert.equal(secretStatus("exoIntakeSecret").reason, "item-ref-missing");

  resetRuntimeSecrets();
  await loadRuntimeSecrets({
    env: HOSTED,
    log: capture().log,
    factory: fakeVault({
      [HOSTED.OP_EXO_INTAKE_SECRET_ITEM]: [{ id: "password", title: "password", value: "not a key" }],
    }),
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
