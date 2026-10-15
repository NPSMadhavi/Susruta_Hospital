import { pgTable, serial, varchar, timestamp, boolean, text, integer } from "drizzle-orm/pg-core";

export const subscribersTable = pgTable("subscribers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  country: varchar("country", { length: 100 }),
  subscribedAt: timestamp("subscribed_at").notNull().defaultNow(),
  // Soft unsubscribe — row kept for audit/suppression, excluded from sends
  unsubscribed: boolean("unsubscribed").notNull().default(false),
  unsubscribedAt: timestamp("unsubscribed_at"),
  unsubscribeReason: text("unsubscribe_reason"),
  deleteColumn: integer("delete_column").notNull().default(0),
});

export type Subscriber = typeof subscribersTable.$inferSelect;
export type InsertSubscriber = typeof subscribersTable.$inferInsert;
