import { Router, Response } from "express";
import { db, patientsTable, appointmentsTable, loginTokensTable, siteSettingsTable, patientDocumentsTable, donationsTable, onlineAppointmentsTable } from "@workspace/db";
import { eq, and, desc, ne, isNotNull, sql } from "drizzle-orm";
import {
  createPatientSession, deletePatientSession, requirePatient,
  hashPassword, verifyPassword,
} from "../lib/patient-auth";
import { sendMagicLink, sendPasswordResetEmail } from "../lib/email";
import { broadcastNewDonation } from "../lib/donationSse";
import { randomBytes } from "crypto";
import { z } from "zod/v4";
import { notifyNewAppointment } from "./appointments";
import { normalizePatientEmail, validatePatientPhone } from "@workspace/patient-contact";
import { normalizeVerificationEmail } from "../lib/verification";

const router = Router();

// ── Patient SSE clients (keyed by patientId) ──────────────────
type PatientSseClient = { patientId: number; res: Response };
export const patientSseClients = new Set<PatientSseClient>();

export function notifyPatientJoinEnabled(patientId: number, apptId: number, roomName: string, guestToken?: string) {
  const payload = `event: join_enabled\ndata: ${JSON.stringify({ apptId, roomName, guestToken: guestToken ?? null })}\n\n`;
  for (const client of patientSseClients) {
    if (client.patientId === patientId) {
      try { client.res.write(payload); } catch { patientSseClients.delete(client); }
    }
  }
}

export function notifyPatientSessionEnded(patientId: number, apptId: number, qrObjectPath: string | null) {
  const payload = `event: session_ended\ndata: ${JSON.stringify({ apptId, qrObjectPath })}\n\n`;
  for (const client of patientSseClients) {
    if (client.patientId === patientId) {
      try { client.res.write(payload); } catch { patientSseClients.delete(client); }
    }
  }
}

export function notifyPatientPermissionRequest(patientId: number, apptId: number) {
  const payload = `event: permission_request\ndata: ${JSON.stringify({ apptId })}\n\n`;
  for (const client of patientSseClients) {
    if (client.patientId === patientId) {
      try { client.res.write(payload); } catch { patientSseClients.delete(client); }
    }
  }
}

// ── Patient ID counter helper ─────────────────────────────────
async function assignPatientCode(): Promise<string | null> {
  try {
    const [settings] = await db.select().from(siteSettingsTable);
    if (!settings) return null;

    let prefix = settings.patientIdPrefix || "A";
    let num = (settings.patientIdCurrentNumber || 0) + 1;

    // Overflow: if num > 999, increment prefix letter and reset
    if (num > 999) {
      const nextChar = String.fromCharCode(prefix.charCodeAt(0) + 1);
      if (nextChar > "Z") return null; // Exhausted all codes
      prefix = nextChar;
      num = 1;
    }

    const code = `${prefix}${num.toString().padStart(3, "0")}`;

    await db.update(siteSettingsTable)
      .set({ patientIdPrefix: prefix, patientIdCurrentNumber: num, updatedAt: new Date() })
      .where(eq(siteSettingsTable.id, settings.id));

    return code;
  } catch {
    return null;
  }
}

function cookieOpts() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
}

function serializePatient(p: any) {
  return {
    id: p.id,
    patientCode: p.patientCode ?? null,
    name: p.name,
    email: p.email,
    phone: p.phone,
    avatarUrl: p.avatarUrl,
    emailVerified: p.emailVerified,
    createdAt: p.createdAt,
  };
}

function getFrontendUrl(req: any) {
  // In a deployed environment, REPLIT_DEPLOYMENT=1 — never use the dev preview URL
  if (process.env.REPLIT_DEPLOYMENT === "1") {
    return process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  }
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (domain) return `https://${domain}`;
  return `${req.protocol}://${req.get("host")}`;
}

// ── Register ───────────────────────────────────────────────────
const RegisterBody = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  countryCode: z.string().trim().min(1),
  password: z.string().min(6),
});

router.post("/auth/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "validation_error",
      message: "Name, email, country, phone number, and a password (min 6 chars) are required.",
    });
    return;
  }
  const { name, password } = parsed.data;
  const email = normalizePatientEmail(parsed.data.email);
  if (!email) {
    res.status(400).json({ error: "invalid_email", message: "Please enter a valid email address." });
    return;
  }

  const phoneValidation = validatePatientPhone(parsed.data.phone, parsed.data.countryCode);
  if (!phoneValidation.valid) {
    res.status(400).json({ error: phoneValidation.error, message: phoneValidation.message });
    return;
  }
  const phone = phoneValidation.e164;

  const [existingEmail] = await db.select().from(patientsTable)
    .where(sql`lower(${patientsTable.email}) = ${email}`);
  if (existingEmail) {
    res.status(409).json({ error: "email_taken", message: "An account with this email already exists. Please sign in." });
    return;
  }

  if (phone) {
    const [existingPhone] = await db.select().from(patientsTable).where(eq(patientsTable.phone, phone));
    if (existingPhone) {
      res.status(409).json({ error: "phone_taken", message: "An account with this phone number already exists. Please sign in." });
      return;
    }
  }

  const passwordHash = await hashPassword(password);
  const patientCode = await assignPatientCode();

  const [patient] = await db.insert(patientsTable).values({
    name, email, phone, passwordHash, emailVerified: false,
    patientCode: patientCode ?? undefined,
  }).returning();

  // Send verification email in the background (non-blocking)
  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(loginTokensTable).values({
    token,
    patientId: patient.id,
    nextUrl: "/portal/dashboard",
    verificationEmail: normalizeVerificationEmail(email),
    expiresAt,
    used: false,
  });
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
  const { password } = parsed.data;
  const email = parsed.data.email.toLowerCase().trim();

  const [patient] = await db.select().from(patientsTable)
    .where(sql`lower(${patientsTable.email}) = ${email}`);
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

  const row = await db.transaction(async (tx) => {
    const [consumedToken] = await tx.update(loginTokensTable)
      .set({ used: true })
      .where(and(
        eq(loginTokensTable.token, token),
        eq(loginTokensTable.used, false),
        ne(loginTokensTable.nextUrl, "__password_reset__"),
        isNotNull(loginTokensTable.verificationEmail),
        sql`${loginTokensTable.expiresAt} > NOW()`,
      ))
      .returning();
    if (!consumedToken?.verificationEmail) return null;

    const [verifiedPatient] = await tx.update(patientsTable)
      .set({ emailVerified: true })
      .where(and(
        eq(patientsTable.id, consumedToken.patientId),
        sql`lower(trim(${patientsTable.email})) = ${normalizeVerificationEmail(consumedToken.verificationEmail)}`,
      ))
      .returning({ id: patientsTable.id });

    return verifiedPatient ? consumedToken : null;
  });
  if (!row) {
    res.redirect(`${frontendUrl}/portal?error=expired_token`); return;
  }

  const sessionToken = await createPatientSession(row.patientId);
  res.cookie("patient_session", sessionToken, cookieOpts());
  res.redirect(`${frontendUrl}${row.nextUrl ?? "/portal/dashboard"}`);
});

// ── Resend Verification Email ─────────────────────────────────
router.post("/auth/resend-verification", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  if (patient.emailVerified) {
    res.status(400).json({ error: "already_verified", message: "Your email is already verified." });
    return;
  }

  // Invalidate old tokens
  await db.update(loginTokensTable).set({ used: true }).where(eq(loginTokensTable.patientId, patient.id));

  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(loginTokensTable).values({
    token,
    patientId: patient.id,
    nextUrl: "/portal/dashboard",
    verificationEmail: normalizeVerificationEmail(patient.email),
    expiresAt,
    used: false,
  });
  const verifyUrl = `${getFrontendUrl(req)}/api/patient/auth/verify?token=${token}`;
  try {
    const sent = await sendMagicLink({
      to: patient.email,
      name: patient.name,
      verifyUrl,
      isNewAccount: true,
    });
    if (!sent) {
      res.status(503).json({
        error: "email_delivery_failed",
        message: "The verification link was created, but the email could not be sent. Check SMTP settings and try again.",
      });
      return;
    }
  } catch (error) {
    console.error("Patient resend verification email error:", error);
    res.status(503).json({
      error: "email_delivery_failed",
      message: "The verification link was created, but the email could not be sent. Check SMTP settings and try again.",
    });
    return;
  }

  res.json({ success: true, message: `Verification email sent to ${patient.email}` });
});

// ── Logout ─────────────────────────────────────────────────────
router.post("/logout", async (req, res) => {
  const token = req.cookies?.patient_session;
  if (token) await deletePatientSession(token);
  res.clearCookie("patient_session");
  res.json({ success: true });
});

// ── Forgot Password ────────────────────────────────────────────
router.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "validation_error", message: "Email is required." });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const [patient] = await db.select().from(patientsTable)
    .where(sql`lower(${patientsTable.email}) = ${normalizedEmail}`);

  // Always respond success to prevent email enumeration
  if (!patient) {
    res.json({ success: true });
    return;
  }

  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await db.insert(loginTokensTable).values({
    token, patientId: patient.id, nextUrl: "__password_reset__", expiresAt, used: false,
  });

  const resetUrl = `${getFrontendUrl(req)}/portal/login?reset_token=${token}`;
  sendPasswordResetEmail({ to: normalizedEmail, name: patient.name, resetUrl }).catch(console.error);

  res.json({ success: true });
});

// ── Reset Password ─────────────────────────────────────────────
router.post("/auth/reset-password", async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || typeof token !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "validation_error", message: "Token and new password are required." });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "weak_password", message: "Password must be at least 6 characters." });
    return;
  }

  const [row] = await db.select().from(loginTokensTable).where(
    and(eq(loginTokensTable.token, token), eq(loginTokensTable.nextUrl, "__password_reset__"))
  );

  if (!row || row.used || row.expiresAt < new Date()) {
    res.status(400).json({ error: "invalid_token", message: "This reset link is invalid or has expired. Please request a new one." });
    return;
  }

  const passwordHash = await hashPassword(password);
  await db.update(patientsTable).set({ passwordHash }).where(eq(patientsTable.id, row.patientId));
  await db.update(loginTokensTable).set({ used: true }).where(eq(loginTokensTable.token, token));

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  const sessionToken = await createPatientSession(row.patientId);
  res.cookie("patient_session", sessionToken, cookieOpts());
  res.json({ success: true, patient: patient ? serializePatient(patient) : null });
});

// ── Me ─────────────────────────────────────────────────────────
router.get("/me", requirePatient, (req, res) => {
  res.json(serializePatient((req as any).patient));
});

// ── SSE — real-time join notifications ────────────────────────
router.get("/sse", requirePatient, (req: any, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(": connected\n\n");

  const client: PatientSseClient = { patientId: req.patient.id, res };
  patientSseClients.add(client);

  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(heartbeat); }
  }, 15000);

  req.on("close", () => {
    patientSseClients.delete(client);
    clearInterval(heartbeat);
  });
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

// ── GET /api/patient/documents — list saved documents ─────────
router.get("/documents", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  const docs = await db
    .select()
    .from(patientDocumentsTable)
    .where(eq(patientDocumentsTable.patientId, patient.id))
    .orderBy(desc(patientDocumentsTable.createdAt));
  res.json(docs.map(d => ({
    id: d.id,
    name: d.name,
    objectPath: d.objectPath,
    contentType: d.contentType,
    size: d.size,
    createdAt: d.createdAt?.toISOString() ?? null,
  })));
});

// ── POST /api/patient/documents — save a document reference ───
router.post("/documents", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  const { name, objectPath, contentType, size } = req.body;
  if (!name || !objectPath || !contentType || typeof size !== "number") {
    res.status(400).json({ error: "missing_fields" }); return;
  }
  const [doc] = await db.insert(patientDocumentsTable).values({
    patientId: patient.id,
    name,
    objectPath,
    contentType,
    size,
  }).returning();
  res.json({ id: doc.id, name: doc.name, objectPath: doc.objectPath, contentType: doc.contentType, size: doc.size, createdAt: doc.createdAt?.toISOString() ?? null });
});

// ── DELETE /api/patient/documents/:id — delete a saved doc ────
router.delete("/documents/:id", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  const id = parseInt(req.params.id);
  const [doc] = await db
    .select()
    .from(patientDocumentsTable)
    .where(and(eq(patientDocumentsTable.id, id), eq(patientDocumentsTable.patientId, patient.id)));
  if (!doc) { res.status(404).json({ error: "not_found" }); return; }
  await db.delete(patientDocumentsTable).where(eq(patientDocumentsTable.id, id));
  res.json({ ok: true });
});

// ── POST /api/patient/donations — record a donation ───────────
router.post("/donations", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  const { amount, lastSixDigits, appointmentId } = req.body;

  if (!amount || typeof amount !== "string" || amount.trim() === "") {
    res.status(400).json({ error: "amount_required" }); return;
  }
  if (!lastSixDigits || typeof lastSixDigits !== "string" || lastSixDigits.trim().length < 4) {
    res.status(400).json({ error: "last_six_required" }); return;
  }

  const apptId = appointmentId ? parseInt(appointmentId) : null;

  const [donation] = await db.insert(donationsTable).values({
    patientId: patient.id,
    appointmentId: apptId && !isNaN(apptId) ? apptId : null,
    patientCode: patient.patientCode ?? null,
    patientName: patient.name,
    patientEmail: patient.email,
    amount: amount.trim(),
    lastSixDigits: lastSixDigits.trim().slice(-6),
    status: "pending",
    thankYouSent: false,
  }).returning();

  // Notify doctor and admin portals in real time
  broadcastNewDonation({
    ...donation,
    createdAt: donation.createdAt?.toISOString() ?? new Date().toISOString(),
  });

  res.json(donation);
});

export default router;
