import { Router } from "express";
import {
  db, onlineAppointmentsTable, onlineSlotsTable,
  prescriptionsTable, patientsTable, siteSettingsTable, patientDocumentsTable,
} from "@workspace/db";
import { eq, and, desc, ne } from "drizzle-orm";
import { z } from "zod/v4";
import { requirePatient } from "../lib/patient-auth";
import { requireAdmin } from "../lib/auth";
import { requireDoctor } from "../lib/doctor-auth";
import { sendAppointmentAckEmail } from "../lib/email";
import type { DocumentFile } from "@workspace/db";
import { notifyPatientJoinEnabled, notifyPatientSessionEnded, notifyPatientPermissionRequest } from "./patient";
import { notifyGuestsJoinEnabled, notifyGuestsSessionEnded } from "../lib/guestSse";
import { roomService, makeRoomName, createGuestToken } from "./livekit";
import { broadcastNewOnlineAppointment, broadcastAppointmentUpdated, broadcastPermissionUpdate, addAppointmentSseClient } from "../lib/appointmentSse";
import { setPermission, getPermissions } from "../lib/permissionStore";
import { notifyAdminCallEnded, notifyAdminNewOnlineAppointment } from "./appointments";

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

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
  })).default([]),
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

  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
  const currentMinutes = hour * 60 + minute;

  const [slotH, slotM] = slot.startTime.split(":").map(Number);
  const slotMinutes = (slotH || 0) * 60 + (slotM || 0);

  if (slot.date < todayStr || (slot.date === todayStr && slotMinutes <= currentMinutes)) {
    res.status(400).json({ error: "slot_expired", message: "This slot has already passed. Please select an upcoming slot." });
    return;
  }

  const existing = await db.select().from(onlineAppointmentsTable)
    .where(and(eq(onlineAppointmentsTable.slotId, slotId), eq(onlineAppointmentsTable.patientId, patient.id)));
  if (existing.length > 0) { res.status(409).json({ error: "already_booked" }); return; }

  // Commit the booking and its document library entries together.
  const appt = await db.transaction(async (tx) => {
    const [claimedSlot] = await tx.update(onlineSlotsTable).set({ isBooked: true })
      .where(and(eq(onlineSlotsTable.id, slotId), eq(onlineSlotsTable.isBooked, false)))
      .returning();
    if (!claimedSlot) return null;

    const [created] = await tx.insert(onlineAppointmentsTable)
      .values({ slotId, patientId: patient.id, reason: reason ?? null, documents: documents as DocumentFile[], status: "pending" })
      .returning();

    for (const document of documents) {
      const [saved] = await tx.select({ id: patientDocumentsTable.id }).from(patientDocumentsTable)
        .where(and(eq(patientDocumentsTable.patientId, patient.id), eq(patientDocumentsTable.objectPath, document.objectPath)));
      if (!saved) {
        await tx.insert(patientDocumentsTable).values({ ...document, patientId: patient.id });
      }
    }
    return created;
  });
  if (!appt) { res.status(409).json({ error: "slot_taken", message: "This slot has already been booked." }); return; }

  // Send acknowledgement email (fire and forget)
  if (patient.email) {
    console.log(`[appointment-email] source: patient_request type: online email: sending to ${patient.email}`);
    sendAppointmentAckEmail({
      to: patient.email,
      patientName: patient.name,
      type: "online",
      date: slot.date,
      slotStartTime: slot.startTime,
      slotEndTime: slot.endTime,
      reason: reason,
    }).catch((err) => console.error("[email] ack failed:", err));
  }

  // Notify doctor portal in real-time
  broadcastNewOnlineAppointment({
    id: appt.id,
    type: "online",
    status: appt.status,
    reason: appt.reason ?? null,
    documents: appt.documents,
    joinEnabled: appt.joinEnabled,
    createdAt: appt.createdAt.toISOString(),
    date: slot.date,
    timeLabel: `${fmtTime(slot.startTime)} \u2013 ${fmtTime(slot.endTime)}`,
    slotId: slot.id,
    patient: {
      id: patient.id,
      patientCode: patient.patientCode ?? null,
      name: patient.name,
      email: patient.email,
      phone: patient.phone ?? null,
    },
    prescription: null,
  });

  notifyAdminNewOnlineAppointment({
    patient: {
      name: patient.name,
      patientCode: patient.patientCode ?? null,
    },
  });

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
    joinEnabled: r.appt.joinEnabled,
    joinEnabledAt: r.appt.joinEnabledAt?.toISOString() ?? null,
    patientJoinedAt: r.appt.patientJoinedAt?.toISOString() ?? null,
    livekitRoomName: r.appt.livekitRoomName ?? null,
    guestToken: r.appt.guestToken ?? null,
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

// ── POST /api/online-appointments/:id/patient-joined ──────────
// Called when the patient clicks "Join" — records the timestamp so admin sees "Live"
router.post("/:id/patient-joined", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [appt] = await db.select().from(onlineAppointmentsTable)
    .where(and(eq(onlineAppointmentsTable.id, id), eq(onlineAppointmentsTable.patientId, patient.id)));
  if (!appt) return res.status(404).json({ error: "Not found" });

  const now = new Date();
  await db.update(onlineAppointmentsTable)
    .set({ patientJoinedAt: now })
    .where(eq(onlineAppointmentsTable.id, id));

  broadcastAppointmentUpdated({
    id,
    joinEnabled: appt.joinEnabled,
    status: appt.status,
    patientJoinedAt: now.toISOString(),
  });

  return res.json({ ok: true });
});

// ── POST /api/online-appointments/:id/patient-joined ───────────
router.post("/:id/patient-joined", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [appt] = await db.select().from(onlineAppointmentsTable)
    .where(and(eq(onlineAppointmentsTable.id, id), eq(onlineAppointmentsTable.patientId, patient.id)));
  if (!appt) return res.status(404).json({ error: "Not found" });

  const now = new Date();
  await db.update(onlineAppointmentsTable)
    .set({ patientJoinedAt: now })
    .where(eq(onlineAppointmentsTable.id, id));

  broadcastAppointmentUpdated({
    id,
    joinEnabled: appt.joinEnabled,
    status: appt.status,
    patientJoinedAt: now.toISOString(),
  });

  return res.json({ ok: true, patientJoinedAt: now.toISOString() });
});

// ── POST /api/online-appointments/doctor/:id/joined ───────────
router.post("/doctor/:id/joined", requireDoctor, async (req: any, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [appt] = await db.select().from(onlineAppointmentsTable)
    .where(eq(onlineAppointmentsTable.id, id));
  if (!appt) return res.status(404).json({ error: "Not found" });

  const now = new Date();
  await db.update(onlineAppointmentsTable)
    .set({ patientJoinedAt: now })
    .where(eq(onlineAppointmentsTable.id, id));

  broadcastAppointmentUpdated({
    id,
    joinEnabled: appt.joinEnabled,
    status: appt.status,
    patientJoinedAt: now.toISOString(),
  });

  return res.json({ ok: true, patientJoinedAt: now.toISOString() });
});

// ── GET /api/online-appointments/admin/stream — Admin SSE stream ─
router.get("/admin/stream", requireAdmin, (req, res) => {
  addAppointmentSseClient(res);
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
    joinEnabled: r.appt.joinEnabled,
    joinEnabledAt: r.appt.joinEnabledAt?.toISOString() ?? null,
    patientJoinedAt: r.appt.patientJoinedAt?.toISOString() ?? null,
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
    permissions: getPermissions(r.appt.id),
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

  // Get settings for PhonePe QR (used in session-ended notifications)
  const [settings] = await db.select().from(siteSettingsTable);

  // Disable join on any other currently-enabled appointments and notify their patients
  const prevEnabled = await db
    .select({ appt: onlineAppointmentsTable })
    .from(onlineAppointmentsTable)
    .where(and(eq(onlineAppointmentsTable.joinEnabled, true), ne(onlineAppointmentsTable.id, id)));

  for (const prev of prevEnabled) {
    await db
      .update(onlineAppointmentsTable)
      .set({ joinEnabled: false, status: "completed" })
      .where(eq(onlineAppointmentsTable.id, prev.appt.id));
    // Notify that patient their session has ended
    notifyPatientSessionEnded(prev.appt.patientId, prev.appt.id, settings?.phonepeQrObjectPath ?? null);
    broadcastAppointmentUpdated({ id: prev.appt.id, joinEnabled: false, status: "completed" });
  }

  // Create LiveKit room for this appointment
  const roomName = makeRoomName(id);
  try {
    await roomService.createRoom({ name: roomName, emptyTimeout: 10 * 60, maxParticipants: 5 });
  } catch (err) {
    console.error("[livekit] room create failed (may already exist):", err);
    // Continue even if room already exists
  }

  // Generate guest token for caregiver sharing (best-effort)
  let guestToken: string | null = null;
  try {
    guestToken = await createGuestToken(id);
  } catch (err) {
    console.error("[livekit] guest token generation failed:", err);
    // Continue — token can be generated on demand by guests
  }

  // Enable join for this appointment — always save livekitRoomName even if guestToken failed
  const [updated] = await db
    .update(onlineAppointmentsTable)
    .set({
      joinEnabled: true,
      joinEnabledAt: new Date(),
      patientJoinedAt: null,
      status: "confirmed",
      livekitRoomName: roomName,
      guestToken,
    })
    .where(eq(onlineAppointmentsTable.id, id))
    .returning();

  // Notify this patient via SSE — include roomName + guestToken so frontend can skip re-fetching
  notifyPatientJoinEnabled(patient.id, id, roomName, guestToken ?? undefined);

  // Notify any guests already waiting in the waiting room
  notifyGuestsJoinEnabled(id);

  // Notify doctor portal in real-time
  broadcastAppointmentUpdated({
    id,
    joinEnabled: true,
    status: "confirmed",
    patientName: patient.name,
    patientCode: patient.patientCode,
    roomName,
  });

  res.json({ ok: true, joinEnabled: true, roomName, apptId: id });
});

// ── POST /api/online-appointments/admin/:id/disable-join ──────
router.post("/admin/:id/disable-join", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);

  const rows = await db
    .select({ appt: onlineAppointmentsTable, patient: patientsTable })
    .from(onlineAppointmentsTable)
    .innerJoin(patientsTable, eq(onlineAppointmentsTable.patientId, patientsTable.id))
    .where(eq(onlineAppointmentsTable.id, id));

  if (rows.length === 0) { res.status(404).json({ error: "not_found" }); return; }
  const { appt, patient } = rows[0];

  const [settings] = await db.select().from(siteSettingsTable);

  await db.update(onlineAppointmentsTable)
    .set({ joinEnabled: false, status: "completed" })
    .where(eq(onlineAppointmentsTable.id, id));

  // Close the LiveKit room if it exists
  if (appt.livekitRoomName) {
    roomService.deleteRoom(appt.livekitRoomName).catch((err: any) =>
      console.error("[livekit] delete room failed:", err)
    );
  }

  notifyPatientSessionEnded(appt.patientId, id, settings?.phonepeQrObjectPath ?? null);
  notifyGuestsSessionEnded(id);
  broadcastAppointmentUpdated({ id, joinEnabled: false, status: "completed", patientName: patient.name });
  notifyAdminCallEnded(id, patient.name);

  res.json({ ok: true, joinEnabled: false });
});

// ── POST /api/online-appointments/:id/report-permissions ─────
// Patient's browser silently reports its camera/mic permission state
router.post("/:id/report-permissions", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid_id" }); return; }
  const { camera, mic } = req.body;

  const [appt] = await db.select({ id: onlineAppointmentsTable.id })
    .from(onlineAppointmentsTable)
    .where(and(eq(onlineAppointmentsTable.id, id), eq(onlineAppointmentsTable.patientId, patient.id)));
  if (!appt) { res.status(404).json({ error: "not_found" }); return; }

  setPermission(id, `patient-${patient.id}`, {
    name: patient.name,
    role: "patient",
    camera: typeof camera === "boolean" ? camera : null,
    mic: typeof mic === "boolean" ? mic : null,
    updatedAt: Date.now(),
  });
  broadcastPermissionUpdate(id, getPermissions(id));
  res.json({ ok: true });
});

// ── POST /api/online-appointments/admin/:id/request-permissions ─
// Admin sends a permission-check prompt to the patient's browser via SSE
router.post("/admin/:id/request-permissions", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const [appt] = await db.select().from(onlineAppointmentsTable).where(eq(onlineAppointmentsTable.id, id));
  if (!appt) { res.status(404).json({ error: "not_found" }); return; }
  if (!appt.joinEnabled) { res.status(409).json({ error: "session_not_active" }); return; }
  notifyPatientPermissionRequest(appt.patientId, id);
  res.json({ ok: true });
});

// ── POST /api/online-appointments/admin/:id/reset-pending ─────
router.post("/admin/:id/reset-pending", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);

  const [appt] = await db.select().from(onlineAppointmentsTable).where(eq(onlineAppointmentsTable.id, id));
  if (!appt) { res.status(404).json({ error: "not_found" }); return; }

  await db.update(onlineAppointmentsTable)
    .set({ status: "pending", joinEnabled: false, joinEnabledAt: null, livekitRoomName: null, guestToken: null })
    .where(eq(onlineAppointmentsTable.id, id));

  broadcastAppointmentUpdated({ id, joinEnabled: false, status: "pending" });

  res.json({ ok: true });
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

  broadcastAppointmentUpdated({ id, joinEnabled: false, status: "confirmed" });

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

  broadcastAppointmentUpdated({ id, joinEnabled: false, status: "cancelled" });

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

// ── PATCH /api/online-appointments/doctor/:id/notes — save notes only ─
router.patch("/doctor/:id/notes", requireDoctor, async (req, res) => {
  const id = parseInt(req.params.id);
  const { notes } = req.body;
  if (typeof notes !== "string") { res.status(400).json({ error: "notes must be a string" }); return; }

  const [appt] = await db.select().from(onlineAppointmentsTable).where(eq(onlineAppointmentsTable.id, id));
  if (!appt) { res.status(404).json({ error: "not_found" }); return; }

  const [existing] = await db.select().from(prescriptionsTable).where(eq(prescriptionsTable.onlineAppointmentId, id));

  if (existing) {
    const [updated] = await db
      .update(prescriptionsTable)
      .set({ notes, updatedAt: new Date() })
      .where(eq(prescriptionsTable.onlineAppointmentId, id))
      .returning();
    res.json({ photoObjectPath: updated.photoObjectPath, notes: updated.notes, updatedAt: updated.updatedAt.toISOString() });
  } else {
    const [created] = await db
      .insert(prescriptionsTable)
      .values({ onlineAppointmentId: id, photoObjectPath: null, notes })
      .returning();
    res.status(201).json({ photoObjectPath: created.photoObjectPath, notes: created.notes, updatedAt: created.updatedAt.toISOString() });
  }
});

// ── DELETE /api/online-appointments/:id/documents — Remove a document ──
router.delete("/:id/documents", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  const id = parseInt(req.params.id);
  const { objectPath } = req.body;

  if (!objectPath || typeof objectPath !== "string") {
    res.status(400).json({ error: "invalid_body", message: "objectPath is required." });
    return;
  }

  const [appt] = await db.select().from(onlineAppointmentsTable)
    .where(and(eq(onlineAppointmentsTable.id, id), eq(onlineAppointmentsTable.patientId, patient.id)));
  if (!appt) { res.status(404).json({ error: "not_found" }); return; }

  const currentDocs: DocumentFile[] = (appt.documents ?? []) as DocumentFile[];
  const newDocs = currentDocs.filter((d: DocumentFile) => d.objectPath !== objectPath);

  if (newDocs.length === currentDocs.length) {
    res.status(404).json({ error: "document_not_found", message: "Document not found in this appointment." });
    return;
  }

  await db.update(onlineAppointmentsTable).set({ documents: newDocs }).where(eq(onlineAppointmentsTable.id, id));

  // Best-effort: delete the file from object storage
  try {
    const { ObjectStorageService } = await import("../lib/objectStorage");
    const storageService = new ObjectStorageService();
    const file = await storageService.getObjectEntityFile(objectPath);
    await file.delete();
  } catch { /* non-critical — DB record is already updated */ }

  res.json({ ok: true, documents: newDocs });
});

// ── POST /api/online-appointments/:id/add-document — Upload during call ──
// Accessible by patient (auth) or guest (no auth) when joinEnabled = true
router.post("/:id/add-document", async (req: any, res) => {
  const id = parseInt(req.params.id);
  const parsed = z.object({
    name: z.string(),
    objectPath: z.string(),
    contentType: z.string(),
    size: z.number(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_body" }); return; }

  const [appt] = await db.select().from(onlineAppointmentsTable).where(eq(onlineAppointmentsTable.id, id));
  if (!appt) { res.status(404).json({ error: "not_found" }); return; }
  if (!appt.joinEnabled) { res.status(403).json({ error: "call_not_active" }); return; }

  const updated = [...(appt.documents ?? []), parsed.data];
  await db.update(onlineAppointmentsTable).set({ documents: updated }).where(eq(onlineAppointmentsTable.id, id));
  res.json({ ok: true, documents: updated });
});

// ── POST & PATCH /api/online-appointments/admin/:id/complete — Mark as Done ────
async function handleCompleteAppointment(req: any, res: any) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "invalid_id" }); return; }
  await db
    .update(onlineAppointmentsTable)
    .set({ joinEnabled: false, status: "completed" })
    .where(eq(onlineAppointmentsTable.id, id));
  broadcastAppointmentUpdated({ id, joinEnabled: false, status: "completed" });
  res.json({ ok: true });
}
router.patch("/admin/:id/complete", requireAdmin, handleCompleteAppointment);
router.post("/admin/:id/complete", requireAdmin, handleCompleteAppointment);

// ── DELETE /api/online-appointments/admin/:id — Admin hard-deletes ──────
router.delete("/admin/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "invalid_id" }); return; }

  const [appt] = await db.select().from(onlineAppointmentsTable).where(eq(onlineAppointmentsTable.id, id));
  if (!appt) { res.status(404).json({ error: "not_found" }); return; }

  // Close any live room first (best effort)
  if (appt.livekitRoomName) {
    const { roomService } = await import("./livekit");
    roomService.deleteRoom(appt.livekitRoomName).catch(() => {});
  }

  // Delete prescription, free the slot, then the appointment
  await db.delete(prescriptionsTable).where(eq(prescriptionsTable.onlineAppointmentId, id));
  await db.update(onlineSlotsTable).set({ isBooked: false }).where(eq(onlineSlotsTable.id, appt.slotId));
  await db.delete(onlineAppointmentsTable).where(eq(onlineAppointmentsTable.id, id));

  res.json({ ok: true });
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
