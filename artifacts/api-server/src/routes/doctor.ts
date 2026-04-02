import { Router } from "express";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import {
  db,
  siteSettingsTable,
  doctorSessionsTable,
  onlineAppointmentsTable,
  onlineSlotsTable,
  onlineSlotSessionsTable,
  patientsTable,
  prescriptionsTable,
  appointmentsTable,
} from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import type { MedicineRow } from "@workspace/db";

const router = Router();
const COOKIE = "doctor_session";
const SESSION_DAYS = 7;

// ── Auth helpers ──────────────────────────────────────────────
async function createDoctorSession(): Promise<string> {
  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(doctorSessionsTable).values({ sessionToken: token, expiresAt });
  return token;
}

async function verifyDoctorSession(token: string): Promise<boolean> {
  const [session] = await db
    .select()
    .from(doctorSessionsTable)
    .where(eq(doctorSessionsTable.sessionToken, token));
  if (!session || session.expiresAt < new Date()) return false;
  return true;
}

async function requireDoctor(req: any, res: any, next: any) {
  const token = req.cookies?.[COOKIE];
  if (!token) { res.status(401).json({ error: "unauthorized" }); return; }
  const valid = await verifyDoctorSession(token);
  if (!valid) { res.status(401).json({ error: "unauthorized" }); return; }
  next();
}

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

  const token = await createDoctorSession();
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
// Returns all online appointments with slot + patient details + prescription
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
      avatarUrl: r.patient.avatarUrl,
    },
    prescription: r.prescription ? {
      id: r.prescription.id,
      medicines: r.prescription.medicines,
      doctorNotes: r.prescription.doctorNotes,
      createdAt: r.prescription.createdAt.toISOString(),
      updatedAt: r.prescription.updatedAt.toISOString(),
    } : null,
  })));
});

// ── PUT /api/doctor/appointments/:id/prescription ─────────────
const PrescriptionBody = z.object({
  medicines: z.array(z.object({ medicine: z.string(), instructions: z.string() })),
});

router.put("/appointments/:id/prescription", requireDoctor, async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = PrescriptionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation_error" }); return; }

  const [appt] = await db.select().from(onlineAppointmentsTable).where(eq(onlineAppointmentsTable.id, id));
  if (!appt) { res.status(404).json({ error: "not_found" }); return; }

  const existing = await db.select().from(prescriptionsTable).where(eq(prescriptionsTable.onlineAppointmentId, id));

  if (existing.length > 0) {
    const [updated] = await db
      .update(prescriptionsTable)
      .set({ medicines: parsed.data.medicines as MedicineRow[], updatedAt: new Date() })
      .where(eq(prescriptionsTable.onlineAppointmentId, id))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db
      .insert(prescriptionsTable)
      .values({ onlineAppointmentId: id, medicines: parsed.data.medicines as MedicineRow[] })
      .returning();
    // Mark appointment completed
    await db.update(onlineAppointmentsTable).set({ status: "completed" }).where(eq(onlineAppointmentsTable.id, id));
    res.json(created);
  }
});

// ── PUT /api/doctor/appointments/:id/notes ────────────────────
router.put("/appointments/:id/notes", requireDoctor, async (req, res) => {
  const id = parseInt(req.params.id);
  const { notes } = req.body;

  const existing = await db.select().from(prescriptionsTable).where(eq(prescriptionsTable.onlineAppointmentId, id));

  if (existing.length > 0) {
    const [updated] = await db
      .update(prescriptionsTable)
      .set({ doctorNotes: notes ?? null, updatedAt: new Date() })
      .where(eq(prescriptionsTable.onlineAppointmentId, id))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db
      .insert(prescriptionsTable)
      .values({ onlineAppointmentId: id, medicines: [], doctorNotes: notes ?? null })
      .returning();
    res.json(created);
  }
});

// ── GET /api/doctor/all-appointments — Both types ────────────
// Returns online (confirmed) + offline (active) appointments with type field
router.get("/all-appointments", requireDoctor, async (_req, res) => {
  // Online: only confirmed (admin-approved) appointments
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
    .where(inArray(onlineAppointmentsTable.status, ["confirmed", "completed"]))
    .orderBy(desc(onlineSlotsTable.date), onlineSlotsTable.startTime);

  // Offline: confirmed / arrived / reschedule_accepted / completed (active appointments)
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
    meetingLink: r.appt.meetingLink ?? null,
    createdAt: r.appt.createdAt.toISOString(),
    date: r.slot.date,
    timeLabel: `${fmtTime(r.slot.startTime)} – ${fmtTime(r.slot.endTime)}`,
    slotId: r.slot.id,
    patient: {
      id: r.patient.id,
      name: r.patient.name,
      email: r.patient.email,
      phone: r.patient.phone ?? null,
    },
    prescription: r.prescription ? {
      id: r.prescription.id,
      medicines: r.prescription.medicines,
      doctorNotes: r.prescription.doctorNotes ?? null,
      updatedAt: r.prescription.updatedAt.toISOString(),
    } : null,
  }));

  const offline = offlineRows.map((r) => ({
    id: r.id,
    type: "offline" as const,
    status: r.status,
    reason: r.reason ?? null,
    documents: [] as any[],
    meetingLink: null,
    createdAt: r.createdAt?.toISOString() ?? "",
    date: r.date,
    timeLabel: r.timeSlot,
    patient: {
      id: null,
      name: r.patientName,
      email: r.patientEmail ?? null,
      phone: r.patientPhone,
    },
    prescription: null,
    notes: r.notes ?? null,
  }));

  res.json({ online, offline });
});

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

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

export default router;
