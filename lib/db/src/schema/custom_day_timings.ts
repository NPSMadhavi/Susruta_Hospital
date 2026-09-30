import { pgTable, serial, text, timestamp, varchar, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customDayTimingsTable = pgTable("custom_day_timings", {
  id: serial("id").primaryKey(),
  date: varchar("date", { length: 10 }).notNull().unique(), // YYYY-MM-DD
  morningEnabled: boolean("morning_enabled").notNull().default(true),
  morningStart: varchar("morning_start", { length: 10 }).notNull().default("10:00 AM"),
  morningEnd: varchar("morning_end", { length: 10 }).notNull().default("01:00 PM"),
  eveningEnabled: boolean("evening_enabled").notNull().default(true),
  eveningStart: varchar("evening_start", { length: 10 }).notNull().default("06:00 PM"),
  eveningEnd: varchar("evening_end", { length: 10 }).notNull().default("10:00 PM"),
  slotIntervalMinutes: integer("slot_interval_minutes").notNull().default(30),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCustomDayTimingSchema = createInsertSchema(customDayTimingsTable).omit({ id: true, createdAt: true });
export type InsertCustomDayTiming = z.infer<typeof insertCustomDayTimingSchema>;
export type CustomDayTiming = typeof customDayTimingsTable.$inferSelect;
