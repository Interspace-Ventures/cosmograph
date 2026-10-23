import assert from "node:assert/strict";
import test from "node:test";
import {
  EXO_ID_APP,
  buildAuthorizeUrl,
  checkPendingSignIn,
  codeChallengeS256,
  parseCallbackParams,
  parseTokenResponse,
  resolveExoIdConfig,
  webCallbackUrl,
  webPkceCrypto,
} from "./core.ts";
import {
  AUTO_SIGN_IN_MAX_ATTEMPTS,
  AUTO_SIGN_IN_WINDOW_MS,
  claimAutoSignIn,
} from "./autoSignIn.ts";

const ISSUER = "https://frugal-eel-930.convex.site/exo-id";

test("defaults to the cosmograph Exo ID app and derives endpoints from the issuer", () => {
  const config = resolveExoIdConfig({ issuer: `${ISSUER}/` });
  assert.ok(config);
  assert.equal(config.app, EXO_ID_APP);
  assert.equal(EXO_ID_APP, "cosmograph");
  assert.equal(config.tokenUrl, `${ISSUER}/v1/token`);
  assert.equal(config.discoveryUrl, `${ISSUER}/.well-known/openid-configuration`);
  assert.equal(config.authorizeUrl, null);
  assert.equal(resolveExoIdConfig({ issuer: "" }), null);
  assert.equal(resolveExoIdConfig({ issuer: "http://evil.example/exo-id" }), null);
  assert.equal(resolveExoIdConfig({ issuer: ISSUER, app: "cosmograph-rc" })?.app, "cosmograph-rc");
});

test("callback URL keeps the app base path", () => {
  assert.equal(
    webCallbackUrl("https://staging.exo.now", "/cosmograph"),
    "https://staging.exo.now/cosmograph/auth/callback",
  );
  assert.equal(webCallbackUrl("https://cosmograph.space", ""), "https://cosmograph.space/auth/callback");
});

test("authorize URL carries app, redirect, state, and an S256 challenge", async () => {
  const challenge = await codeChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", webPkceCrypto);
  assert.equal(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  const url = new URL(
    buildAuthorizeUrl("https://staging.exo.now/id/authorize", {
      app: "cosmograph",
      redirectUri: "https://staging.exo.now/cosmograph/auth/callback",
      state: "s1",
      codeChallenge: challenge,
    }),
  );
  assert.equal(url.searchParams.get("app"), "cosmograph");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), "s1");
});

test("pending sign-in must match state and be recent", () => {
  const pending = { state: "s1", codeVerifier: "v", redirectUri: "r", returnPath: "/", createdAt: 1_000 };
  assert.equal(checkPendingSignIn(JSON.stringify(pending), "s1", 2_000).state, "s1");
  assert.throws(() => checkPendingSignIn(JSON.stringify(pending), "s2", 2_000), /did not match/);
  assert.throws(() => checkPendingSignIn(null, "s1", 2_000), /not started here/);
  assert.throws(() => checkPendingSignIn(JSON.stringify(pending), "s1", 1_000 + 11 * 60_000), /too long/);
});

test("parses callback params and token responses", () => {
  assert.deepEqual(parseCallbackParams("?code=abc&state=xyz"), { code: "abc", state: "xyz", error: null });
  const tokens = parseTokenResponse(
    {
      access_token: "a",
      refresh_token: "r",
      token_type: "Bearer",
      expires_in: 900,
      user: { id: "exo_user_1", email: "ada@example.com", name: "Ada" },
    },
    0,
  );
  assert.equal(tokens.expiresAt, 900_000);
  assert.equal(tokens.user.id, "exo_user_1");
  assert.throws(() => parseTokenResponse({ access_token: "a" }), /unexpected token response/);
});

test("auto sign-in loop guard allows two tries per window", () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  for (let i = 0; i < AUTO_SIGN_IN_MAX_ATTEMPTS; i++) assert.equal(claimAutoSignIn(storage, 1_000 + i), true);
  assert.equal(claimAutoSignIn(storage, 1_500), false);
  assert.equal(claimAutoSignIn(storage, 1_000 + AUTO_SIGN_IN_WINDOW_MS + 10), true);
});
