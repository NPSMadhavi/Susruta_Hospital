import { pgTable, serial, varchar, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const patientOtpsTable = pgTable("patient_otps", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull(),
  type: varchar("type", { length: 32 }).notNull(), // 'email_change' | 'phone_change'
  targetValue: varchar("target_value", { length: 255 }).notNull(),
  otpHash: varchar("otp_hash", { length: 255 }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at").notNull(),
  resendAfter: timestamp("resend_after").notNull(),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PatientOtp = typeof patientOtpsTable.$inferSelect;
export type InsertPatientOtp = typeof patientOtpsTable.$inferInsert;
