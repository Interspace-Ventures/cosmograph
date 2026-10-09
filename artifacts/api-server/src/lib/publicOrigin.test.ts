import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedOrigin, publicOrigins } from "./publicOrigin";
import { _test } from "../middlewares/securityHeaders";

test("our origins pass, look-alikes and junk do not", () => {
  assert.equal(isAllowedOrigin("https://cosmograph.space"), true);
  assert.equal(isAllowedOrigin("https://app.cosmograph.space"), true);
  assert.equal(isAllowedOrigin("https://cosmograph.space.evil.example"), false);
  assert.equal(isAllowedOrigin("https://evilcosmograph.space"), false);
  assert.equal(isAllowedOrigin("http://cosmograph.space"), false);
  assert.equal(isAllowedOrigin("https://cosmograph.space/path"), false);
  assert.equal(isAllowedOrigin("https://user@cosmograph.space"), false);
  assert.equal(isAllowedOrigin("null"), false);
  assert.equal(isAllowedOrigin(undefined), false);
});

test("configured origins replace defaults and reject non-https", () => {
  const list = publicOrigins({
    PUBLIC_APP_ORIGINS: "https://a.example, http://b.example, https://c.example/x",
    ALLOWED_ORIGINS: "http://localhost:5173",
  } as NodeJS.ProcessEnv);
  assert.deepEqual(list, ["https://a.example", "http://localhost:5173"]);
});

test("CSP forbids framing by strangers and object injection", () => {
  assert.match(_test.ENFORCED_CSP, /frame-ancestors 'self' https:\/\/cosmograph\.space/);
  assert.match(_test.ENFORCED_CSP, /object-src 'none'/);
  assert.doesNotMatch(_test.FRAME_ANCESTORS, /\*(\s|$)/);
});
