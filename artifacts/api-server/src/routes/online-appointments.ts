import { Router } from "express";
import {
  db, onlineAppointmentsTable, onlineSlotsTable,
  prescriptionsTable, patientsTable, siteSettingsTable,
} from "@workspace/db";
import { eq, and, desc, ne } from "drizzle-orm";
import { z } from "zod/v4";
import { requirePatient } from "../lib/patient-auth";
import { requireAdmin } from "../lib/auth";
import { requireDoctor } from "../lib/doctor-auth";
import { sendAppointmentAckEmail } from "../lib/email";
import type { DocumentFile } from "@workspace/db";
import { notifyPatientJoinEnabled, notifyPatientSessionEnded } from "./patient";

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
    joinEnabled: r.appt.joinEnabled,
    joinEnabledAt: r.appt.joinEnabledAt?.toISOString() ?? null,
    createdAt: r.appt.createdAt.toISOString(),
    slot: {
      id: r.slot.id,
      date: r.slot.date,
      startTime: r.slot.startTime,
      endTime: r.slot.endTime,
    },
    prescription: r.prescription ? {
      photoObjectPath: r.prescription.photoObjectPath ?? null,
      notes: r.prescription.notes ?? null,
      updatedAt: r.prescription.updatedAt.toISOString(),
    } : null,
  })));
});

// ── GET /api/online-appointments/admin — Admin: list all ──────
router.get("/admin", requireAdmin, async (_req, res) => {
  const rows = await db
    .select({
      appt: onlineAppointmentsTable,
      slot: onlineSlotsTable,
      patient: patientsTable,
      prescription: prescriptionsTable,
    })
    .from(onlineAppointmentsTable)
    .innerJoin(onlineSlotsTable, eq(onlineAppointmentsTable.slotId, onlineSlotsTable.id))
    .innerJoin(patientsTable, eq(onlineAppointmentsTable.patientId, patientsTable.id))
    .leftJoin(prescriptionsTable, eq(prescriptionsTable.onlineAppointmentId, onlineAppointmentsTable.id))
    .orderBy(desc(onlineSlotsTable.date), onlineSlotsTable.startTime);

  res.json(rows.map((r) => ({
    id: r.appt.id,
    status: r.appt.status,
    reason: r.appt.reason,
    documents: r.appt.documents,
    meetingLink: r.appt.meetingLink ?? null,
    joinEnabled: r.appt.joinEnabled,
    joinEnabledAt: r.appt.joinEnabledAt?.toISOString() ?? null,
    createdAt: r.appt.createdAt.toISOString(),
    slot: {
      id: r.slot.id,
      date: r.slot.date,
      startTime: r.slot.startTime,
      endTime: r.slot.endTime,
    },
    patient: {
      id: r.patient.id,
      patientCode: r.patient.patientCode ?? null,
      name: r.patient.name,
      email: r.patient.email,
      phone: r.patient.phone,
    },
    prescription: r.prescription ? {
      photoObjectPath: r.prescription.photoObjectPath ?? null,
      notes: r.prescription.notes ?? null,
      updatedAt: r.prescription.updatedAt.toISOString(),
    } : null,
  })));
});

// ── POST /api/online-appointments/admin/:id/enable-join ───────
// Enables the join button for this patient — disables all others first
// and sends SSE notifications
router.post("/admin/:id/enable-join", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);

  const rows = await db
    .select({ appt: onlineAppointmentsTable, patient: patientsTable })
    .from(onlineAppointmentsTable)
    .innerJoin(patientsTable, eq(onlineAppointmentsTable.patientId, patientsTable.id))
    .where(eq(onlineAppointmentsTable.id, id));

  if (rows.length === 0) { res.status(404).json({ error: "not_found" }); return; }
  const { appt, patient } = rows[0];

  // Get the global meeting link from settings
  const [settings] = await db.select().from(siteSettingsTable);
  const meetingLink = settings?.meetingLink ?? null;

  // Disable join on any other currently-enabled appointments and notify their patients
  const prevEnabled = await db
    .select({ appt: onlineAppointmentsTable })
    .from(onlineAppointmentsTable)
    .where(and(eq(onlineAppointmentsTable.joinEnabled, true), ne(onlineAppointmentsTable.id, id)));

  for (const prev of prevEnabled) {
    await db
      .update(onlineAppointmentsTable)
      .set({ joinEnabled: false })
      .where(eq(onlineAppointmentsTable.id, prev.appt.id));
    // Notify that patient their session has ended
    notifyPatientSessionEnded(prev.appt.patientId, prev.appt.id, settings?.phonepeQrObjectPath ?? null);
  }

  // Enable join for this appointment
  const [updated] = await db
    .update(onlineAppointmentsTable)
    .set({ joinEnabled: true, joinEnabledAt: new Date(), status: "confirmed" })
    .where(eq(onlineAppointmentsTable.id, id))
    .returning();

  // Notify this patient via SSE
  if (meetingLink) {
    notifyPatientJoinEnabled(patient.id, id, meetingLink);
  }

  res.json({ ok: true, joinEnabled: true, meetingLink, apptId: id });
});

// ── POST /api/online-appointments/admin/:id/disable-join ──────
router.post("/admin/:id/disable-join", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);

  const [appt] = await db.select().from(onlineAppointmentsTable).where(eq(onlineAppointmentsTable.id, id));
  if (!appt) { res.status(404).json({ error: "not_found" }); return; }

  const [settings] = await db.select().from(siteSettingsTable);

  await db.update(onlineAppointmentsTable)
    .set({ joinEnabled: false, status: "completed" })
    .where(eq(onlineAppointmentsTable.id, id));

  notifyPatientSessionEnded(appt.patientId, id, settings?.phonepeQrObjectPath ?? null);

  res.json({ ok: true, joinEnabled: false });
});

// ── PATCH /api/online-appointments/admin/:id/approve ──────────
// Approve appointment (keep existing flow)
router.patch("/admin/:id/approve", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);

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
    .set({ status: "confirmed" })
    .where(eq(onlineAppointmentsTable.id, id))
    .returning();

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

// ── PUT /api/online-appointments/:id/prescription ─────────────
// Upload prescription photo — accessible by admin or doctor
const PrescriptionBody = z.object({
  photoObjectPath: z.string().min(1),
  notes: z.string().optional(),
});

async function upsertPrescriptionPhoto(apptId: number, photoObjectPath: string, notes: string | undefined, res: any) {
  const [appt] = await db.select().from(onlineAppointmentsTable).where(eq(onlineAppointmentsTable.id, apptId));
  if (!appt) { res.status(404).json({ error: "not_found" }); return; }

  const [existing] = await db.select().from(prescriptionsTable).where(eq(prescriptionsTable.onlineAppointmentId, apptId));

  if (existing) {
    const [updated] = await db
      .update(prescriptionsTable)
      .set({ photoObjectPath, notes: notes ?? existing.notes, updatedAt: new Date() })
      .where(eq(prescriptionsTable.onlineAppointmentId, apptId))
      .returning();
    res.json({ photoObjectPath: updated.photoObjectPath, notes: updated.notes, updatedAt: updated.updatedAt.toISOString() });
  } else {
    const [created] = await db
      .insert(prescriptionsTable)
      .values({ onlineAppointmentId: apptId, photoObjectPath, notes: notes ?? null })
      .returning();
    res.status(201).json({ photoObjectPath: created.photoObjectPath, notes: created.notes, updatedAt: created.updatedAt.toISOString() });
  }
}

router.put("/admin/:id/prescription", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = PrescriptionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation_error" }); return; }
  await upsertPrescriptionPhoto(id, parsed.data.photoObjectPath, parsed.data.notes, res);
});

router.put("/doctor/:id/prescription", requireDoctor, async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = PrescriptionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation_error" }); return; }
  await upsertPrescriptionPhoto(id, parsed.data.photoObjectPath, parsed.data.notes, res);
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

export default router;
