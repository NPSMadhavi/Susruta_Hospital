import { pgTable, serial, integer, varchar, boolean, timestamp, text } from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";
import { onlineAppointmentsTable } from "./online_appointments";

export const donationsTable = pgTable("donations", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  appointmentId: integer("appointment_id").references(() => onlineAppointmentsTable.id, { onDelete: "set null" }),
  patientCode: varchar("patient_code", { length: 10 }),
  patientName: varchar("patient_name", { length: 255 }),
  patientEmail: varchar("patient_email", { length: 255 }),
  amount: varchar("amount", { length: 20 }).notNull(),
  lastSixDigits: varchar("last_six_digits", { length: 6 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  thankYouSent: boolean("thank_you_sent").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Donation = typeof donationsTable.$inferSelect;
export type InsertDonation = typeof donationsTable.$inferInsert;
