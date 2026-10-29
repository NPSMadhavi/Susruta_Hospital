import { pgTable, serial, varchar, timestamp, index } from "drizzle-orm/pg-core";

export const websiteVisitorsTable = pgTable(
  "website_visitors",
  {
    id: serial("id").primaryKey(),
    visitorId: varchar("visitor_id", { length: 128 }).notNull().unique(),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
    lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }),
    lastPage: varchar("last_page", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_website_visitors_last_seen").on(table.lastSeen),
    index("idx_website_visitors_last_heartbeat").on(table.lastHeartbeat),
  ]
);

export type WebsiteVisitor = typeof websiteVisitorsTable.$inferSelect;
export type InsertWebsiteVisitor = typeof websiteVisitorsTable.$inferInsert;
