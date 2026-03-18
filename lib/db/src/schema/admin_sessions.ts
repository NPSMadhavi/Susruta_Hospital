import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const adminSessionsTable = pgTable("admin_sessions", {
  id: serial("id").primaryKey(),
  sessionToken: text("session_token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export type AdminSession = typeof adminSessionsTable.$inferSelect;
