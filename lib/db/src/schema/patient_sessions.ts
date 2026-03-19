import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";

export const patientSessionsTable = pgTable("patient_sessions", {
  id: serial("id").primaryKey(),
  sessionToken: text("session_token").notNull().unique(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export type PatientSession = typeof patientSessionsTable.$inferSelect;
