import { pgTable, serial, integer, text, json, timestamp } from "drizzle-orm/pg-core";
import { onlineAppointmentsTable } from "./online_appointments";

export type MedicineRow = { medicine: string; instructions: string };

export const prescriptionsTable = pgTable("prescriptions", {
  id: serial("id").primaryKey(),
  onlineAppointmentId: integer("online_appointment_id")
    .notNull()
    .unique()
    .references(() => onlineAppointmentsTable.id, { onDelete: "cascade" }),
  medicines: json("medicines").$type<MedicineRow[]>().notNull().default([]),
  // Doctor's private notes — NOT shown to patient
  doctorNotes: text("doctor_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Prescription = typeof prescriptionsTable.$inferSelect;
