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
import { eq, desc, inArray } from "drizzle-orm";
import { requireDoctor, verifyDoctorSession } from "../lib/doctor-auth";
import { notifyPatientSessionEnded } from "./patient";
import { addDonationSseClient, broadcastDonationUpdate } from "../lib/donationSse";

const router = Router();
const COOKIE = "doctor_session";
const SESSION_DAYS = 7;

// ── POST /api/doctor/login ────────────────────────────────────
router.post("/login", async (req, res) => {
  const { password } = req.body;
  if (!password) { res.status(400).json({ error: "password_required" }); return; }

  const [settings] = await db.select().from(siteSettingsTable);
  if (!settings?.doctorPasswordHash) {
    res.status(401).json({ error: "not_configured", message: "Doctor portal is not yet configured. Ask the admin to set the doctor password in Settings." });
    return;
  }

  const ok = await bcrypt.compare(password, settings.doctorPasswordHash);
  if (!ok) { res.status(401).json({ error: "invalid_password" }); return; }

  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(doctorSessionsTable).values({ sessionToken: token, expiresAt });

  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
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
    },
    prescription: r.prescription ? {
      id: r.prescription.id,
      photoObjectPath: r.prescription.photoObjectPath ?? null,
      notes: r.prescription.notes ?? null,
      updatedAt: r.prescription.updatedAt.toISOString(),
    } : null,
  })));
});

// ── GET /api/doctor/all-appointments — Both types ────────────
router.get("/all-appointments", requireDoctor, async (_req, res) => {
  const onlineRows = await db
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
    .where(inArray(onlineAppointmentsTable.status, ["pending", "confirmed", "completed"]))
    .orderBy(desc(onlineSlotsTable.date), onlineSlotsTable.startTime);

  const offlineRows = await db
    .select()
    .from(appointmentsTable)
    .where(inArray(appointmentsTable.status, ["confirmed", "arrived", "reschedule_accepted", "completed"]))
    .orderBy(desc(appointmentsTable.date), desc(appointmentsTable.createdAt));

  const online = onlineRows.map((r) => ({
    id: r.appt.id,
    type: "online" as const,
    status: r.appt.status,
    reason: r.appt.reason ?? null,
    documents: r.appt.documents,
    joinEnabled: r.appt.joinEnabled,
    createdAt: r.appt.createdAt.toISOString(),
    date: r.slot.date,
    timeLabel: `${fmtTime(r.slot.startTime)} – ${fmtTime(r.slot.endTime)}`,
    slotId: r.slot.id,
    patient: {
      id: r.patient.id,
      patientCode: r.patient.patientCode ?? null,
      name: r.patient.name,
      email: r.patient.email,
      phone: r.patient.phone ?? null,
    },
    prescription: r.prescription ? {
      id: r.prescription.id,
      photoObjectPath: r.prescription.photoObjectPath ?? null,
      notes: r.prescription.notes ?? null,
      updatedAt: r.prescription.updatedAt.toISOString(),
    } : null,
  }));

  const offline = offlineRows.map((r) => ({
    id: r.id,
    type: "offline" as const,
    status: r.status,
    reason: r.reason ?? null,
    documents: [] as any[],
    joinEnabled: false,
    createdAt: r.createdAt?.toISOString() ?? "",
    date: r.date,
    timeLabel: r.timeSlot,
    patient: {
      id: null,
      patientCode: null,
      name: r.patientName,
      email: r.patientEmail ?? null,
      phone: r.patientPhone,
    },
    prescription: null,
    notes: r.notes ?? null,
  }));

  res.json({ online, offline });
});

// ── PATCH /api/doctor/offline-appointments/:id/done ───────────
router.patch("/offline-appointments/:id/done", requireDoctor, async (req, res) => {
  const id = parseInt(req.params.id);

  const [appt] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, id));
  if (!appt) { res.status(404).json({ error: "not_found" }); return; }

  const [updated] = await db
    .update(appointmentsTable)
    .set({ status: "completed" })
    .where(eq(appointmentsTable.id, id))
    .returning();

  res.json({ ...updated, createdAt: updated.createdAt?.toISOString() });
});

// ── POST /api/doctor/online-appointments/:id/complete ─────────
// Called by doctor portal when video call ends — marks appointment completed
router.post("/online-appointments/:id/complete", requireDoctor, async (req, res) => {
  const id = parseInt(req.params.id);

  const [appt] = await db
    .select({ appt: onlineAppointmentsTable })
    .from(onlineAppointmentsTable)
    .where(eq(onlineAppointmentsTable.id, id))
    .then(r => r.map(x => x.appt));

  if (!appt) { res.status(404).json({ error: "not_found" }); return; }
  if (appt.status === "completed") { res.json({ ok: true, alreadyDone: true }); return; }

  const [settings] = await db.select().from(siteSettingsTable);

  await db
    .update(onlineAppointmentsTable)
    .set({ joinEnabled: false, status: "completed" })
    .where(eq(onlineAppointmentsTable.id, id));

  notifyPatientSessionEnded(appt.patientId, id, settings?.phonepeQrObjectPath ?? null);

  res.json({ ok: true });
});

// ── GET /api/doctor/patients — All registered patients with docs + appt history ──
router.get("/patients", requireDoctor, async (_req, res) => {
  const [patients, docs, onlineRows] = await Promise.all([
    db.select().from(patientsTable).orderBy(patientsTable.name),
    db.select().from(patientDocumentsTable),
    db
      .select({
        appt: onlineAppointmentsTable,
        slot: onlineSlotsTable,
        prescription: prescriptionsTable,
      })
      .from(onlineAppointmentsTable)
      .innerJoin(onlineSlotsTable, eq(onlineAppointmentsTable.slotId, onlineSlotsTable.id))
      .leftJoin(prescriptionsTable, eq(prescriptionsTable.onlineAppointmentId, onlineAppointmentsTable.id))
      .orderBy(desc(onlineSlotsTable.date), onlineSlotsTable.startTime),
  ]);

  res.json(patients.map(p => ({
    id: p.id,
    patientCode: p.patientCode ?? null,
    name: p.name,
    email: p.email,
    phone: p.phone ?? null,
    createdAt: p.createdAt.toISOString(),
    documents: docs
      .filter(d => d.patientId === p.id)
      .map(d => ({ id: d.id, name: d.name, objectPath: d.objectPath, contentType: d.contentType, size: d.size })),
    appointments: onlineRows
      .filter(r => r.appt.patientId === p.id)
      .map(r => ({
        id: r.appt.id,
        status: r.appt.status,
        date: r.slot.date,
        timeLabel: `${fmtTime(r.slot.startTime)} – ${fmtTime(r.slot.endTime)}`,
        reason: r.appt.reason ?? null,
        joinEnabled: r.appt.joinEnabled,
        documents: r.appt.documents as any[],
        prescription: r.prescription ? {
          photoObjectPath: r.prescription.photoObjectPath ?? null,
          notes: r.prescription.notes ?? null,
          updatedAt: r.prescription.updatedAt.toISOString(),
        } : null,
      })),
  })));
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

// ── GET /doctor/donations ──────────────────────────────────────
router.get("/donations", requireDoctor, async (_req, res) => {
  try {
    const rows = await db.select().from(donationsTable).orderBy(desc(donationsTable.createdAt));
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
  const [row] = await db.select().from(donationsTable).where(eq(donationsTable.id, id));
  if (!row) { res.status(404).json({ error: "not_found" }); return; }
  if (row.thankYouSent) { res.json({ success: true, skipped: true }); return; }
  try {
    const { sendDonationThankYou } = await import("../lib/email");
    await sendDonationThankYou({
      name: row.patientName || "Patient",
      email: row.patientEmail || "",
      amount: row.amount,
    });
    await db.update(donationsTable).set({ thankYouSent: true }).where(eq(donationsTable.id, id));
    broadcastDonationUpdate({ id, status: row.status, thankYouSent: true });
    res.json({ success: true });
  } catch (err) {
    console.error("Doctor donation thank-you error:", err);
    res.status(500).json({ error: "email_failed" });
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
    .where(eq(donationsTable.id, id));
  broadcastDonationUpdate({ id, status: newStatus });
  res.json({ success: true });
});

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export default router;
