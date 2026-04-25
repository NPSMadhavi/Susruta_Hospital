import { pgTable, serial, integer, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";

export const patientDocumentsTable = pgTable("patient_documents", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  objectPath: text("object_path").notNull(),
  contentType: varchar("content_type", { length: 100 }).notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PatientDocument = typeof patientDocumentsTable.$inferSelect;
export type InsertPatientDocument = typeof patientDocumentsTable.$inferInsert;
