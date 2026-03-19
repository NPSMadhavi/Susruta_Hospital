import { boolean, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { patientsTable } from "./patients";

export const appointmentsTable = pgTable("appointments", {
  id: serial("id").primaryKey(),
  patientName: varchar("patient_name", { length: 255 }).notNull(),
  patientPhone: varchar("patient_phone", { length: 20 }).notNull(),
  patientEmail: varchar("patient_email", { length: 255 }),
  patientId: integer("patient_id").references(() => patientsTable.id, { onDelete: "set null" }),
  date: varchar("date", { length: 10 }).notNull(),
  timeSlot: varchar("time_slot", { length: 20 }).notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  notes: text("notes"),
  // Arrival + payment
  arrivedAt: timestamp("arrived_at"),
  paymentStatus: varchar("payment_status", { length: 20 }).notNull().default("unpaid"),
  paymentMode: varchar("payment_mode", { length: 10 }),
  // Reschedule flow
  rescheduleDates: text("reschedule_dates"),
  rescheduleChosen: varchar("reschedule_chosen", { length: 10 }),
  // Follow-up
  followUpDate: varchar("follow_up_date", { length: 10 }),
  followUpConfirmed: boolean("follow_up_confirmed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAppointmentSchema = createInsertSchema(appointmentsTable).omit({ id: true, createdAt: true });
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointmentsTable.$inferSelect;
