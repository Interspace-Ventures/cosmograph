import assert from "node:assert/strict";
import test from "node:test";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey,
} from "jose";
import {
  DEFAULT_EXO_ID_AUDIENCE,
  exoIdAudiences,
  exoIdIssuer,
  exoVerifierConfig,
  presentedTokens,
  verifyExoToken,
  verifyPresentedTokens,
} from "./exoIdentity";

const ISSUER = "https://exo.example.convex.site/exo-id";
const config = { issuer: ISSUER, audiences: ["cosmograph"] };

async function keyset(): Promise<{
  sign: (claims: Record<string, unknown>, opts?: { aud?: string | string[]; iss?: string; exp?: string; alg?: string }) => Promise<string>;
  keys: JWTVerifyGetKey;
}> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  return {
    keys: createLocalJWKSet({ keys: [jwk] }),
    sign: (claims, opts = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(opts.iss ?? ISSUER)
        .setAudience(opts.aud ?? "cosmograph")
        .setSubject("exo_user_1")
        .setIssuedAt()
        .setExpirationTime(opts.exp ?? "15m")
        .sign(privateKey),
  };
}

test("issuer comes from EXO_ID_ISSUER, else EXO_CONVEX_SITE_URL + /exo-id, else unconfigured", () => {
  assert.equal(exoIdIssuer({ EXO_ID_ISSUER: `${ISSUER}/` }), ISSUER);
  assert.equal(
    exoIdIssuer({ EXO_CONVEX_SITE_URL: "https://exo.example.convex.site/" }),
    ISSUER,
  );
  assert.equal(exoIdIssuer({}), null);
  assert.equal(exoVerifierConfig({}), null);
});

test("audiences default to cosmograph and are configurable, never empty", () => {
  assert.deepEqual(exoIdAudiences({}), [DEFAULT_EXO_ID_AUDIENCE]);
  assert.deepEqual(exoIdAudiences({ EXO_ID_AUDIENCE: " , " }), ["cosmograph"]);
  assert.deepEqual(
    exoIdAudiences({ EXO_ID_AUDIENCE: "cosmograph-rc, cosmograph-rc" }),
    ["cosmograph-rc"],
  );
});

test("accepts a valid Cosmograph token and returns the Exo subject + claims", async () => {
  const { sign, keys } = await keyset();
  const token = await sign({ email: "ada@example.com", email_verified: true, name: "Ada" });
  const identity = await verifyExoToken(token, config, keys);
  assert.deepEqual(identity, {
    subject: "exo_user_1",
    issuer: ISSUER,
    audience: "cosmograph",
    email: "ada@example.com",
    emailVerified: true,
    name: "Ada",
  });
});

test("rejects the gateway's exo-staging audience unless explicitly configured", async () => {
  const { sign, keys } = await keyset();
  const gateway = await sign({}, { aud: "exo-staging" });
  assert.equal(await verifyExoToken(gateway, config, keys), null);
  const optedIn = await verifyExoToken(
    gateway,
    { issuer: ISSUER, audiences: ["cosmograph", "exo-staging"] },
    keys,
  );
  assert.equal(optedIn?.audience, "exo-staging");
});

test("rejects wrong issuer, expired tokens, foreign keys, and HS256", async () => {
  const { sign, keys } = await keyset();
  assert.equal(await verifyExoToken(await sign({}, { iss: "https://evil.example/exo-id" }), config, keys), null);
  assert.equal(await verifyExoToken(await sign({}, { exp: "-1m" }), config, keys), null);
  const other = await keyset();
  assert.equal(await verifyExoToken(await other.sign({}), config, keys), null);
  const hs = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience("cosmograph")
    .setSubject("exo_user_1")
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode("not-a-real-key-not-a-real-key-32"));
  assert.equal(await verifyExoToken(hs, config, keys), null);
  assert.equal(await verifyExoToken("not.a.jwt", config, keys), null);
});

test("collects Bearer then exo_access cookie, de-duplicated", () => {
  assert.deepEqual(
    presentedTokens({ headers: { authorization: "Bearer aaa", cookie: "x=1; exo_access=bbb" } }),
    ["aaa", "bbb"],
  );
  assert.deepEqual(
    presentedTokens({ headers: { authorization: "Bearer aaa", cookie: "exo_access=aaa" } }),
    ["aaa"],
  );
  assert.deepEqual(presentedTokens({ headers: { authorization: "Basic zzz" } }), []);
  assert.deepEqual(presentedTokens({ headers: {} }), []);
});

test("behind the gateway: exo-staging Bearer + Cosmograph cookie is accepted via the cookie", async () => {
  const { sign, keys } = await keyset();
  const gateway = await sign({}, { aud: "exo-staging" });
  const own = await sign({ email: "ada@example.com" });
  const identity = await verifyPresentedTokens([gateway, own], config, keys);
  assert.equal(identity?.audience, "cosmograph");
  assert.equal(await verifyPresentedTokens([gateway], config, keys), null);
  assert.equal(await verifyPresentedTokens([], config, keys), null);
});
