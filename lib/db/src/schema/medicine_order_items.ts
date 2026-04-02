import { pgTable, serial, integer, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
import { medicineOrdersTable } from "./medicine_orders";

export const medicineOrderItemsTable = pgTable("medicine_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => medicineOrdersTable.id),
  medicineName: varchar("medicine_name", { length: 255 }).notNull(),
  instructions: varchar("instructions", { length: 500 }),
  qty: integer("qty").notNull().default(1),
  // null = not yet reviewed, true = available, false = not available
  available: boolean("available"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MedicineOrderItem = typeof medicineOrderItemsTable.$inferSelect;
