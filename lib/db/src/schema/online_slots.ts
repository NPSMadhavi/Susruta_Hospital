import { pgTable, serial, varchar, timestamp, integer, boolean, date } from "drizzle-orm/pg-core";

// Admin creates a "session" for a date with a time range + interval.
// Individual slots are derived from these parameters.
export const onlineSlotSessionsTable = pgTable("online_slot_sessions", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(), // "HH:MM"
  endTime: varchar("end_time", { length: 5 }).notNull(),     // "HH:MM"
  intervalMinutes: integer("interval_minutes").notNull(),     // 15 or 30
  maxBookings: integer("max_bookings"),                       // auto-computed but stored
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Each individual slot slot derived from a session
export const onlineSlotsTable = pgTable("online_slots", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => onlineSlotSessionsTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(), // "HH:MM"
  endTime: varchar("end_time", { length: 5 }).notNull(),     // "HH:MM"
  isBooked: boolean("is_booked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type OnlineSlotSession = typeof onlineSlotSessionsTable.$inferSelect;
export type OnlineSlot = typeof onlineSlotsTable.$inferSelect;
