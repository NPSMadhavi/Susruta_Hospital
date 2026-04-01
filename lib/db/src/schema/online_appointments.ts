import { pgTable, serial, integer, text, timestamp, json, varchar } from "drizzle-orm/pg-core";
import { onlineSlotsTable } from "./online_slots";
import { patientsTable } from "./patients";

export type DocumentFile = { name: string; objectPath: string; contentType: string; size: number };

export const onlineAppointmentsTable = pgTable("online_appointments", {
  id: serial("id").primaryKey(),
  slotId: integer("slot_id").notNull().references(() => onlineSlotsTable.id),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id),
  reason: text("reason"),
  // Array of { name, objectPath, contentType, size }
  documents: json("documents").$type<DocumentFile[]>().notNull().default([]),
  // pending | confirmed | completed | cancelled
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type OnlineAppointment = typeof onlineAppointmentsTable.$inferSelect;
