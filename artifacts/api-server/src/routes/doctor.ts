import { Router } from "express";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import {
  db,
  siteSettingsTable,
  doctorSessionsTable,
  onlineAppointmentsTable,
  onlineSlotsTable,
  patientsTable,
  prescriptionsTable,
  appointmentsTable,
  patientDocumentsTable,
  donationsTable,
} from "@workspace/db";
import { eq, desc, inArray, and, gte, lte } from "drizzle-orm";
import { requireDoctor, verifyDoctorSession } from "../lib/doctor-auth";
import { notifyPatientSessionEnded } from "./patient";
import { roomService, makeRoomName } from "./livekit";
import { notifyGuestsSessionEnded } from "../lib/guestSse";
import { notifyAdminCallEnded } from "./appointments";
import { broadcastAppointmentUpdated } from "../lib/appointmentSse";
import { addDonationSseClient, broadcastDonationUpdate } from "../lib/donationSse";
import { addAppointmentSseClient } from "../lib/appointmentSse";
import { streamPrescriptionDownload } from "../lib/prescription-service";
import { verifyRecaptcha } from "../lib/recaptcha";

const router = Router();
const COOKIE = "doctor_session";
const SESSION_DAYS = 7;

// ── POST /api/doctor/login ────────────────────────────────────
router.post("/login", verifyRecaptcha("doctor_login"), async (req, res) => {
  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {}
    }
    const { password } = body || {};
    if (!password) {
      res.status(400).json({ error: "password_required", message: "Password is required." });
      return;
    }

    const [settings] = await db.select().from(siteSettingsTable);
    if (!settings?.doctorPasswordHash) {
      res.status(401).json({
        error: "not_configured",
        message: "Doctor portal is not yet configured. Ask the admin to set the doctor password in Settings.",
      });
      return;
    }

    const ok = await bcrypt.compare(password, settings.doctorPasswordHash);
    if (!ok) {
      res.status(401).json({ error: "invalid_password", message: "Incorrect password." });
      return;
    }

    const token = randomBytes(48).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await db.insert(doctorSessionsTable).values({ sessionToken: token, expiresAt });

    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    });
    res.json({ ok: true, success: true });
  } catch (err: any) {
    console.error("[Doctor Login Error]:", err);
    res.status(500).json({
      error: "login_error",
      message: err?.message || "An unexpected error occurred during doctor login.",
    });
  }
});

// ── POST /api/doctor/logout ───────────────────────────────────
router.post("/logout", async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) {
    await db.delete(doctorSessionsTable).where(eq(doctorSessionsTable.sessionToken, token));
  }
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

// ── GET /api/doctor/me ────────────────────────────────────────
router.get("/me", async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (!token) { res.status(401).json({ error: "unauthorized" }); return; }
  const valid = await verifyDoctorSession(token);
  if (!valid) { res.status(401).json({ error: "unauthorized" }); return; }
  res.json({ name: "Dr. P. Murali Krishna", role: "doctor" });
});

// ── GET /api/doctor/appointments ─────────────────────────────
router.get("/appointments", requireDoctor, async (_req, res) => {
  const [rows, allPatientDocs] = await Promise.all([
    db
      .select({
        appt: onlineAppointmentsTable,
        slot: onlineSlotsTable,
        patient: patientsTable,
        prescription: prescriptionsTable,
      })
      .from(onlineAppointmentsTable)
      .innerJoin(onlineSlotsTable, and(
        eq(onlineAppointmentsTable.slotId, onlineSlotsTable.id),
        eq(onlineSlotsTable.deleteColumn, 0)
      ))
      .innerJoin(patientsTable, and(
        eq(onlineAppointmentsTable.patientId, patientsTable.id),
        eq(patientsTable.deleteColumn, 0)
      ))
      .leftJoin(prescriptionsTable, and(
        eq(prescriptionsTable.onlineAppointmentId, onlineAppointmentsTable.id),
        eq(prescriptionsTable.deleteColumn, 0)
      ))
      .where(eq(onlineAppointmentsTable.deleteColumn, 0))
      .orderBy(desc(onlineSlotsTable.date), onlineSlotsTable.startTime),
    db.select().from(patientDocumentsTable).where(eq(patientDocumentsTable.deleteColumn, 0)),
  ]);

  res.json(rows.map((r) => ({
    id: r.appt.id,
    status: r.appt.status,
    reason: r.appt.reason,
    documents: r.appt.documents,
    patientDocs: allPatientDocs
      .filter(d => d.patientId === r.patient.id)
      .map(d => ({ id: d.id, name: d.name, objectPath: d.objectPath, contentType: d.contentType, size: d.size })),
    joinEnabled: r.appt.joinEnabled,
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
      avatarUrl: r.patient.avatarUrl,
      age: r.patient.age ?? null,
      gender: r.patient.gender ?? null,
    },
    prescription: r.prescription ? {
      id: r.prescription.id,
      photoObjectPath: r.prescription.photoObjectPath ?? null,
      notes: r.prescription.notes ?? null,
      updatedAt: r.prescription.updatedAt.toISOString(),
    } : null,
  })));
});

import { sql } from "drizzle-orm";

async function ensureOfflinePrescriptionSchema() {
  try {
    await db.execute(sql`
      ALTER TABLE public.prescriptions ADD COLUMN IF NOT EXISTS appointment_id INTEGER UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE;
      ALTER TABLE public.prescriptions ALTER COLUMN online_appointment_id DROP NOT NULL;
    `);
  } catch (err: any) {
    console.error("⚠️ Failed to ensure offline prescription schema:", err.message);
  }
}
ensureOfflinePrescriptionSchema();

export function extractClinicalNotes(notes: string | null | undefined): string | null {
  if (!notes || typeof notes !== "string") return null;
  const trimmed = notes.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed.notes === "string" && parsed.notes.trim()) {
        return parsed.notes.trim();
      }
      return null;
    } catch {
      return null;
    }
  }
  if (trimmed.includes("DOCTOR NOTES:")) {
    const parts = trimmed.split("DOCTOR NOTES:");
    const extracted = parts[parts.length - 1].trim();
    return extracted || null;
  }
  if (trimmed.startsWith("AYURVEDIC MEDICINAL FORMULATIONS:")) {
    return null;
  }
  return trimmed;
}

export function isRealClinicalNotes(notes: string | null | undefined): boolean {
  if (!notes || typeof notes !== "string") return false;
  const trimmed = notes.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("{") && (trimmed.includes('"token"') || trimmed.includes('"amount"') || trimmed.includes('"paymentMode"'))) {
    return false;
  }
  return true;
}

export function isPrescriptionComplete(
  photoObjectPath: string | null | undefined,
  notes: string | null | undefined
): boolean {
  if (photoObjectPath && typeof photoObjectPath === "string" && photoObjectPath.trim().length > 0) {
    return true;
  }
  if (!notes || typeof notes !== "string") {
    return false;
  }
  const trimmed = notes.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      // Exclude tokens/payments without actual prescription data
      if (parsed.token || parsed.amount || parsed.paymentMode) {
        const hasExplicitRx = Boolean(
          parsed.digitalPrescription === true ||
          (parsed.diagnosis && typeof parsed.diagnosis === "string" && parsed.diagnosis.trim().length > 0) ||
          (Array.isArray(parsed.formulationRows) && parsed.formulationRows.length > 0) ||
          (typeof parsed.notes === "string" && parsed.notes.trim().length > 0)
        );
        if (!hasExplicitRx) return false;
      }
      if (parsed.digitalPrescription === true) return true;
      if (parsed.diagnosis && typeof parsed.diagnosis === "string" && parsed.diagnosis.trim().length > 0) return true;
      if (Array.isArray(parsed.formulationRows) && parsed.formulationRows.length > 0) return true;
      if (typeof parsed.notes === "string" && parsed.notes.trim().length > 0) return true;
    } catch {
      // not JSON, fallback to text checks
    }
  }

  if (trimmed.includes("DOCTOR NOTES:") || trimmed.includes("AYURVEDIC MEDICINAL FORMULATIONS:") || /^Diagnosis:/i.test(trimmed)) {
    return true;
  }

  if (isRealClinicalNotes(trimmed)) {
    return true;
  }

  return false;
}

// ── GET /api/doctor/all-appointments — Both types ────────────
router.get("/all-appointments", requireDoctor, async (_req, res) => {
  const [onlineRows, offlineRows, allPatientDocs] = await Promise.all([
    db
      .select({
        appt: onlineAppointmentsTable,
        slot: onlineSlotsTable,
        patient: patientsTable,
        prescription: prescriptionsTable,
      })
      .from(onlineAppointmentsTable)
      .innerJoin(onlineSlotsTable, and(
        eq(onlineAppointmentsTable.slotId, onlineSlotsTable.id),
        eq(onlineSlotsTable.deleteColumn, 0)
      ))
      .innerJoin(patientsTable, and(
        eq(onlineAppointmentsTable.patientId, patientsTable.id),
        eq(patientsTable.deleteColumn, 0)
      ))
      .leftJoin(prescriptionsTable, and(
        eq(prescriptionsTable.onlineAppointmentId, onlineAppointmentsTable.id),
        eq(prescriptionsTable.deleteColumn, 0)
      ))
      .where(and(
        eq(onlineAppointmentsTable.deleteColumn, 0),
        inArray(onlineAppointmentsTable.status, ["pending", "confirmed", "completed"])
      ))
      .orderBy(desc(onlineSlotsTable.date), onlineSlotsTable.startTime),
    db
      .select({
        appt: appointmentsTable,
        patient: patientsTable,
        prescription: prescriptionsTable,
      })
      .from(appointmentsTable)
      .leftJoin(patientsTable, and(
        eq(appointmentsTable.patientId, patientsTable.id),
        eq(patientsTable.deleteColumn, 0)
      ))
      .leftJoin(prescriptionsTable, and(
        eq(prescriptionsTable.appointmentId, appointmentsTable.id),
        eq(prescriptionsTable.deleteColumn, 0)
      ))
      .where(and(
        eq(appointmentsTable.deleteColumn, 0),
        inArray(appointmentsTable.status, ["confirmed", "arrived", "reschedule_accepted", "completed"])
      ))
      .orderBy(desc(appointmentsTable.date), desc(appointmentsTable.createdAt)),
    db.select().from(patientDocumentsTable).where(eq(patientDocumentsTable.deleteColumn, 0)),
  ]);

  const online = onlineRows.map((r) => {
    const photoPath = r.prescription?.photoObjectPath ?? null;
    const rxNotes = r.prescription?.notes ?? null;
    const rxComplete = isPrescriptionComplete(photoPath, rxNotes);
    const rxType = photoPath ? "uploaded" : (rxComplete ? "digital" : null);

    return {
      id: r.appt.id,
      type: "online" as const,
      status: r.appt.status,
      reason: r.appt.reason ?? null,
      documents: r.appt.documents,
      patientDocs: allPatientDocs
        .filter(d => d.patientId === r.patient.id)
        .map(d => ({ id: d.id, name: d.name, objectPath: d.objectPath, contentType: d.contentType, size: d.size })),
      joinEnabled: r.appt.joinEnabled,
      createdAt: r.appt.createdAt.toISOString(),
      date: r.slot.date,
      timeLabel: `${fmtTime(r.slot.startTime)} – ${fmtTime(r.slot.endTime)}`,
      slotId: r.slot.id,
      patient: {
        id: r.patient.id,
        patientCode: r.patient.patientCode ?? `A${String(r.patient.id).padStart(3, "0")}`,
        name: r.patient.name,
        email: r.patient.email,
        phone: r.patient.phone ?? null,
        age: r.patient.age ?? null,
        gender: r.patient.gender ?? null,
      },
      prescription: r.prescription ? {
        id: r.prescription.id,
        photoObjectPath: photoPath,
        notes: rxNotes ?? extractClinicalNotes(rxNotes),
        updatedAt: r.prescription.updatedAt.toISOString(),
      } : null,
      hasPrescription: rxComplete,
      prescriptionType: rxType,
    };
  });

  const offline = offlineRows.map((r) => {
    const pCode = r.patient?.patientCode || (r.appt.patientId ? `P${String(r.appt.patientId).padStart(3, "0")}` : `P${String(r.appt.id).padStart(3, "0")}`);
    const patId = r.patient?.id;
    const photoPath = r.prescription?.photoObjectPath ?? null;
    const rxNotes = r.prescription?.notes ?? null;
    const clinicalNotes = extractClinicalNotes(rxNotes ?? r.appt.notes);
    const rxComplete = isPrescriptionComplete(photoPath, rxNotes);
    const rxType = photoPath ? "uploaded" : (rxComplete ? "digital" : null);

    return {
      id: r.appt.id,
      type: "offline" as const,
      status: r.appt.status,
      reason: r.appt.reason ?? null,
      documents: [] as any[],
      patientDocs: patId ? allPatientDocs.filter(d => d.patientId === patId).map(d => ({ id: d.id, name: d.name, objectPath: d.objectPath, contentType: d.contentType, size: d.size })) : [],
      joinEnabled: false,
      createdAt: r.appt.createdAt?.toISOString() ?? "",
      date: r.appt.date,
      timeLabel: r.appt.timeSlot,
      patient: {
        id: r.patient?.id ?? r.appt.patientId ?? null,
        patientCode: pCode,
        name: r.appt.patientName,
        email: r.appt.patientEmail ?? null,
        phone: r.appt.patientPhone,
        age: r.patient?.age ?? null,
        gender: r.patient?.gender ?? null,
      },
      prescription: r.prescription ? {
        id: r.prescription.id,
        photoObjectPath: photoPath,
        notes: r.prescription.notes ?? clinicalNotes,
        updatedAt: r.prescription.updatedAt.toISOString(),
      } : null,
      notes: r.prescription?.notes ?? clinicalNotes ?? null,
      hasPrescription: rxComplete,
      prescriptionType: rxType,
    };
  });

  const rxNeeded = [
    ...online.filter(a => a.status === "completed" && !a.joinEnabled && !a.hasPrescription),
    ...offline.filter(a => a.status === "completed" && !a.hasPrescription),
  ].sort((a, b) => b.date.localeCompare(a.date));

  res.json({ online, offline, rxNeeded });
});

// ── GET /api/doctor/rx-needed — Dedicated pending prescriptions query ──────
router.get("/rx-needed", requireDoctor, async (_req, res) => {
  const [onlineRows, offlineRows] = await Promise.all([
    db
      .select({
        appt: onlineAppointmentsTable,
        slot: onlineSlotsTable,
        patient: patientsTable,
        prescription: prescriptionsTable,
      })
      .from(onlineAppointmentsTable)
      .innerJoin(onlineSlotsTable, and(
        eq(onlineAppointmentsTable.slotId, onlineSlotsTable.id),
        eq(onlineSlotsTable.deleteColumn, 0)
      ))
      .innerJoin(patientsTable, and(
        eq(onlineAppointmentsTable.patientId, patientsTable.id),
        eq(patientsTable.deleteColumn, 0)
      ))
      .leftJoin(prescriptionsTable, and(
        eq(prescriptionsTable.onlineAppointmentId, onlineAppointmentsTable.id),
        eq(prescriptionsTable.deleteColumn, 0)
      ))
      .where(and(
        eq(onlineAppointmentsTable.deleteColumn, 0),
        eq(onlineAppointmentsTable.status, "completed")
      ))
      .orderBy(desc(onlineSlotsTable.date), onlineSlotsTable.startTime),
    db
      .select({
        appt: appointmentsTable,
        patient: patientsTable,
        prescription: prescriptionsTable,
      })
      .from(appointmentsTable)
      .leftJoin(patientsTable, and(
        eq(appointmentsTable.patientId, patientsTable.id),
        eq(patientsTable.deleteColumn, 0)
      ))
      .leftJoin(prescriptionsTable, and(
        eq(prescriptionsTable.appointmentId, appointmentsTable.id),
        eq(prescriptionsTable.deleteColumn, 0)
      ))
      .where(and(
        eq(appointmentsTable.deleteColumn, 0),
        eq(appointmentsTable.status, "completed")
      ))
      .orderBy(desc(appointmentsTable.date), desc(appointmentsTable.createdAt)),
  ]);

  const online = onlineRows
    .filter(r => !isPrescriptionComplete(r.prescription?.photoObjectPath, r.prescription?.notes))
    .map(r => ({
      id: r.appt.id,
      type: "online" as const,
      status: r.appt.status,
      date: r.slot.date,
      timeLabel: `${fmtTime(r.slot.startTime)} – ${fmtTime(r.slot.endTime)}`,
      patient: {
        id: r.patient.id,
        patientCode: r.patient.patientCode ?? `A${String(r.patient.id).padStart(3, "0")}`,
        name: r.patient.name,
        email: r.patient.email,
        phone: r.patient.phone ?? null,
      },
      hasPrescription: false,
    }));

  const offline = offlineRows
    .filter(r => !isPrescriptionComplete(r.prescription?.photoObjectPath, r.prescription?.notes))
    .map(r => {
      const pCode = r.patient?.patientCode || (r.appt.patientId ? `P${String(r.appt.patientId).padStart(3, "0")}` : `P${String(r.appt.id).padStart(3, "0")}`);
      return {
        id: r.appt.id,
        type: "offline" as const,
        status: r.appt.status,
        date: r.appt.date,
        timeLabel: r.appt.timeSlot,
        patient: {
          id: r.patient?.id ?? r.appt.patientId ?? null,
          patientCode: pCode,
          name: r.appt.patientName,
          email: r.appt.patientEmail ?? null,
          phone: r.appt.patientPhone,
        },
        hasPrescription: false,
      };
    });

  const rxNeeded = [...online, ...offline].sort((a, b) => b.date.localeCompare(a.date));
  res.json({ rxNeeded, count: rxNeeded.length });
});

// ── DELETE prescription endpoints ────────────────────────────
router.delete("/offline-appointments/:id/prescription", requireDoctor, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "invalid_id" }); return; }

  await db.update(prescriptionsTable)
    .set({ deleteColumn: 1, updatedAt: new Date() })
    .where(and(eq(prescriptionsTable.appointmentId, id), eq(prescriptionsTable.deleteColumn, 0)));

  res.json({ ok: true });
});

router.delete("/online-appointments/:id/prescription", requireDoctor, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "invalid_id" }); return; }

  await db.update(prescriptionsTable)
    .set({ deleteColumn: 1, updatedAt: new Date() })
    .where(and(eq(prescriptionsTable.onlineAppointmentId, id), eq(prescriptionsTable.deleteColumn, 0)));

  res.json({ ok: true });
});

// ── PATCH /api/doctor/offline-appointments/:id/done ───────────
router.patch("/offline-appointments/:id/done", requireDoctor, async (req, res) => {
  const id = parseInt(req.params.id);

  const [appt] = await db.select().from(appointmentsTable).where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.deleteColumn, 0)));
  if (!appt) { res.status(404).json({ error: "not_found" }); return; }

  const [updated] = await db
    .update(appointmentsTable)
    .set({ status: "completed" })
    .where(eq(appointmentsTable.id, id))
    .returning();

  res.json({ ...updated, createdAt: updated.createdAt?.toISOString() });
});

// ── PUT /api/doctor/offline-appointments/:id/prescription ────
router.put("/offline-appointments/:id/prescription", requireDoctor, async (req, res) => {
  const id = parseInt(req.params.id);
  const { photoObjectPath, notes } = req.body;

  const [existing] = await db
    .select()
    .from(prescriptionsTable)
    .where(and(eq(prescriptionsTable.appointmentId, id), eq(prescriptionsTable.deleteColumn, 0)));

  let rx;
  if (existing) {
    [rx] = await db
      .update(prescriptionsTable)
      .set({
        ...(photoObjectPath !== undefined ? { photoObjectPath } : {}),
        ...(notes !== undefined ? { notes } : {}),
        updatedAt: new Date(),
      })
      .where(eq(prescriptionsTable.appointmentId, id))
      .returning();
  } else {
    [rx] = await db
      .insert(prescriptionsTable)
      .values({
        appointmentId: id,
        photoObjectPath: photoObjectPath ?? null,
        notes: notes ?? null,
      })
      .returning();
  }

  res.json({
    id: rx.id,
    photoObjectPath: rx.photoObjectPath ?? null,
    notes: rx.notes ?? null,
    updatedAt: rx.updatedAt.toISOString(),
  });
});

// ── PATCH /api/doctor/offline-appointments/:id/notes ──────────
router.patch("/offline-appointments/:id/notes", requireDoctor, async (req, res) => {
  const id = parseInt(req.params.id);
  const { notes } = req.body;
  if (typeof notes !== "string") { res.status(400).json({ error: "notes must be a string" }); return; }

  const [updated] = await db
    .update(appointmentsTable)
    .set({ notes })
    .where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.deleteColumn, 0)))
    .returning();

  if (!updated) { res.status(404).json({ error: "not_found" }); return; }

  // Also update or insert in prescriptionsTable if present
  const [existingRx] = await db.select().from(prescriptionsTable).where(and(eq(prescriptionsTable.appointmentId, id), eq(prescriptionsTable.deleteColumn, 0)));
  if (existingRx) {
    await db.update(prescriptionsTable).set({ notes, updatedAt: new Date() }).where(eq(prescriptionsTable.appointmentId, id));
  } else {
    await db.insert(prescriptionsTable).values({ appointmentId: id, photoObjectPath: null, notes });
  }

  res.json({ ok: true, notes: updated.notes });
});

// ── POST /api/doctor/online-appointments/:id/complete ─────────
// Called by doctor portal when video call ends — marks appointment completed
router.post("/online-appointments/:id/complete", requireDoctor, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "invalid_id" }); return; }

  const [appt] = await db
    .select({ appt: onlineAppointmentsTable })
    .from(onlineAppointmentsTable)
    .where(and(eq(onlineAppointmentsTable.id, id), eq(onlineAppointmentsTable.deleteColumn, 0)))
    .then(r => r.map(x => x.appt));

  if (!appt) { res.status(404).json({ error: "not_found" }); return; }

  const [settings] = await db.select().from(siteSettingsTable);

  await db
    .update(onlineAppointmentsTable)
    .set({ joinEnabled: false, status: "completed" })
    .where(eq(onlineAppointmentsTable.id, id));

  const roomName = appt.livekitRoomName || makeRoomName(id);
  roomService.deleteRoom(roomName).catch(() => {});

  notifyPatientSessionEnded(appt.patientId, id, settings?.phonepeQrObjectPath ?? null);
  notifyGuestsSessionEnded(id);
  notifyAdminCallEnded(id);
  broadcastAppointmentUpdated({ id, joinEnabled: false, status: "completed" });

  res.json({ ok: true });
});

// ── GET /api/doctor/patients — All registered patients with docs + appt history ──
router.get("/patients", requireDoctor, async (_req, res) => {
  const [patients, docs, onlineRows, offlineRows] = await Promise.all([
    db.select().from(patientsTable).where(eq(patientsTable.deleteColumn, 0)).orderBy(patientsTable.name),
    db.select().from(patientDocumentsTable).where(eq(patientDocumentsTable.deleteColumn, 0)),
    db
      .select({
        appt: onlineAppointmentsTable,
        slot: onlineSlotsTable,
        prescription: prescriptionsTable,
      })
      .from(onlineAppointmentsTable)
      .innerJoin(onlineSlotsTable, and(
        eq(onlineAppointmentsTable.slotId, onlineSlotsTable.id),
        eq(onlineSlotsTable.deleteColumn, 0)
      ))
      .leftJoin(prescriptionsTable, and(
        eq(prescriptionsTable.onlineAppointmentId, onlineAppointmentsTable.id),
        eq(prescriptionsTable.deleteColumn, 0)
      ))
      .where(eq(onlineAppointmentsTable.deleteColumn, 0))
      .orderBy(desc(onlineSlotsTable.date), onlineSlotsTable.startTime),
    db
      .select({
        appt: appointmentsTable,
        prescription: prescriptionsTable,
      })
      .from(appointmentsTable)
      .leftJoin(prescriptionsTable, and(
        eq(prescriptionsTable.appointmentId, appointmentsTable.id),
        eq(prescriptionsTable.deleteColumn, 0)
      ))
      .where(eq(appointmentsTable.deleteColumn, 0))
      .orderBy(desc(appointmentsTable.date)),
  ]);

  res.json(patients.map(p => {
    const onlineAppts = onlineRows
      .filter(r => r.appt.patientId === p.id)
      .map(r => {
        const rawNotes = r.prescription?.notes ?? null;
        const clinicalNotes = extractClinicalNotes(rawNotes);
        const hasNotes = !!(rawNotes || clinicalNotes);
        const hasPhoto = !!r.prescription?.photoObjectPath;
        const reasonText = extractClinicalNotes(r.appt.reason);
        return {
          id: r.appt.id,
          type: "online" as const,
          status: r.appt.status,
          date: r.slot.date,
          timeLabel: `${fmtTime(r.slot.startTime)} – ${fmtTime(r.slot.endTime)}`,
          reason: reasonText,
          joinEnabled: r.appt.joinEnabled,
          documents: (r.appt.documents as any[]) || [],
          prescription: (hasPhoto || hasNotes) ? {
            id: r.prescription?.id ?? null,
            photoObjectPath: r.prescription?.photoObjectPath ?? null,
            notes: rawNotes ?? clinicalNotes,
            updatedAt: r.prescription?.updatedAt?.toISOString() ?? new Date().toISOString(),
          } : null,
        };
      });

    const offlineAppts = offlineRows
      .filter(r => r.appt.patientId === p.id || (r.appt.patientName && p.name && r.appt.patientName.trim().toLowerCase() === p.name.trim().toLowerCase()))
      .map(r => {
        const rawNotes = r.prescription?.notes ?? r.appt.notes ?? null;
        const clinicalNotes = extractClinicalNotes(rawNotes);
        const hasPhoto = !!r.prescription?.photoObjectPath;
        const hasNotes = !!(rawNotes || clinicalNotes);
        const reasonText = extractClinicalNotes(r.appt.reason);
        return {
          id: r.appt.id,
          type: "offline" as const,
          status: r.appt.status,
          date: r.appt.date,
          timeLabel: r.appt.timeSlot,
          reason: reasonText,
          joinEnabled: false,
          documents: [],
          prescription: (hasPhoto || hasNotes) ? {
            id: r.prescription?.id ?? null,
            photoObjectPath: r.prescription?.photoObjectPath ?? null,
            notes: rawNotes ?? clinicalNotes,
            updatedAt: r.prescription?.updatedAt?.toISOString() ?? (r.appt.createdAt ? r.appt.createdAt.toISOString() : new Date().toISOString()),
          } : null,
        };
      });

    const allAppts = [...onlineAppts, ...offlineAppts].sort((a, b) => b.date.localeCompare(a.date));

    return {
      id: p.id,
      patientCode: p.patientCode ?? null,
      name: p.name,
      email: p.email,
      phone: p.phone ?? null,
      age: p.age ?? null,
      gender: p.gender ?? null,
      createdAt: p.createdAt.toISOString(),
      documents: docs
        .filter(d => d.patientId === p.id)
        .map(d => ({ id: d.id, name: d.name, objectPath: d.objectPath, contentType: d.contentType, size: d.size, createdAt: d.createdAt ? d.createdAt.toISOString() : null })),
      appointments: allAppts,
    };
  }));
});

// ── GET /doctor/online-appointments/sse — live appointment updates ─
router.get("/online-appointments/sse", requireDoctor, (req, res) => {
  addAppointmentSseClient(res);
  res.write(": connected\n\n");
  req.on("close", () => {/* handled by addAppointmentSseClient cleanup */});
});

// ── GET /doctor/donations/sse — live updates ──────────────────
router.get("/donations/sse", requireDoctor, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(": connected\n\n");

  const cleanup = addDonationSseClient("doctor", res);
  const heartbeat = setInterval(() => { try { res.write(": ping\n\n"); } catch { clearInterval(heartbeat); } }, 15000);
  req.on("close", () => { cleanup(); clearInterval(heartbeat); });
});

// ── GET /doctor/donations/unseen-count ─────────────────────────
router.get("/donations/unseen-count", requireDoctor, async (_req, res) => {
  try {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(donationsTable)
      .where(and(eq(donationsTable.deleteColumn, 0), eq(donationsTable.isSeen, false)));
    res.json({ count: result?.count ?? 0 });
  } catch (err) {
    console.error("Doctor unseen donations count error:", err);
    res.status(500).json({ error: "Failed to fetch unseen donations count" });
  }
});

// ── POST /doctor/donations/mark-seen ───────────────────────────
router.post("/donations/mark-seen", requireDoctor, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (Array.isArray(ids) && ids.length > 0) {
      const validIds = ids.filter((id: any) => typeof id === "number" && !isNaN(id));
      if (validIds.length > 0) {
        await db.update(donationsTable)
          .set({ isSeen: true, seenAt: new Date() })
          .where(and(
            inArray(donationsTable.id, validIds),
            eq(donationsTable.deleteColumn, 0),
            eq(donationsTable.isSeen, false)
          ));
      }
    } else {
      await db.update(donationsTable)
        .set({ isSeen: true, seenAt: new Date() })
        .where(and(
          eq(donationsTable.deleteColumn, 0),
          eq(donationsTable.isSeen, false)
        ));
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Doctor mark-seen donations error:", err);
    res.status(500).json({ error: "Failed to mark donations as seen" });
  }
});

// ── GET /doctor/donations ──────────────────────────────────────
router.get("/donations", requireDoctor, async (req, res) => {
  try {
    const { month, year } = req.query;
    let query = db.select().from(donationsTable).where(eq(donationsTable.deleteColumn, 0)).orderBy(desc(donationsTable.createdAt));

    if (month && year) {
      const y = parseInt(year as string);
      const m = parseInt(month as string);
      if (!isNaN(y) && !isNaN(m)) {
        const from = new Date(y, m - 1, 1);
        const to = new Date(y, m, 1);
        query = db.select().from(donationsTable)
          .where(and(eq(donationsTable.deleteColumn, 0), gte(donationsTable.createdAt, from), lte(donationsTable.createdAt, to)))
          .orderBy(desc(donationsTable.createdAt)) as any;
      }
    }

    const rows = await query;
    res.json(rows);
  } catch (err) {
    console.error("Doctor donations error:", err);
    res.status(500).json({ error: "Failed to fetch donations" });
  }
});

// ── POST /doctor/donations/:id/thank-you ──────────────────────
router.post("/donations/:id/thank-you", requireDoctor, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "invalid_id" }); return; }
  const [row] = await db.select().from(donationsTable).where(and(eq(donationsTable.id, id), eq(donationsTable.deleteColumn, 0)));
  if (!row) { res.status(404).json({ error: "not_found" }); return; }
  if (row.status !== "verified") {
    res.status(400).json({ error: "not_received", message: "Cannot send thank-you email for a donation that is not marked as Received." });
    return;
  }
  if (!row.patientEmail) { res.status(400).json({ error: "no_email", message: "No email address on record for this donation." }); return; }
  if (row.thankYouSent) { res.json({ success: true, skipped: true }); return; }
  try {
    const { sendDonationThankYou } = await import("../lib/email");
    const donationDate = row.createdAt
      ? row.createdAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" })
      : new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });
    await sendDonationThankYou({
      to: row.patientEmail,
      name: row.patientName || "Patient",
      patientCode: row.patientCode || null,
      amount: row.amount,
      lastSixDigits: row.lastSixDigits || "",
      donationDate,
    });
    await db.update(donationsTable).set({ thankYouSent: true }).where(and(eq(donationsTable.id, id), eq(donationsTable.deleteColumn, 0)));
    broadcastDonationUpdate({ id, status: row.status, thankYouSent: true });
    res.json({ success: true });
  } catch (err) {
    console.error("Doctor donation thank-you error:", err);
    res.status(500).json({ error: "email_failed", message: (err as Error).message });
  }
});

// ── PATCH /doctor/donations/:id/verify ────────────────────────
router.patch("/donations/:id/verify", requireDoctor, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "invalid_id" }); return; }
  const { verified } = req.body;
  const newStatus = verified ? "verified" : "pending";
  await db.update(donationsTable)
    .set({ status: newStatus })
    .where(and(eq(donationsTable.id, id), eq(donationsTable.deleteColumn, 0)));
  broadcastDonationUpdate({ id, status: newStatus });
  res.json({ success: true });
});

// ── GET /api/doctor/prescriptions/:id/download ─────────────────
router.get("/prescriptions/:id/download", requireDoctor, async (req, res) => {
  const requestedFileName = typeof req.query.filename === "string" ? req.query.filename : undefined;
  await streamPrescriptionDownload({
    rxIdOrApptParam: String(req.params.id),
    requestedFileName,
    res,
  });
});

// ── GET /api/doctor/appointments/:type/:id/prescription/download 
router.get("/appointments/:type/:id/prescription/download", requireDoctor, async (req, res) => {
  const requestedFileName = typeof req.query.filename === "string" ? req.query.filename : undefined;
  await streamPrescriptionDownload({
    rxIdOrApptParam: `appt-${String(req.params.type)}-${String(req.params.id)}`,
    requestedFileName,
    res,
  });
});

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export default router;
