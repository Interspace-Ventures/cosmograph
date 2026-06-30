import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Application user record, keyed by the Clerk user id. This is the only
// app-owned table for accounts + entitlement; everything Stripe-owned
// (customers, prices, checkout sessions, payments) lives in the `stripe`
// schema that stripe-replit-sync manages — we never duplicate it here.
//
// `hasPaid` is the cached "active member" flag — true while the yearly
// membership subscription is live, set after a checkout session is verified
// against Stripe and cleared when the subscription lapses (see the billing
// routes). Which specific researchers a member has unlocked lives in the
// separate `researcher_unlocks` table. `stripeCustomerId` ties this account to
// its Stripe customer so repeat checkouts reuse one customer.
export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  stripeCustomerId: text("stripe_customer_id"),
  hasPaid: boolean("has_paid").notNull().default(false),
  // The account's saved cosmonaut-ship seed. The ship look is derived
  // deterministically from this short seed (see shipLook.ts); persisting it lets
  // a member's chosen ship follow them across devices and be broadcast to other
  // cosmonauts in real time. Null until the account saves one.
  shipSeed: text("ship_seed"),
  // The account's equipped cosmonaut-ship TYPE id (e.g. "scout", "fighter").
  // The default free "scout" is assumed when null. Premium types must be owned
  // (recorded in ship_unlocks) before they can be equipped here; the server
  // enforces that on save, so this column can never reference an unowned type.
  shipType: text("ship_type"),
  // Referrals: every account gets a stable short code used as `?ref=<code>`.
  // When a brand-new account signs up through someone's link, `referredBy` is
  // set once (permanently) to that referrer's account id, and `referredAt`
  // records when. A signup is the unit we count — see the api-server referral
  // lib, which only attributes genuinely new (recently created) accounts.
  referralCode: text("referral_code").unique(),
  referredBy: text("referred_by"),
  referredAt: timestamp("referred_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
