import { Router } from "express";
import {
  db, onlineAppointmentsTable, onlineSlotsTable,
  prescriptionsTable, patientsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { requirePatient } from "../lib/patient-auth";
import { requireAdmin } from "../lib/auth";
import { sendAppointmentAckEmail, sendOnlineMeetingLinkEmail } from "../lib/email";
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

  const [slot] = await db.select().from(onlineSlotsTable).where(eq(onlineSlotsTable.id, slotId));
  if (!slot) { res.status(404).json({ error: "slot_not_found" }); return; }
  if (slot.isBooked) { res.status(409).json({ error: "slot_taken", message: "This slot has already been booked." }); return; }

  const existing = await db.select().from(onlineAppointmentsTable)
    .where(and(eq(onlineAppointmentsTable.slotId, slotId), eq(onlineAppointmentsTable.patientId, patient.id)));
  if (existing.length > 0) { res.status(409).json({ error: "already_booked" }); return; }

  await db.update(onlineSlotsTable).set({ isBooked: true }).where(eq(onlineSlotsTable.id, slotId));

  const [appt] = await db
    .insert(onlineAppointmentsTable)
    .values({ slotId, patientId: patient.id, reason: reason ?? null, documents: documents as DocumentFile[], status: "pending" })
    .returning();

  // Send acknowledgement email (fire and forget)
  sendAppointmentAckEmail({
    to: patient.email,
    patientName: patient.name,
    type: "online",
    date: slot.date,
    slotStartTime: slot.startTime,
    slotEndTime: slot.endTime,
    reason: reason,
  }).catch((err) => console.error("[email] ack failed:", err));

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
    .where(eq(onlineAppointmentsTable.patientId, patient.id))
    .orderBy(desc(onlineSlotsTable.date));

  res.json(rows.map((r) => ({
    id: r.appt.id,
    status: r.appt.status,
    reason: r.appt.reason,
    documents: r.appt.documents,
    meetingLink: r.appt.meetingLink ?? null,
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

// ── DELETE /api/online-appointments/:id — Patient cancels ─────
router.delete("/:id", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  const id = parseInt(req.params.id);

  const [appt] = await db.select().from(onlineAppointmentsTable)
    .where(and(eq(onlineAppointmentsTable.id, id), eq(onlineAppointmentsTable.patientId, patient.id)));

  if (!appt) { res.status(404).json({ error: "not_found" }); return; }
  if (appt.status === "confirmed") {
    res.status(400).json({ error: "cannot_cancel", message: "Confirmed appointments cannot be cancelled here. Please call us." });
    return;
  }

  await db.update(onlineSlotsTable).set({ isBooked: false }).where(eq(onlineSlotsTable.id, appt.slotId));
  await db.update(onlineAppointmentsTable).set({ status: "cancelled" }).where(eq(onlineAppointmentsTable.id, id));

  res.json({ ok: true });
});

// ── GET /api/online-appointments/admin — Admin: list all ──────
router.get("/admin", requireAdmin, async (_req, res) => {
  const rows = await db
    .select({
      appt: onlineAppointmentsTable,
      slot: onlineSlotsTable,
      patient: patientsTable,
    })
    .from(onlineAppointmentsTable)
    .innerJoin(onlineSlotsTable, eq(onlineAppointmentsTable.slotId, onlineSlotsTable.id))
    .innerJoin(patientsTable, eq(onlineAppointmentsTable.patientId, patientsTable.id))
    .orderBy(desc(onlineSlotsTable.date), onlineSlotsTable.startTime);

  res.json(rows.map((r) => ({
    id: r.appt.id,
    status: r.appt.status,
    reason: r.appt.reason,
    documents: r.appt.documents,
    meetingLink: r.appt.meetingLink ?? null,
    createdAt: r.appt.createdAt.toISOString(),
    slot: {
      id: r.slot.id,
      date: r.slot.date,
      startTime: r.slot.startTime,
      endTime: r.slot.endTime,
    },
    patient: {
      id: r.patient.id,
      name: r.patient.name,
      email: r.patient.email,
      phone: r.patient.phone,
    },
  })));
});

// ── PATCH /api/online-appointments/admin/:id/approve ──────────
const ApproveBody = z.object({
  meetingLink: z.string().min(1, "Meeting link is required"),
});

router.patch("/admin/:id/approve", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = ApproveBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", issues: parsed.error.issues });
    return;
  }

  const rows = await db
    .select({ appt: onlineAppointmentsTable, slot: onlineSlotsTable, patient: patientsTable })
    .from(onlineAppointmentsTable)
    .innerJoin(onlineSlotsTable, eq(onlineAppointmentsTable.slotId, onlineSlotsTable.id))
    .innerJoin(patientsTable, eq(onlineAppointmentsTable.patientId, patientsTable.id))
    .where(eq(onlineAppointmentsTable.id, id));

  if (rows.length === 0) { res.status(404).json({ error: "not_found" }); return; }
  const { appt, slot, patient } = rows[0];
  if (appt.status === "confirmed") { res.status(409).json({ error: "already_confirmed" }); return; }

  const [updated] = await db
    .update(onlineAppointmentsTable)
    .set({ status: "confirmed", meetingLink: parsed.data.meetingLink })
    .where(eq(onlineAppointmentsTable.id, id))
    .returning();

  // Send meeting link confirmation email (fire and forget)
  sendOnlineMeetingLinkEmail({
    to: patient.email,
    patientName: patient.name,
    slotDate: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    meetingLink: parsed.data.meetingLink,
  }).catch((err) => console.error("[email] meeting link failed:", err));

  res.json({ ...updated, slot, patient });
});

// ── PATCH /api/online-appointments/admin/:id/cancel ───────────
router.patch("/admin/:id/cancel", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);

  const [appt] = await db.select().from(onlineAppointmentsTable).where(eq(onlineAppointmentsTable.id, id));
  if (!appt) { res.status(404).json({ error: "not_found" }); return; }

  await db.update(onlineSlotsTable).set({ isBooked: false }).where(eq(onlineSlotsTable.id, appt.slotId));
  const [updated] = await db
    .update(onlineAppointmentsTable)
    .set({ status: "cancelled" })
    .where(eq(onlineAppointmentsTable.id, id))
    .returning();

  res.json(updated);
});

export default router;
