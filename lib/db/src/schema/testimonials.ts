import { pgTable, serial, text, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const testimonialsTable = pgTable("testimonials", {
  id: serial("id").primaryKey(),
  patientName: varchar("patient_name", { length: 255 }).notNull(),
  patientLocation: varchar("patient_location", { length: 255 }),
  content: text("content").notNull(),
  contentTe: text("content_te"),
  rating: integer("rating").notNull().default(5),
  isPublished: boolean("is_published").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTestimonialSchema = createInsertSchema(testimonialsTable).omit({ id: true, createdAt: true });
export type InsertTestimonial = z.infer<typeof insertTestimonialSchema>;
export type Testimonial = typeof testimonialsTable.$inferSelect;
