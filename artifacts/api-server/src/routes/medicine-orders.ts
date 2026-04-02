import { Router } from "express";
import { db, medicineOrdersTable, medicineOrderItemsTable, patientsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { requirePatient } from "../lib/patient-auth";
import { notifyPharmacySse } from "./pharmacy";

const router = Router();

// ── POST /api/medicine-orders — Patient submits an order ──────
const OrderBody = z.object({
  appointmentId: z.number().int().optional(),
  appointmentType: z.enum(["online", "offline"]).optional().default("online"),
  deliveryAddress: z.string().min(5, "Please enter a valid address"),
  phone: z.string().min(7, "Please enter a valid phone number"),
  items: z.array(z.object({
    medicineName: z.string().min(1),
    instructions: z.string().optional(),
    qty: z.number().int().min(1).max(999),
  })).min(1, "Select at least one medicine"),
});

router.post("/", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  const parsed = OrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", issues: parsed.error.issues });
    return;
  }

  const { appointmentId, appointmentType, deliveryAddress, phone, items } = parsed.data;

  const [order] = await db.insert(medicineOrdersTable).values({
    patientId: patient.id,
    appointmentId: appointmentId ?? null,
    appointmentType: appointmentType ?? "online",
    deliveryAddress,
    phone,
    status: "submitted",
  }).returning();

  await db.insert(medicineOrderItemsTable).values(
    items.map(it => ({
      orderId: order.id,
      medicineName: it.medicineName,
      instructions: it.instructions ?? null,
      qty: it.qty,
    }))
  );

  // Notify pharmacy via SSE
  notifyPharmacySse("new_order", {
    id: order.id,
    patientName: patient.name,
    createdAt: order.createdAt.toISOString(),
    itemCount: items.length,
  });

  res.status(201).json({ id: order.id });
});

// ── GET /api/medicine-orders/mine — Patient's orders ─────────
router.get("/mine", requirePatient, async (req: any, res) => {
  const patient = req.patient;

  const orders = await db
    .select()
    .from(medicineOrdersTable)
    .where(eq(medicineOrdersTable.patientId, patient.id))
    .orderBy(desc(medicineOrdersTable.createdAt));

  const result = await Promise.all(orders.map(async order => {
    const items = await db
      .select()
      .from(medicineOrderItemsTable)
      .where(eq(medicineOrderItemsTable.orderId, order.id));

    return {
      id: order.id,
      status: order.status,
      deliveryAddress: order.deliveryAddress,
      phone: order.phone,
      trackingNumber: order.trackingNumber,
      pharmacistNotes: order.pharmacistNotes,
      appointmentId: order.appointmentId,
      appointmentType: order.appointmentType,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: items.map(it => ({
        id: it.id,
        medicineName: it.medicineName,
        instructions: it.instructions,
        qty: it.qty,
        available: it.available,
      })),
    };
  }));

  res.json(result);
});

// ── PATCH /api/medicine-orders/:id/approve-partial ───────────
// Patient approves updated order (some medicines marked unavailable)
router.patch("/:id/approve-partial", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  const id = parseInt(req.params.id);

  const [order] = await db.select().from(medicineOrdersTable)
    .where(eq(medicineOrdersTable.id, id));
  if (!order) { res.status(404).json({ error: "not_found" }); return; }
  if (order.patientId !== patient.id) { res.status(403).json({ error: "forbidden" }); return; }
  if (order.status !== "partial_approval_needed") {
    res.status(409).json({ error: "wrong_status" }); return;
  }

  const [updated] = await db.update(medicineOrdersTable)
    .set({ status: "payment_requested", updatedAt: new Date() })
    .where(eq(medicineOrdersTable.id, id))
    .returning();

  notifyPharmacySse("order_updated", { id, status: "payment_requested" });
  res.json(updated);
});

// ── PATCH /api/medicine-orders/:id/payment-done ───────────────
// Patient marks they have paid via QR
router.patch("/:id/payment-done", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  const id = parseInt(req.params.id);

  const [order] = await db.select().from(medicineOrdersTable)
    .where(eq(medicineOrdersTable.id, id));
  if (!order) { res.status(404).json({ error: "not_found" }); return; }
  if (order.patientId !== patient.id) { res.status(403).json({ error: "forbidden" }); return; }
  if (order.status !== "payment_requested") {
    res.status(409).json({ error: "wrong_status", message: "Payment cannot be marked at this stage." }); return;
  }

  const [updated] = await db.update(medicineOrdersTable)
    .set({ status: "payment_done", updatedAt: new Date() })
    .where(eq(medicineOrdersTable.id, id))
    .returning();

  notifyPharmacySse("order_updated", { id, status: "payment_done", patientName: patient.name });
  res.json(updated);
});

export default router;
