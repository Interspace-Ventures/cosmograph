import assert from "node:assert/strict";
import test from "node:test";
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from "jose";
import {
  isPublicStagingPath,
  stagingAccessDecision,
  stagingAccessRequired,
  verifyGatewayToken,
} from "./stagingAccess";

const ISSUER = "https://issuer.example.convex.site/exo-id";

async function keys() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  return { privateKey, jwks: createLocalJWKSet({ keys: [jwk] }) };
}

function mint(
  privateKey: CryptoKey,
  claims: Record<string, unknown> = {},
  opts: { aud?: string; sub?: string; iss?: string } = {},
) {
  return new SignJWT({ token_use: "gateway", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.iss ?? ISSUER)
    .setAudience(opts.aud ?? "exo-gateway:cosmograph")
    .setSubject(opts.sub ?? "exo-gateway")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

test("only enables the staging gate for explicit true values", () => {
  assert.equal(stagingAccessRequired(undefined), false);
  assert.equal(stagingAccessRequired("false"), false);
  assert.equal(stagingAccessRequired("true"), true);
  assert.equal(stagingAccessRequired("ON"), true);
});

test("keeps health and static assets public, nothing else", () => {
  assert.equal(isPublicStagingPath("/api/health"), true);
  assert.equal(isPublicStagingPath("/assets/index.js"), true);
  assert.equal(isPublicStagingPath("/sign-in"), false);
  assert.equal(isPublicStagingPath("/api/ask"), false);
});

test("forbids anything that did not come through the gateway", () => {
  assert.equal(
    stagingAccessDecision({ enabled: true, fromGateway: false, pathname: "/" }),
    "forbidden",
  );
  assert.equal(
    stagingAccessDecision({ enabled: true, fromGateway: true, pathname: "/" }),
    "allow",
  );
  assert.equal(
    stagingAccessDecision({ enabled: false, fromGateway: false, pathname: "/" }),
    "allow",
  );
});

test("accepts only a gateway token minted for cosmograph by the issuer", async () => {
  const { privateKey, jwks } = await keys();
  assert.equal(await verifyGatewayToken(await mint(privateKey), ISSUER, jwks), true);
  assert.equal(
    await verifyGatewayToken(await mint(privateKey, {}, { aud: "exo-gateway:moonshot" }), ISSUER, jwks),
    false,
  );
  assert.equal(
    await verifyGatewayToken(await mint(privateKey, {}, { iss: "https://evil.example" }), ISSUER, jwks),
    false,
  );
  assert.equal(
    await verifyGatewayToken(await mint(privateKey, { token_use: "access" }), ISSUER, jwks),
    false,
  );
  const other = await keys();
  assert.equal(await verifyGatewayToken(await mint(other.privateKey), ISSUER, jwks), false);
  assert.equal(await verifyGatewayToken(undefined, ISSUER, jwks), false);
  assert.equal(await verifyGatewayToken(await mint(privateKey), undefined, jwks), false);
});
