import { eq, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import type { ExoIdentity } from "../middlewares/exoIdentity";

// Cosmograph's account row is keyed by the Exo subject (users.exo_subject).
// requireAuth records the account the first time this process sees a verified
// identity, so `created_at` approximates when the account first used Cosmograph
// (the referral freshness check relies on it) and `email` carries the verified
// Exo email used for Stripe receipts. No Exo API call, no secret: everything
// comes from the verified access-token claims.
const recorded = new Map<string, string | null>();
const RECORDED_LIMIT = 10_000;

export async function recordAccount(identity: ExoIdentity): Promise<void> {
  const email = identity.emailVerified ? identity.email : null;
  if (recorded.has(identity.subject) && recorded.get(identity.subject) === email) return;

  await db
    .insert(usersTable)
    .values({ exoSubject: identity.subject, email })
    .onConflictDoUpdate({
      target: usersTable.exoSubject,
      // Only fill or refresh the email from a verified claim; never blank it.
      set: { email: sql`coalesce(excluded.email, ${usersTable.email})` },
    });

  if (recorded.size >= RECORDED_LIMIT) recorded.clear();
  recorded.set(identity.subject, email);
}

/** The account's verified email (for Stripe), or null. */
export async function accountEmail(subject: string): Promise<string | null> {
  const [row] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.exoSubject, subject));
  return row?.email ?? null;
}
