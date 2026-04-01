import { Router } from "express";
import {
  db, onlineAppointmentsTable, onlineSlotsTable,
  prescriptionsTable, patientsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import { requirePatient } from "../lib/patient-auth";
import type { DocumentFile } from "@workspace/db";

const router = Router();

// ── POST /api/online-appointments — Patient books a slot ──────
const BookBody = z.object({
  slotId: z.number().int(),
  reason: z.string().optional(),
  documents: z.array(z.object({
    name: z.string(),
    objectPath: z.string(),
    contentType: z.string(),
    size: z.number(),
  })).min(1, "At least one document must be uploaded"),
});

router.post("/", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  const parsed = BookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", issues: parsed.error.issues });
    return;
  }

  const { slotId, reason, documents } = parsed.data;

  // Check slot exists and is not booked
  const [slot] = await db.select().from(onlineSlotsTable).where(eq(onlineSlotsTable.id, slotId));
  if (!slot) { res.status(404).json({ error: "slot_not_found" }); return; }
  if (slot.isBooked) { res.status(409).json({ error: "slot_taken", message: "This slot has already been booked." }); return; }

  // Check patient doesn't already have a booking for this slot
  const existing = await db.select().from(onlineAppointmentsTable)
    .where(and(eq(onlineAppointmentsTable.slotId, slotId), eq(onlineAppointmentsTable.patientId, patient.id)));
  if (existing.length > 0) { res.status(409).json({ error: "already_booked" }); return; }

  // Mark slot as booked
  await db.update(onlineSlotsTable).set({ isBooked: true }).where(eq(onlineSlotsTable.id, slotId));

  const [appt] = await db
    .insert(onlineAppointmentsTable)
    .values({ slotId, patientId: patient.id, reason: reason ?? null, documents: documents as DocumentFile[], status: "confirmed" })
    .returning();

  res.status(201).json(appt);
});

// ── GET /api/online-appointments/mine — Patient's bookings ────
router.get("/mine", requirePatient, async (req: any, res) => {
  const patient = req.patient;

  const rows = await db
    .select({
      appt: onlineAppointmentsTable,
      slot: onlineSlotsTable,
      prescription: prescriptionsTable,
    })
    .from(onlineAppointmentsTable)
    .innerJoin(onlineSlotsTable, eq(onlineAppointmentsTable.slotId, onlineSlotsTable.id))
    .leftJoin(prescriptionsTable, eq(prescriptionsTable.onlineAppointmentId, onlineAppointmentsTable.id))
    .where(eq(onlineAppointmentsTable.patientId, patient.id));

  res.json(rows.map((r) => ({
    id: r.appt.id,
    status: r.appt.status,
    reason: r.appt.reason,
    documents: r.appt.documents,
    createdAt: r.appt.createdAt.toISOString(),
    slot: {
      id: r.slot.id,
      date: r.slot.date,
      startTime: r.slot.startTime,
      endTime: r.slot.endTime,
    },
    prescription: r.prescription ? {
      medicines: r.prescription.medicines,
      updatedAt: r.prescription.updatedAt.toISOString(),
    } : null,
  })));
});

// ── DELETE /api/online-appointments/:id — Cancel ──────────────
router.delete("/:id", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  const id = parseInt(req.params.id);

  const [appt] = await db.select().from(onlineAppointmentsTable)
    .where(and(eq(onlineAppointmentsTable.id, id), eq(onlineAppointmentsTable.patientId, patient.id)));

  if (!appt) { res.status(404).json({ error: "not_found" }); return; }

  // Free the slot
  await db.update(onlineSlotsTable).set({ isBooked: false }).where(eq(onlineSlotsTable.id, appt.slotId));
  await db.update(onlineAppointmentsTable).set({ status: "cancelled" }).where(eq(onlineAppointmentsTable.id, id));

  res.json({ ok: true });
});

export default router;
