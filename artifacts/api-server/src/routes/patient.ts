import { Router } from "express";
import { db, patientsTable, appointmentsTable, loginTokensTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import {
  createPatientSession, deletePatientSession, requirePatient,
  hashPassword, verifyPassword,
} from "../lib/patient-auth";
import { sendMagicLink } from "../lib/email";
import { randomBytes } from "crypto";
import { z } from "zod/v4";
import { notifyNewAppointment } from "./appointments";

const router = Router();

function cookieOpts() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
}

function serializePatient(p: any) {
  return { id: p.id, name: p.name, email: p.email, phone: p.phone, avatarUrl: p.avatarUrl, emailVerified: p.emailVerified, createdAt: p.createdAt };
}

function getFrontendUrl(req: any) {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (domain) return `https://${domain}`;
  return `${req.protocol}://${req.get("host")}`;
}

// ── Register ───────────────────────────────────────────────────
const RegisterBody = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(6),
});

router.post("/auth/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: "Name, valid email, and a password (min 6 chars) are required." });
    return;
  }
  const { name, email, phone, password } = parsed.data;

  const [existing] = await db.select().from(patientsTable).where(eq(patientsTable.email, email));
  if (existing) {
    res.status(409).json({ error: "email_taken", message: "An account with this email already exists. Please sign in." });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [patient] = await db.insert(patientsTable).values({
    name, email, phone: phone ?? null, passwordHash, emailVerified: false,
  }).returning();

  // Send verification email in the background (non-blocking)
  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(loginTokensTable).values({ token, patientId: patient.id, nextUrl: "/portal/dashboard", expiresAt, used: false });
  const verifyUrl = `${getFrontendUrl(req)}/api/patient/auth/verify?token=${token}`;
  sendMagicLink({ to: email, name, verifyUrl, isNewAccount: true }).catch(() => {});

  // Log them in right away
  const sessionToken = await createPatientSession(patient.id);
  res.cookie("patient_session", sessionToken, cookieOpts());
  res.status(201).json(serializePatient(patient));
});

// ── Login ──────────────────────────────────────────────────────
const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: "Email and password are required." });
    return;
  }
  const { email, password } = parsed.data;

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.email, email));
  if (!patient || !patient.passwordHash) {
    res.status(401).json({ error: "invalid_credentials", message: "Incorrect email or password." });
    return;
  }

  const valid = await verifyPassword(password, patient.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "invalid_credentials", message: "Incorrect email or password." });
    return;
  }

  const sessionToken = await createPatientSession(patient.id);
  res.cookie("patient_session", sessionToken, cookieOpts());
  res.json(serializePatient(patient));
});

// ── Google OAuth status (disabled) ─────────────────────────────
router.get("/auth/google/status", (_req, res) => {
  res.json({ enabled: false });
});

// ── Verify Email Token (GET — redirect) ────────────────────────
router.get("/auth/verify", async (req, res) => {
  const frontendUrl = getFrontendUrl(req);
  const token = req.query.token as string | undefined;
  if (!token) { res.redirect(`${frontendUrl}/portal?error=invalid_token`); return; }

  const [row] = await db.select().from(loginTokensTable).where(eq(loginTokensTable.token, token));
  if (!row || row.used || row.expiresAt < new Date()) {
    res.redirect(`${frontendUrl}/portal?error=expired_token`); return;
  }

  await db.update(loginTokensTable).set({ used: true }).where(eq(loginTokensTable.id, row.id));
  await db.update(patientsTable).set({ emailVerified: true }).where(eq(patientsTable.id, row.patientId));

  const sessionToken = await createPatientSession(row.patientId);
  res.cookie("patient_session", sessionToken, cookieOpts());
  res.redirect(`${frontendUrl}${row.nextUrl ?? "/portal/dashboard"}`);
});

// ── Logout ─────────────────────────────────────────────────────
router.post("/logout", async (req, res) => {
  const token = req.cookies?.patient_session;
  if (token) await deletePatientSession(token);
  res.clearCookie("patient_session");
  res.json({ success: true });
});

// ── Me ─────────────────────────────────────────────────────────
router.get("/me", requirePatient, (req, res) => {
  res.json(serializePatient((req as any).patient));
});

// ── My Appointments ───────────────────────────────────────────
router.get("/appointments", requirePatient, async (req, res) => {
  const patient = (req as any).patient;
  const appts = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.patientId, patient.id))
    .orderBy(desc(appointmentsTable.date));
  res.json(appts.map((a) => ({ ...a, createdAt: a.createdAt?.toISOString() ?? null, arrivedAt: a.arrivedAt?.toISOString() ?? null })));
});

// ── Book Appointment ──────────────────────────────────────────
const BookBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeSlot: z.string(),
  reason: z.string().optional(),
  patientName: z.string().min(1),
  patientPhone: z.string().min(6),
});

router.post("/appointments", requirePatient, async (req, res) => {
  const patient = (req as any).patient;
  const parsed = BookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: "Invalid input" });
    return;
  }
  const { date, timeSlot, reason, patientName, patientPhone } = parsed.data;

  const existing = await db.select().from(appointmentsTable).where(
    and(eq(appointmentsTable.date, date), eq(appointmentsTable.timeSlot, timeSlot), eq(appointmentsTable.status, "confirmed"))
  );
  if (existing.length > 0) {
    res.status(409).json({ error: "slot_unavailable", message: "This time slot is already taken" });
    return;
  }

  const [appt] = await db.insert(appointmentsTable).values({
    patientId: patient.id,
    patientName,
    patientPhone,
    patientEmail: patient.email,
    date,
    timeSlot,
    reason: reason ?? null,
    status: "pending",
  }).returning();

  const serialized = { ...appt, createdAt: appt.createdAt?.toISOString() ?? null, arrivedAt: null };
  notifyNewAppointment(serialized);

  res.status(201).json(serialized);
});

// ── Confirm Follow-up ─────────────────────────────────────────
router.patch("/appointments/:id/confirm-followup", requirePatient, async (req, res) => {
  const patient = (req as any).patient;
  const id = parseInt(req.params.id);
  const [appt] = await db.select().from(appointmentsTable).where(
    and(eq(appointmentsTable.id, id), eq(appointmentsTable.patientId, patient.id))
  );
  if (!appt) { res.status(404).json({ error: "not_found" }); return; }

  const [updated] = await db.update(appointmentsTable)
    .set({ followUpConfirmed: true })
    .where(eq(appointmentsTable.id, id))
    .returning();
  res.json({ ...updated, createdAt: updated.createdAt?.toISOString() ?? null });
});

// ── Choose Reschedule Date ────────────────────────────────────
router.patch("/appointments/:id/choose-reschedule", requirePatient, async (req, res) => {
  const patient = (req as any).patient;
  const id = parseInt(req.params.id);
  const { chosenDate } = req.body;
  if (!chosenDate) { res.status(400).json({ error: "missing_date" }); return; }

  const [appt] = await db.select().from(appointmentsTable).where(
    and(eq(appointmentsTable.id, id), eq(appointmentsTable.patientId, patient.id))
  );
  if (!appt || appt.status !== "reschedule_proposed") {
    res.status(400).json({ error: "invalid_state" }); return;
  }
  const dates: string[] = JSON.parse(appt.rescheduleDates ?? "[]");
  if (!dates.includes(chosenDate)) {
    res.status(400).json({ error: "invalid_date" }); return;
  }

  const [updated] = await db.update(appointmentsTable)
    .set({ rescheduleChosen: chosenDate, status: "reschedule_accepted" })
    .where(eq(appointmentsTable.id, id))
    .returning();
  res.json({ ...updated, createdAt: updated.createdAt?.toISOString() ?? null });
});

export default router;
