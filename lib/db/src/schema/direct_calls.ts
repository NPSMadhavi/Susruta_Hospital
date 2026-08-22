import { pgTable, serial, integer, timestamp, varchar } from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";

// A direct call is deliberately separate from online appointments. It is a
// short-lived staff-initiated room and must never create a fake appointment.
export const directCallsTable = pgTable("direct_calls", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  roomName: varchar("room_name", { length: 255 }).notNull().unique(),
  // active | ended
  status: varchar("status", { length: 20 }).notNull().default("active"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  patientJoinedAt: timestamp("patient_joined_at"),
  endedAt: timestamp("ended_at"),
});

export type DirectCall = typeof directCallsTable.$inferSelect;