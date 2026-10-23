import { pgTable, serial, integer, varchar, timestamp, text, boolean } from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";

export const accountDeletionRequestsTable = pgTable("account_deletion_requests", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").references(() => patientsTable.id, { onDelete: "set null" }),
  patientCode: varchar("patient_code", { length: 20 }),
  patientName: varchar("patient_name", { length: 255 }).notNull(),
  patientEmail: varchar("patient_email", { length: 255 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("PENDING"),
  reason: text("reason"),
  cancellationDeadline: timestamp("cancellation_deadline", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  processedBy: varchar("processed_by", { length: 100 }),
  notes: text("notes"),
  isSeen: boolean("is_seen").notNull().default(false),
  seenAt: timestamp("seen_at", { withTimezone: true }),
  deleteColumn: integer("delete_column").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AccountDeletionRequest = typeof accountDeletionRequestsTable.$inferSelect;
export type InsertAccountDeletionRequest = typeof accountDeletionRequestsTable.$inferInsert;
