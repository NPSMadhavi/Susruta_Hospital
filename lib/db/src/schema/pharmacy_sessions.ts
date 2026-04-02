import { pgTable, serial, varchar, timestamp } from "drizzle-orm/pg-core";

export const pharmacySessionsTable = pgTable("pharmacy_sessions", {
  id: serial("id").primaryKey(),
  sessionToken: varchar("session_token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PharmacySession = typeof pharmacySessionsTable.$inferSelect;
