import { pgTable, serial, text, timestamp, varchar, boolean, integer } from "drizzle-orm/pg-core";

export const patientsTable = pgTable("patients", {
  id: serial("id").primaryKey(),
  patientCode: varchar("patient_code", { length: 20 }).unique(),
  email: varchar("email", { length: 255 }).unique(),
  googleId: varchar("google_id", { length: 255 }).unique(),
  name: varchar("name", { length: 255 }).notNull(),
  age: integer("age"),
  gender: varchar("gender", { length: 20 }),
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  avatarUrl: text("avatar_url"),
  passwordHash: text("password_hash"),
  emailVerified: boolean("email_verified").notNull().default(false),
  verificationReminderSentAt: timestamp("verification_reminder_sent_at"),
  verificationReminderCount: integer("verification_reminder_count").notNull().default(0),
  verificationReminderLastAttemptAt: timestamp("verification_reminder_last_attempt_at"),
  verificationReminderClaimedAt: timestamp("verification_reminder_claimed_at"),
  verificationReminderClaimId: varchar("verification_reminder_claim_id", { length: 64 }),
  verificationReminderPendingAt: timestamp("verification_reminder_pending_at"),
  verificationReminderPendingTokenId: integer("verification_reminder_pending_token_id"),
  verificationReminderDispatchStartedAt: timestamp("verification_reminder_dispatch_started_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Patient = typeof patientsTable.$inferSelect;
export type InsertPatient = typeof patientsTable.$inferInsert;
