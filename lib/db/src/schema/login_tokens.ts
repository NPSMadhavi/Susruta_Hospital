import { pgTable, serial, varchar, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const loginTokensTable = pgTable("login_tokens", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  patientId: integer("patient_id").notNull(),
  nextUrl: varchar("next_url", { length: 500 }).default("/portal/dashboard"),
  // Verification tokens are bound to the address they were issued for so an
  // old link cannot verify an address changed by an administrator.
  verificationEmail: varchar("verification_email", { length: 255 }),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type LoginToken = typeof loginTokensTable.$inferSelect;
