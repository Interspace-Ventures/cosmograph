import { test } from "node:test";
import assert from "node:assert/strict";
import { originAllowed } from "./sameOrigin";

test("same-origin page requests pass", () => {
  assert.equal(originAllowed("https://cosmograph.space", "cosmograph.space"), true);
  assert.equal(originAllowed("https://staging.exo.now", "staging.exo.now"), true);
});

test("missing, foreign, and plain-http origins are rejected", () => {
  assert.equal(originAllowed(undefined, "cosmograph.space"), false);
  assert.equal(originAllowed("https://evil.example", "cosmograph.space"), false);
  assert.equal(originAllowed("http://cosmograph.space", "cosmograph.space"), false);
  assert.equal(originAllowed("https://cosmograph.space.evil.example", "cosmograph.space"), false);
  assert.equal(originAllowed("null", "cosmograph.space"), false);
});
