import { test } from "node:test";
import assert from "node:assert/strict";
import { DailyBudget } from "./spendGuard";

const DAY = 86_400_000;

test("per-client allowance is enforced and resets at UTC midnight", () => {
  const b = new DailyBudget({ perClient: 2, global: 100 });
  const t = 10 * DAY + 1000;
  assert.equal(b.take("a", t).ok, true);
  assert.equal(b.take("a", t).ok, true);
  assert.deepEqual(b.take("a", t), { ok: false, reason: "client" });
  assert.equal(b.take("b", t).ok, true, "other clients are unaffected");
  assert.equal(b.take("a", 11 * DAY).ok, true, "new UTC day resets");
});

test("global breaker trips across many clients", () => {
  const b = new DailyBudget({ perClient: 5, global: 3 });
  assert.equal(b.take("a").ok, true);
  assert.equal(b.take("b").ok, true);
  assert.equal(b.take("c").ok, true);
  assert.deepEqual(b.take("d"), { ok: false, reason: "global" });
});

test("distinct-client flood fails closed instead of growing memory", () => {
  const b = new DailyBudget({ perClient: 5, global: 1000, maxTrackedClients: 2 });
  assert.equal(b.take("a").ok, true);
  assert.equal(b.take("b").ok, true);
  assert.deepEqual(b.take("c"), { ok: false, reason: "global" });
  assert.equal(b.take("a").ok, true, "known clients keep working");
});
