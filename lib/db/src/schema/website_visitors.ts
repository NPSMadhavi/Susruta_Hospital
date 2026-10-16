import { pgTable, serial, varchar, timestamp, index } from "drizzle-orm/pg-core";

export const websiteVisitorsTable = pgTable(
  "website_visitors",
  {
    id: serial("id").primaryKey(),
    visitorId: varchar("visitor_id", { length: 128 }).notNull().unique(),
    firstSeen: timestamp("first_seen").notNull().defaultNow(),
    lastSeen: timestamp("last_seen").notNull().defaultNow(),
    lastPage: varchar("last_page", { length: 500 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_website_visitors_last_seen").on(table.lastSeen),
    index("idx_website_visitors_visitor_id").on(table.visitorId),
  ]
);

export type WebsiteVisitor = typeof websiteVisitorsTable.$inferSelect;
export type InsertWebsiteVisitor = typeof websiteVisitorsTable.$inferInsert;
