import assert from "node:assert/strict";
import test from "node:test";
import {
  EXO_ID_PENDING_KEY,
  EXO_ID_STORAGE_KEY,
  beginSignIn,
  codeChallengeS256,
  completeSignIn,
  createExoIdSession,
  exoIdCallbackUrl,
  parseDiscovery,
  resolveExoIdEnv,
  safeReturnPath,
  type ExoIdConfig,
  type Fetcher,
  type KeyValueStorage,
} from "./exoId";

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

// Shape of Exo staging's discovery document (values from
// https://frugal-eel-930.convex.site/exo-id/.well-known/openid-configuration).
const DISCOVERY = {
  issuer: "https://frugal-eel-930.convex.site/exo-id",
  token_endpoint: "https://frugal-eel-930.convex.site/exo-key/v1/token",
  revocation_endpoint: "https://frugal-eel-930.convex.site/exo-key/v1/revoke",
  authorization_endpoint: "https://staging.exo.now/id/authorize",
  response_types_supported: ["code"],
  code_challenge_methods_supported: ["S256"],
};
const ENV = resolveExoIdEnv({ issuer: DISCOVERY.issuer, clientId: "cosmograph" })!;
const CONFIG: ExoIdConfig = parseDiscovery(DISCOVERY, ENV);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const TOKENS = {
  access_token: "at-1",
  token_type: "Bearer",
  expires_in: 900,
  refresh_token: "rt-1",
  user: { id: "exo|u1", email: "u@x.io", name: "U" },
};

test("env and discovery: endpoints come from discovery, issuer must match", () => {
  assert.equal(resolveExoIdEnv({ issuer: "http://evil.example", clientId: "cosmograph" }), null);
  assert.equal(resolveExoIdEnv({ issuer: DISCOVERY.issuer, clientId: "" }), null);
  assert.equal(CONFIG.authorizeUrl, "https://staging.exo.now/id/authorize");
  assert.equal(CONFIG.tokenUrl, "https://frugal-eel-930.convex.site/exo-key/v1/token");
  assert.throws(() => parseDiscovery({ ...DISCOVERY, issuer: "https://other.example" }, ENV));
  assert.throws(() => parseDiscovery({ ...DISCOVERY, code_challenge_methods_supported: ["plain"] }, ENV));
  assert.throws(() => parseDiscovery({ ...DISCOVERY, token_endpoint: "http://x.example/t" }, ENV));
});

test("callback URL follows the base path", () => {
  assert.equal(
    exoIdCallbackUrl("https://staging.exo.now", "/cosmograph"),
    "https://staging.exo.now/cosmograph/auth/callback",
  );
  assert.equal(exoIdCallbackUrl("https://cosmograph.space", ""), "https://cosmograph.space/auth/callback");
});

test("return paths can't leave the app", () => {
  assert.equal(safeReturnPath("/?author=A1"), "/?author=A1");
  for (const bad of ["//evil.example", "https://evil.example", "/\\evil", "", null]) {
    assert.equal(safeReturnPath(bad), "/");
  }
});

test("authorization code + PKCE round trip, redeemed in the browser", async () => {
  const pending = memoryStorage();
  const url = new URL(
    await beginSignIn({
      config: CONFIG,
      origin: "https://staging.exo.now",
      basePath: "/cosmograph",
      returnPath: "/?author=A5",
      storage: pending,
    }),
  );
  assert.equal(url.origin + url.pathname, "https://staging.exo.now/id/authorize");
  assert.equal(url.searchParams.get("app"), "cosmograph");
  assert.equal(url.searchParams.get("redirect_uri"), "https://staging.exo.now/cosmograph/auth/callback");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  const stored = JSON.parse(pending.data.get(EXO_ID_PENDING_KEY)!);
  assert.equal(url.searchParams.get("code_challenge"), await codeChallengeS256(stored.codeVerifier));

  let posted: Record<string, string> | null = null;
  const fetcher: Fetcher = async (input, init) => {
    assert.equal(input, CONFIG.tokenUrl);
    posted = JSON.parse(String(init.body));
    return jsonResponse(TOKENS);
  };
  const state = url.searchParams.get("state")!;
  const result = await completeSignIn({
    search: `?code=c1&state=${state}&iss=${encodeURIComponent(CONFIG.issuer)}`,
    getConfig: async () => CONFIG,
    pendingStorage: pending,
    fetcher,
  });
  assert.deepEqual(posted, {
    grant_type: "authorization_code",
    app: "cosmograph",
    code: "c1",
    redirect_uri: "https://staging.exo.now/cosmograph/auth/callback",
    code_verifier: stored.codeVerifier,
  });
  assert.equal(result.returnPath, "/?author=A5");
  assert.equal(result.tokens.user.id, "exo|u1");
  assert.equal(pending.data.has(EXO_ID_PENDING_KEY), false, "verifier is single use");
});

test("callback rejects a wrong state, a foreign issuer, and replays", async () => {
  const pending = memoryStorage();
  const fetcher: Fetcher = async () => jsonResponse(TOKENS);
  const begin = () =>
    beginSignIn({ config: CONFIG, origin: "https://cosmograph.space", returnPath: "/", storage: pending });

  await begin();
  await assert.rejects(
    completeSignIn({ search: "?code=c&state=nope", getConfig: async () => CONFIG, pendingStorage: pending, fetcher }),
    /did not match/,
  );
  const url = new URL(await begin());
  const state = url.searchParams.get("state");
  await assert.rejects(
    completeSignIn({
      search: `?code=c&state=${state}&iss=https%3A%2F%2Fevil.example`,
      getConfig: async () => CONFIG,
      pendingStorage: pending,
      fetcher,
    }),
    /unexpected issuer/,
  );
  await assert.rejects(
    completeSignIn({ search: `?code=c&state=${state}`, getConfig: async () => CONFIG, pendingStorage: pending, fetcher }),
    /not started in this browser tab/,
  );
});

test("session refreshes near expiry and clears on a dead grant", async () => {
  const storage = memoryStorage();
  let now = 1_000_000;
  storage.setItem(
    EXO_ID_STORAGE_KEY,
    JSON.stringify({ accessToken: "at-0", refreshToken: "rt-0", expiresAt: now + 30_000, user: { id: "exo|u1", email: null, name: null } }),
  );
  let calls = 0;
  let fail = false;
  const fetcher: Fetcher = async (_input, init) => {
    calls += 1;
    const body = JSON.parse(String(init.body));
    assert.equal(body.grant_type, "refresh_token");
    assert.equal(body.app, "cosmograph");
    return fail ? jsonResponse({ error: "invalid_grant" }, 400) : jsonResponse({ ...TOKENS, access_token: `at-${calls}` });
  };
  const session = createExoIdSession({ getConfig: async () => CONFIG, storage, fetcher, now: () => now });
  // Within the 60s skew: refresh, deduplicated across concurrent callers.
  const [a, b] = await Promise.all([session.getAccessToken(), session.getAccessToken()]);
  assert.equal(a, "at-1");
  assert.equal(b, "at-1");
  assert.equal(calls, 1);
  now += 20 * 60_000; // past the 15-minute access token
  fail = true;
  assert.equal(await session.getAccessToken(), null);
  assert.equal(session.getSnapshot(), null);
  assert.equal(storage.data.has(EXO_ID_STORAGE_KEY), false);
});
