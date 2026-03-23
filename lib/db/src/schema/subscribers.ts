import { pgTable, serial, varchar, timestamp } from "drizzle-orm/pg-core";

export const subscribersTable = pgTable("subscribers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  country: varchar("country", { length: 100 }),
  subscribedAt: timestamp("subscribed_at").notNull().defaultNow(),
});

export type Subscriber = typeof subscribersTable.$inferSelect;
export type InsertSubscriber = typeof subscribersTable.$inferInsert;
