import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

// Account-saved cosmonaut ship. We persist only a short seed; the actual ship
// look is derived deterministically from it on the client (see shipLook.ts),
// so there's nothing sensitive here and no need to store colors/scale.

// Thrown when the submitted seed sanitizes to nothing — the route maps this to
// 400.
export class InvalidSeedError extends Error {
  constructor() {
    super("A valid ship seed is required.");
    this.name = "InvalidSeedError";
  }
}

export interface ShipResult {
  shipSeed: string | null;
}

// Keep only a short alphanumeric token. This bounds what gets broadcast over
// the presence wire and stored, and rejects anything that isn't a plausible
// seed.
function sanitizeSeed(seed: string): string {
  return seed.trim().replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
}

export async function getShip(userId: string): Promise<ShipResult> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return { shipSeed: user?.shipSeed ?? null };
}

export async function saveShip(
  userId: string,
  rawSeed: string,
): Promise<ShipResult> {
  const seed = sanitizeSeed(rawSeed);
  if (!seed) throw new InvalidSeedError();
  // Upsert: a row may not exist yet for a brand-new account that saves a ship
  // before ever touching billing.
  await db
    .insert(usersTable)
    .values({ id: userId, shipSeed: seed })
    .onConflictDoUpdate({ target: usersTable.id, set: { shipSeed: seed } });
  return { shipSeed: seed };
}
