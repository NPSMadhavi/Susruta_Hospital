import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { onlineAppointmentsTable } from "./online_appointments";

export const prescriptionsTable = pgTable("prescriptions", {
  id: serial("id").primaryKey(),
  onlineAppointmentId: integer("online_appointment_id")
    .notNull()
    .unique()
    .references(() => onlineAppointmentsTable.id, { onDelete: "cascade" }),
  // Photo-based prescription (object storage path)
  photoObjectPath: text("photo_object_path"),
  // Optional notes visible to patient
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Prescription = typeof prescriptionsTable.$inferSelect;
