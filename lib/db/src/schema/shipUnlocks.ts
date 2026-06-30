import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Per-account record of which cosmonaut-ship cosmetics an account owns. The
// default "scout" ship type is free for everyone and is never stored here; this
// table only records *premium* SKUs the account has claimed or purchased.
//
// SKU shape is namespaced so future cosmetic kinds slot in without a schema
// change: `type:<id>` for a ship TYPE (e.g. `type:fighter`), and a future
// `color:<pack>` for premium color packs. The server is the authoritative
// source of truth for ownership — the browser can never grant itself a SKU.
// One row per (user, sku); the composite primary key makes claiming idempotent.
export const shipUnlocksTable = pgTable(
  "ship_unlocks",
  {
    userId: text("user_id").notNull(),
    sku: text("sku").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.sku] })],
);

export const insertShipUnlockSchema = createInsertSchema(shipUnlocksTable).omit({
  createdAt: true,
});
export type InsertShipUnlock = z.infer<typeof insertShipUnlockSchema>;
export type ShipUnlock = typeof shipUnlocksTable.$inferSelect;
