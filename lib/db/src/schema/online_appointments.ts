import { pgTable, serial, integer, text, timestamp, json, varchar, boolean } from "drizzle-orm/pg-core";
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
  meetingLink: text("meeting_link"),
  // pending | confirmed | completed | cancelled
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  // Join meeting control — admin enables when doctor is ready
  joinEnabled: boolean("join_enabled").notNull().default(false),
  joinEnabledAt: timestamp("join_enabled_at"),
  // Set when patient clicks "Join" — confirms they entered the call
  patientJoinedAt: timestamp("patient_joined_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type OnlineAppointment = typeof onlineAppointmentsTable.$inferSelect;
