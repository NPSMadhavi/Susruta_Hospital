import { pgTable, serial, integer, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";

export const medicineOrdersTable = pgTable("medicine_orders", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id),
  appointmentId: integer("appointment_id"),
  appointmentType: varchar("appointment_type", { length: 10 }).notNull().default("online"),
  // Status flow:
  // submitted → payment_requested → payment_done → payment_confirmed → shipped
  // submitted → partial_approval_needed → payment_requested → ...
  status: varchar("status", { length: 50 }).notNull().default("submitted"),
  deliveryAddress: text("delivery_address").notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  trackingNumber: varchar("tracking_number", { length: 255 }),
  pharmacistNotes: text("pharmacist_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MedicineOrder = typeof medicineOrdersTable.$inferSelect;
