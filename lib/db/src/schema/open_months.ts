import { pgTable, serial, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const openMonthsTable = pgTable("open_months", {
  id: serial("id").primaryKey(),
  month: varchar("month", { length: 7 }).notNull().unique(),
  isOpen: boolean("is_open").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOpenMonthSchema = createInsertSchema(openMonthsTable).omit({ id: true, createdAt: true });
export type InsertOpenMonth = z.infer<typeof insertOpenMonthSchema>;
export type OpenMonth = typeof openMonthsTable.$inferSelect;
