import { pgTable, serial, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";
import { appointmentsTable } from "./appointments";

export const offlineQrTokensTable = pgTable("offline_qr_tokens", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  appointmentId: integer("appointment_id").notNull().references(() => appointmentsTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OfflineQrToken = typeof offlineQrTokensTable.$inferSelect;
export type InsertOfflineQrToken = typeof offlineQrTokensTable.$inferInsert;
