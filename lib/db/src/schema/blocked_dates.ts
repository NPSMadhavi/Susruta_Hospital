import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const blockedDatesTable = pgTable("blocked_dates", {
  id: serial("id").primaryKey(),
  date: varchar("date", { length: 10 }).notNull().unique(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBlockedDateSchema = createInsertSchema(blockedDatesTable).omit({ id: true, createdAt: true });
export type InsertBlockedDate = z.infer<typeof insertBlockedDateSchema>;
export type BlockedDate = typeof blockedDatesTable.$inferSelect;
