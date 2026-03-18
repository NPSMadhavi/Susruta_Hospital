import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appointmentsTable = pgTable("appointments", {
  id: serial("id").primaryKey(),
  patientName: varchar("patient_name", { length: 255 }).notNull(),
  patientPhone: varchar("patient_phone", { length: 20 }).notNull(),
  patientEmail: varchar("patient_email", { length: 255 }),
  date: varchar("date", { length: 10 }).notNull(),
  timeSlot: varchar("time_slot", { length: 20 }).notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAppointmentSchema = createInsertSchema(appointmentsTable).omit({ id: true, createdAt: true });
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointmentsTable.$inferSelect;
