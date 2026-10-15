import { pgTable, serial, varchar, text, timestamp, integer } from "drizzle-orm/pg-core";

export const medicinesTable = pgTable("medicines", {
  id: serial("id").primaryKey(),
  medicineId: varchar("medicine_id", { length: 50 }).notNull().unique(),
  medicineName: varchar("medicine_name", { length: 255 }).notNull(),
  dosage: text("dosage"),
  frequency: varchar("frequency", { length: 100 }),
  formulation: varchar("formulation", { length: 100 }),
  properties: text("properties"),
  indications: text("indications"),
  deleteColumn: integer("delete_column").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Medicine = typeof medicinesTable.$inferSelect;
export type InsertMedicine = typeof medicinesTable.$inferInsert;
