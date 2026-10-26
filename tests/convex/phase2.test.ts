import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { ConvexError } from "convex/values";
import { FakeDb, identity, makeCtx } from "./fakeCtx";
import { entitlementHandler } from "../../convex/account";
import { unlockHandler } from "../../convex/billing";
import {
  claimHandler as shipClaim,
  getHandler as shipGet,
  saveHandler as shipSave,
} from "../../convex/ship";
import {
  claimHandler as referralClaim,
  ensureCodeHandler,
  mineHandler,
  SIGNUP_ATTRIBUTION_WINDOW_MS,
} from "../../convex/referral";
import { sanitizeAuthorId, sanitizeSeed } from "../../convex/lib/account";

const ALICE = identity("exo|alice", { email: "a@x.io", email_verified: true });
const BOB = identity("exo|bob");

function code(err: unknown): string | undefined {
  return err instanceof ConvexError
    ? (err.data as { code?: string }).code
    : undefined;
}

async function rejectsWith(p: Promise<unknown>, expected: string) {
  await assert.rejects(p, (err) => code(err) === expected);
}

let db: FakeDb;
beforeEach(() => {
  db = new FakeDb();
  // Gated features (premium-ships, referrals) on, like the internal channel.
  process.env.RELEASE_CHANNEL = "internal";
  delete process.env.FEATURE_FLAG_OVERRIDES;
});

async function member(subject = ALICE) {
  await db.insert("users", { exoSubject: subject.subject, hasPaid: true });
}

test("every Phase 2 function refuses anonymous callers", async () => {
  const anon = makeCtx(db, null);
  await rejectsWith(entitlementHandler(anon), "UNAUTHENTICATED");
  await rejectsWith(unlockHandler(anon, { author: "A1" }), "UNAUTHENTICATED");
  await rejectsWith(shipGet(anon), "UNAUTHENTICATED");
  await rejectsWith(shipSave(anon, { seed: "abc" }), "UNAUTHENTICATED");
  await rejectsWith(shipClaim(anon, { type: "fighter" }), "UNAUTHENTICATED");
  await rejectsWith(mineHandler(anon), "UNAUTHENTICATED");
  await rejectsWith(referralClaim(anon, { code: "abcd" }), "UNAUTHENTICATED");
});

test("entitlement defaults to a non-member with no unlocks", async () => {
  assert.deepEqual(await entitlementHandler(makeCtx(db, ALICE)), {
    entitled: false,
    email: null,
    includedSlots: 3,
    unlocked: [],
  });
});

test("unlock requires a server-written membership", async () => {
  await db.insert("users", { exoSubject: ALICE.subject, hasPaid: false });
  await rejectsWith(
    unlockHandler(makeCtx(db, ALICE), { author: "A123" }),
    "NOT_A_MEMBER",
  );
  assert.equal(db.rows("researcherUnlocks").length, 0);
});

test("unlock rejects non-canonical author ids", async () => {
  await member();
  for (const author of ["", "123", "A12&x=1", "a123", `A${"1".repeat(40)}`]) {
    await rejectsWith(
      unlockHandler(makeCtx(db, ALICE), { author }),
      "INVALID_AUTHOR",
    );
  }
});

test("unlock fills the included slots, is idempotent, then fails closed", async () => {
  await member();
  const ctx = makeCtx(db, ALICE);
  await unlockHandler(ctx, { author: "A1" });
  await unlockHandler(ctx, { author: "A2" });
  const again = await unlockHandler(ctx, { author: "A1" });
  assert.deepEqual(again.unlocked, ["A1", "A2"]);
  const third = await unlockHandler(ctx, { author: "A3" });
  assert.deepEqual(third.unlocked, ["A1", "A2", "A3"]);
  // Beyond the included slots the add-on charge is Phase 3: nothing recorded.
  await rejectsWith(unlockHandler(ctx, { author: "A4" }), "ADDON_UNAVAILABLE");
  assert.equal(db.rows("researcherUnlocks").length, 3);
  assert.deepEqual((await entitlementHandler(ctx)).unlocked, ["A1", "A2", "A3"]);
});

test("unlocks are scoped to the verified subject", async () => {
  await member();
  await member(BOB);
  await unlockHandler(makeCtx(db, ALICE), { author: "A1" });
  assert.deepEqual((await entitlementHandler(makeCtx(db, BOB))).unlocked, []);
});

test("ship save sanitizes the seed and creates the account row", async () => {
  const ctx = makeCtx(db, ALICE);
  const state = await shipSave(ctx, { seed: " ab-c!1234567890123456 " });
  assert.equal(state.shipSeed, "abc1234567890123");
  assert.equal(state.shipType, "scout");
  assert.equal(db.rows("users").length, 1);
  assert.equal(db.rows("users")[0].email, "a@x.io");
  await rejectsWith(shipSave(ctx, { seed: "!!!" }), "INVALID_SEED");
});

test("ship save refuses unknown and unowned premium hulls", async () => {
  const ctx = makeCtx(db, ALICE);
  await rejectsWith(
    shipSave(ctx, { seed: "abc", type: "battleship" }),
    "INVALID_SHIP_TYPE",
  );
  await rejectsWith(
    shipSave(ctx, { seed: "abc", type: "fighter" }),
    "SHIP_TYPE_NOT_OWNED",
  );
});

test("members claim included hulls; non-members need checkout", async () => {
  const bob = makeCtx(db, BOB);
  assert.deepEqual(await shipClaim(bob, { type: "fighter" }), {
    alreadyOwned: false,
    granted: false,
    checkoutRequired: true,
  });
  assert.equal(db.rows("shipUnlocks").length, 0);

  await member();
  const alice = makeCtx(db, ALICE);
  assert.equal((await shipClaim(alice, { type: "fighter" })).granted, true);
  assert.equal((await shipClaim(alice, { type: "fighter" })).alreadyOwned, true);
  await shipClaim(alice, { type: "hauler" });
  await shipClaim(alice, { type: "interceptor" });
  const state = await shipGet(alice);
  assert.deepEqual(state.ownedTypes, ["scout", "fighter", "hauler", "interceptor"]);
  assert.equal(state.freeSlotsRemaining, 0);
  const saved = await shipSave(alice, { seed: "abc", type: "hauler" });
  assert.equal(saved.shipType, "hauler");
  await rejectsWith(shipClaim(alice, { type: "x".repeat(64) }), "INVALID_SHIP_TYPE");
});

test("gated functions answer NOT_FOUND when their release flag is off", async () => {
  process.env.RELEASE_CHANNEL = "public";
  await rejectsWith(shipClaim(makeCtx(db, ALICE), { type: "fighter" }), "NOT_FOUND");
  await rejectsWith(mineHandler(makeCtx(db, ALICE)), "NOT_FOUND");
  await rejectsWith(ensureCodeHandler(makeCtx(db, ALICE)), "NOT_FOUND");
  await rejectsWith(referralClaim(makeCtx(db, ALICE), { code: "abcd" }), "NOT_FOUND");
});

test("referral codes are allocated once and are unique", async () => {
  const alice = makeCtx(db, ALICE);
  assert.equal((await mineHandler(alice)).code, null);
  let calls = 0;
  // First draw collides with Bob's code, second is fresh.
  await db.insert("users", { exoSubject: BOB.subject, hasPaid: false, referralCode: "AAAAAAAA" });
  const rand = (bytes: Uint8Array) => bytes.fill(calls++ === 0 ? 0 : 1);
  const first = await ensureCodeHandler(alice, rand);
  assert.equal(first.code, "BBBBBBBB");
  assert.equal((await ensureCodeHandler(alice)).code, "BBBBBBBB");
  assert.equal((await mineHandler(alice)).code, "BBBBBBBB");
});

test("referral attribution: new accounts only, once, never self", async () => {
  const bob = makeCtx(db, BOB);
  const bobCode = (await ensureCodeHandler(bob)).code;
  const alice = makeCtx(db, ALICE);

  // Self-referral and unknown codes are ignored without errors.
  const aliceCode = (await ensureCodeHandler(alice)).code;
  await referralClaim(alice, { code: aliceCode });
  await referralClaim(alice, { code: "zzzzzzzz" });
  assert.equal(db.rows("users").find((u) => u.exoSubject === ALICE.subject)?.referredBy, undefined);

  const now = db.clock + 10;
  await referralClaim(alice, { code: bobCode }, now);
  const row = db.rows("users").find((u) => u.exoSubject === ALICE.subject);
  assert.equal(row?.referredBy, BOB.subject);
  assert.equal(row?.referredAt, now);
  assert.equal((await mineHandler(bob)).referredCount, 1);

  // Set once: a later claim with another code never moves it.
  const carol = identity("exo|carol");
  const carolCode = (await ensureCodeHandler(makeCtx(db, carol))).code;
  await referralClaim(alice, { code: carolCode }, now + 1);
  assert.equal(db.rows("users").find((u) => u.exoSubject === ALICE.subject)?.referredBy, BOB.subject);
});

test("referral attribution skips accounts older than the sign-up window", async () => {
  const bobCode = (await ensureCodeHandler(makeCtx(db, BOB))).code;
  const alice = makeCtx(db, ALICE);
  await ensureCodeHandler(alice);
  const created = db.rows("users").find((u) => u.exoSubject === ALICE.subject)!._creationTime;
  await referralClaim(alice, { code: bobCode }, created + SIGNUP_ATTRIBUTION_WINDOW_MS + 1);
  assert.equal(db.rows("users").find((u) => u.exoSubject === ALICE.subject)?.referredBy, undefined);
  await rejectsWith(referralClaim(alice, { code: "x".repeat(100) }), "INVALID_REFERRAL_CODE");
});

test("input sanitizers match the Express rules", () => {
  assert.equal(sanitizeAuthorId(" A5012345 "), "A5012345");
  assert.equal(sanitizeAuthorId("A1?x"), null);
  assert.equal(sanitizeSeed("x".repeat(300)), "");
  assert.equal(sanitizeSeed("Hello, World!"), "HelloWorld");
});
