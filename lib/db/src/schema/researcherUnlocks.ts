import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Per-account record of which researchers (OpenAlex authors) a member has
// unlocked. The capped membership model includes a fixed number of unlocks in
// the base price (see INCLUDED_UNLOCK_SLOTS in api-server billing); each
// additional unlocked researcher is billed as a recurring add-on. This table is
// the server-authoritative source of truth for the cap — the browser can never
// grant itself a slot. One row per (user, author); the composite primary key
// makes unlocking idempotent.
export const researcherUnlocksTable = pgTable(
  "researcher_unlocks",
  {
    userId: text("user_id").notNull(),
    authorId: text("author_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.authorId] })],
);

export const insertResearcherUnlockSchema = createInsertSchema(
  researcherUnlocksTable,
).omit({
  createdAt: true,
});
export type InsertResearcherUnlock = z.infer<
  typeof insertResearcherUnlockSchema
>;
export type ResearcherUnlock = typeof researcherUnlocksTable.$inferSelect;
