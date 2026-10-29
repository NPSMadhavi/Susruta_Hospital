import { pgTable, varchar, date, timestamp, primaryKey, index } from "drizzle-orm/pg-core";

export const visitorDaysTable = pgTable(
  "visitor_days",
  {
    visitorId: varchar("visitor_id", { length: 128 }).notNull(),
    dayIst: date("day_ist").notNull(),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.visitorId, table.dayIst] }),
    index("idx_visitor_days_day_ist").on(table.dayIst),
  ]
);

export type VisitorDay = typeof visitorDaysTable.$inferSelect;
export type InsertVisitorDay = typeof visitorDaysTable.$inferInsert;
