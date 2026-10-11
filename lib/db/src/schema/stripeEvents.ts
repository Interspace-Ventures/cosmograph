import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Every Stripe webhook event we have applied, keyed by Stripe's event id.
// Stripe delivers at-least-once (retries, replays, duplicate endpoints), so the
// webhook inserts here first and skips the event if the row already exists.
export const stripeEventsTable = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at").notNull().defaultNow(),
});
