import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateFeature,
  normalizeReleaseChannel,
  parseFeatureOverrides,
} from "./index";

test("releases a feature on its channel date", () => {
  assert.equal(
    evaluateFeature("ask-cosmo", {
      channel: "friends-and-family",
      now: new Date("2026-08-12T23:59:59.999Z"),
    }).enabled,
    false,
  );
  assert.equal(
    evaluateFeature("ask-cosmo", {
      channel: "friends-and-family",
      now: new Date("2026-08-13T00:00:00.000Z"),
    }).enabled,
    true,
  );
});

test("does not infer a public launch from the F&F schedule", () => {
  const decision = evaluateFeature("guided-tour", {
    channel: "public",
    now: new Date("2030-01-01T00:00:00.000Z"),
  });
  assert.equal(decision.enabled, false);
  assert.equal(decision.reason, "unscheduled");
});

test("supports explicit operational overrides", () => {
  const overrides = parseFeatureOverrides(
    "ask-cosmo=on,live-presence=off,unknown=on,bad=maybe",
  );
  assert.deepEqual(overrides, {
    "ask-cosmo": true,
    "live-presence": false,
  });
  assert.equal(
    evaluateFeature("ask-cosmo", {
      channel: "public",
      overrides,
    }).reason,
    "override-on",
  );
});

test("falls back when a release channel is invalid", () => {
  assert.equal(normalizeReleaseChannel("preview"), "friends-and-family");
  assert.equal(normalizeReleaseChannel("internal"), "internal");
});
