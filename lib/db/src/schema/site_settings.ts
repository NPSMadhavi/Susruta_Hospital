import { pgTable, serial, text, boolean, timestamp, varchar, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const siteSettingsTable = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  testimonialsEnabled: boolean("testimonials_enabled").notNull().default(true),
  appointmentBookingEnabled: boolean("appointment_booking_enabled").notNull().default(true),
  clinicPhone1: varchar("clinic_phone1", { length: 20 }).notNull().default("9492068180"),
  clinicPhone2: varchar("clinic_phone2", { length: 20 }),
  clinicEmail: varchar("clinic_email", { length: 255 }),
  clinicAddress: text("clinic_address").notNull().default("119, Ramulavari North Mada Street, Tirupati - 517 507"),
  workingHours: varchar("working_hours", { length: 255 }),
  // SMTP Settings
  smtpHost: varchar("smtp_host", { length: 255 }),
  smtpPort: integer("smtp_port").default(587),
  smtpUser: varchar("smtp_user", { length: 255 }),
  smtpPass: varchar("smtp_pass", { length: 255 }),
  smtpSecure: boolean("smtp_secure").notNull().default(false),
  smtpFromName: varchar("smtp_from_name", { length: 255 }).notNull().default("Susruta Hospital"),
  smtpFromEmail: varchar("smtp_from_email", { length: 255 }).notNull().default("noreply@susrutahospital.com"),
  smtpSubscriberFrom: varchar("smtp_subscriber_from", { length: 255 }).notNull().default("updates@susrutahospital.com"),
  // Doctor portal password (hashed with bcrypt)
  doctorPasswordHash: varchar("doctor_password_hash", { length: 255 }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSiteSettingsSchema = createInsertSchema(siteSettingsTable).omit({ id: true, updatedAt: true });
export type InsertSiteSettings = z.infer<typeof insertSiteSettingsSchema>;
export type SiteSettings = typeof siteSettingsTable.$inferSelect;
