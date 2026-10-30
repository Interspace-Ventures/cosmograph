import { v } from "convex/values";
import {
  mutation,
  query,
  type Doc,
  type MutationCtx,
  type QueryCtx,
} from "./lib/server";
import { requireIdentity } from "./lib/exoKey";
import { requireFeature } from "./lib/features";
import {
  MAX_REFERRAL_ARG,
  badRequest,
  findOrCreateUser,
  userBySubject,
} from "./lib/account";

/**
 * Referral links, ported from GET /me/referral and POST /me/referral/claim
 * (artifacts/api-server/src/lib/referral.ts). Every account gets a stable
 * short `?ref=` code; a referral counts only when a NEW account arrives through
 * someone's link, and `referredBy` is set once, permanently. Gated by the
 * `referrals` release flag like the Express routes.
 *
 * Express judged "new" by the Clerk account's age. Exo tokens carry no account
 * creation time, so the window is measured from this Cosmograph account row's
 * `_creationTime` (created by users.ensure right after the first sign-in).
 */

export const SIGNUP_ATTRIBUTION_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Unambiguous alphabet (no 0/O/1/I/l). */
export const CODE_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export const CODE_LENGTH = 8;
const CODE_PATTERN = /^[A-Za-z0-9]{4,16}$/;
/** Ceiling on the referred-count scan; far above any real tally. */
const MAX_COUNTED_REFERRALS = 10_000;

type Random = (bytes: Uint8Array) => Uint8Array;

export const referralView = v.object({
  code: v.string(),
  referredCount: v.number(),
});

export const referralMineView = v.object({
  code: v.union(v.string(), v.null()),
  referredCount: v.number(),
});

export function randomCode(
  random: Random = (bytes) => crypto.getRandomValues(bytes),
): string {
  const bytes = random(new Uint8Array(CODE_LENGTH));
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

async function countReferred(
  ctx: Pick<QueryCtx, "db">,
  exoSubject: string,
): Promise<number> {
  const rows = await ctx.db
    .query("users")
    .withIndex("by_referredBy", (q) => q.eq("referredBy", exoSubject))
    .take(MAX_COUNTED_REFERRALS);
  return rows.length;
}

/**
 * Guarantee the account has a referral code. Uniqueness that Postgres enforced
 * with a UNIQUE column is checked through by_referralCode inside this
 * serializable mutation.
 */
async function ensureCode(
  ctx: Pick<MutationCtx, "db">,
  user: Doc<"users">,
  random?: Random,
): Promise<string> {
  if (user.referralCode) return user.referralCode;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode(random);
    const taken = await ctx.db
      .query("users")
      .withIndex("by_referralCode", (q) => q.eq("referralCode", code))
      .first();
    if (taken) continue;
    await ctx.db.patch(user._id, { referralCode: code });
    return code;
  }
  throw new Error("could not allocate a unique referral code");
}

export async function mineHandler(
  ctx: Pick<QueryCtx, "auth" | "db">,
): Promise<{ code: string | null; referredCount: number }> {
  requireFeature("referrals");
  const identity = await requireIdentity(ctx);
  const user = await userBySubject(ctx, identity.subject);
  return {
    code: user?.referralCode ?? null,
    referredCount: await countReferred(ctx, identity.subject),
  };
}

export async function ensureCodeHandler(
  ctx: Pick<MutationCtx, "auth" | "db">,
  random?: Random,
): Promise<{ code: string; referredCount: number }> {
  requireFeature("referrals");
  const identity = await requireIdentity(ctx);
  const user = await findOrCreateUser(ctx, identity);
  return {
    code: await ensureCode(ctx, user, random),
    referredCount: await countReferred(ctx, identity.subject),
  };
}

export async function claimHandler(
  ctx: Pick<MutationCtx, "auth" | "db">,
  args: { code: string },
  now: number = Date.now(),
  random?: Random,
): Promise<{ code: string; referredCount: number }> {
  requireFeature("referrals");
  const identity = await requireIdentity(ctx);
  if (args.code.length > MAX_REFERRAL_ARG) {
    throw badRequest("INVALID_REFERRAL_CODE", "A referral code is required.");
  }
  const me = await findOrCreateUser(ctx, identity);
  const myCode = await ensureCode(ctx, me, random);
  const trimmed = args.code.trim();

  const eligible =
    !me.referredBy &&
    CODE_PATTERN.test(trimmed) &&
    trimmed !== myCode &&
    now - me._creationTime <= SIGNUP_ATTRIBUTION_WINDOW_MS;
  if (eligible) {
    const referrer = await ctx.db
      .query("users")
      .withIndex("by_referralCode", (q) => q.eq("referralCode", trimmed))
      .first();
    if (referrer && referrer.exoSubject !== identity.subject) {
      await ctx.db.patch(me._id, {
        referredBy: referrer.exoSubject,
        referredAt: now,
      });
    }
  }

  return {
    code: myCode,
    referredCount: await countReferred(ctx, identity.subject),
  };
}

/**
 * The account's referral code (null until allocated) and how many accounts
 * signed up through it. Read-only; the SPA calls `ensure` when it's null.
 */
export const mine = query({
  args: {},
  returns: referralMineView,
  handler: (ctx) => mineHandler(ctx),
});

/** Allocate the account's referral code on first use (GET /me/referral). */
export const ensure = mutation({
  args: {},
  returns: referralView,
  handler: (ctx) => ensureCodeHandler(ctx),
});

/**
 * Port of POST /me/referral/claim: best-effort, new-account-only attribution.
 * Never errors on an ineligible claim; returns the caller's own referral info.
 */
export const claim = mutation({
  args: { code: v.string() },
  returns: referralView,
  handler: (ctx, args) => claimHandler(ctx, args),
});
