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

test("convex-account is released to internal and F&F on 2026-11-08, never public by date", () => {
  for (const channel of ["internal", "friends-and-family"] as const) {
    const before = evaluateFeature("convex-account", {
      channel,
      now: new Date("2026-11-07T23:59:59.999Z"),
    });
    assert.equal(before.enabled, false, channel);
    assert.equal(before.reason, "not-released", channel);
    const on = evaluateFeature("convex-account", {
      channel,
      now: new Date("2026-11-08T00:00:00.000Z"),
    });
    assert.equal(on.enabled, true, channel);
    assert.equal(on.reason, "scheduled", channel);
    assert.equal(on.releaseAt, "2026-11-08", channel);
  }
  const prod = evaluateFeature("convex-account", {
    channel: "public",
    now: new Date("2029-12-31T00:00:00.000Z"),
  });
  assert.equal(prod.enabled, false);
  assert.equal(prod.reason, "unscheduled");
  assert.equal(prod.releaseAt, null);
});

test("convex-account overrides still win on every channel", () => {
  assert.equal(
    evaluateFeature("convex-account", {
      channel: "public",
      overrides: parseFeatureOverrides("convex-account=on"),
    }).reason,
    "override-on",
  );
  assert.equal(
    evaluateFeature("convex-account", {
      channel: "friends-and-family",
      now: new Date("2026-12-01T00:00:00.000Z"),
      overrides: parseFeatureOverrides("convex-account=off"),
    }).enabled,
    false,
  );
});
