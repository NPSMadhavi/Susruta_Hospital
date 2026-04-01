import { pgTable, serial, varchar, timestamp } from "drizzle-orm/pg-core";

export const doctorSessionsTable = pgTable("doctor_sessions", {
  id: serial("id").primaryKey(),
  sessionToken: varchar("session_token", { length: 128 }).notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export type DoctorSession = typeof doctorSessionsTable.$inferSelect;
