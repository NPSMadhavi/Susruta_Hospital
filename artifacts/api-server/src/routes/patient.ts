import { Router, Response } from "express";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { db, patientsTable, appointmentsTable, prescriptionsTable, loginTokensTable, siteSettingsTable, patientDocumentsTable, donationsTable, onlineAppointmentsTable, patientOtpsTable, onlineSlotsTable, offlineQrTokensTable, customDayTimingsTable, accountDeletionRequestsTable, patientSessionsTable } from "@workspace/db";
import { eq, and, desc, ne, isNotNull, sql, or, inArray } from "drizzle-orm";
import { formatDeletionRequest, syncExpiredDeletionRequests, CANCELLATION_PERIOD_MS } from "../lib/deletion-service";
import {
  createPatientSession, deletePatientSession, requirePatient,
  verifyPatientSession, hashPassword, verifyPassword,
} from "../lib/patient-auth";
import { sendMagicLink, sendPasswordResetEmail, sendProfileEmailOtp, sendProfilePhoneOtp, sendEmailChangeNotification, sendAppointmentAckEmail } from "../lib/email";
import { sendMobileOtp } from "../lib/sms";
import { broadcastNewDonation } from "../lib/donationSse";
import { randomBytes, randomInt, createHash, timingSafeEqual } from "crypto";
import { z } from "zod/v4";
import { notifyNewAppointment, notifyAdminNewDonation, notifyAdminNewAccountDeletionRequest, notifyAdminAccountDeletionRequestCancelled } from "./appointments";
import { extractClinicalNotes } from "./doctor";
import { normalizePatientEmail, validatePatientPhone, detectCountryFromPhone, validatePatientPassword } from "@workspace/patient-contact";
import { normalizeVerificationEmail } from "../lib/verification";
import { addDirectCallPatientClient } from "../lib/directCallSse";
import { registerNewPatientWithNextId } from "../lib/patient-id";
import { streamPrescriptionDownload, findExistingFile, getPrescriptionBufferAndName } from "../lib/prescription-service";
import { verifyRecaptcha } from "../lib/recaptcha";
import { parseTimeString, generateTimeSlots } from "./availability";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorageService = new ObjectStorageService();

const OTP_PEPPER = process.env.UNSUBSCRIBE_SECRET || "susruta-otp-pepper-secure-2026";

function hashOtp(patientId: number, targetValue: string, otp: string): string {
  return createHash("sha256")
    .update(`${patientId}:${targetValue.toLowerCase().trim()}:${otp.trim()}:${OTP_PEPPER}`)
    .digest("hex");
}

function verifyOtpHash(patientId: number, targetValue: string, otp: string, expectedHash: string): boolean {
  const computed = hashOtp(patientId, targetValue, otp);
  const bufA = Buffer.from(computed, "utf8");
  const bufB = Buffer.from(expectedHash, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function parseIndianPhoneNumber(input: string): { valid: boolean; formatted: string; digits: string; message?: string } {
  if (!input || typeof input !== "string") {
    return { valid: false, formatted: "", digits: "", message: "Phone number is required." };
  }
  let cleaned = input.trim().replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("+91")) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith("91") && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith("0") && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  if (!/^\d{10}$/.test(cleaned)) {
    return { valid: false, formatted: "", digits: "", message: "Please enter a valid 10-digit Indian phone number." };
  }

  if (!/^[6-9]/.test(cleaned)) {
    return { valid: false, formatted: "", digits: "", message: "Indian mobile numbers must start with 6, 7, 8, or 9." };
  }

  return { valid: true, formatted: `+91${cleaned}`, digits: cleaned };
}

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

// ── Patient ID counter helper (delegated to centralized patient-id module) ─────
export {
  getNextPrefix,
  getMaxNumberForPrefix,
  formatPatientCode,
  computeNextPatientId,
  registerNewPatientWithNextId,
  findExistingPatientByPhoneOrEmail,
  findOrRegisterPatient,
} from "../lib/patient-id";


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
    age: p.age ?? null,
    gender: p.gender ?? null,
    email: p.email,
    phone: p.phone,
    address: p.address ?? null,
    avatarUrl: p.avatarUrl,
    emailVerified: p.emailVerified,
    createdAt: p.createdAt,
  };
}

export function getFrontendUrl(req: any) {
  if (process.env.FRONTEND_URL && process.env.FRONTEND_URL !== "null") return process.env.FRONTEND_URL.replace(/\/$/, "");

  const referer = req?.get?.("referer") || req?.get?.("origin");
  if (referer && referer !== "null") {
    try {
      const u = new URL(referer);
      if (u.origin && u.origin !== "null") return u.origin;
    } catch {}
  }

  // Plesk / Nginx / Reverse Proxy header check
  const xForwardedHost = req?.get?.("x-forwarded-host");
  const xForwardedProto = req?.get?.("x-forwarded-proto") || (req?.secure ? "https" : "http");
  if (xForwardedHost) {
    const hostPart = xForwardedHost.split(",")[0].trim();
    if (hostPart && !hostPart.includes("localhost") && !hostPart.includes("127.0.0.1")) {
      return `${xForwardedProto}://${hostPart}`;
    }
  }

  if (process.env.REPLIT_DEPLOYMENT === "1") {
    return (process.env.APP_URL && process.env.APP_URL !== "null")
      ? process.env.APP_URL.replace(/\/$/, "")
      : `${req?.protocol || "http"}://${req?.get?.("host") || "localhost:5000"}`;
  }
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (domain && domain !== "null") return `https://${domain}`;

  // If host header has a real domain (not localhost:5000), use that
  const host = req?.get?.("host") || "";
  if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
    const proto = req?.get?.("x-forwarded-proto") || (req?.secure ? "https" : "http");
    return `${proto}://${host}`;
  }

  if (process.env.APP_URL && process.env.APP_URL !== "null" && !process.env.APP_URL.includes("localhost")) {
    return process.env.APP_URL.replace(/\/$/, "");
  }

  if (host && host.includes(":5000")) {
    return `${req?.protocol || "http"}://${host.replace(":5000", ":5173")}`;
  }
  if (host) {
    return `${req?.protocol || "http"}://${host}`;
  }

  if (process.env.APP_URL && process.env.APP_URL !== "null") {
    return process.env.APP_URL.replace(/\/$/, "");
  }

  return "https://demo.susrutahospital.com";
}

// ── Register ───────────────────────────────────────────────────
const RegisterBody = z.object({
  name: z.string().trim().min(2).max(100),
  age: z.coerce.number().int().min(1).max(120),
  gender: z.string().trim().min(1),
  address: z.string().trim().min(1, "Address is required"),
  email: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  countryCode: z.string().trim().min(1),
  password: z.string().min(6),
});

router.post("/auth/register", verifyRecaptcha("patient_register"), async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "validation_error",
      message: "Name, age, gender, address, email, country, phone number, and a password (min 6 chars) are required.",
    });
    return;
  }
  const { name, age, gender, address, password } = parsed.data;
  const passwordValidation = validatePatientPassword(password);
  if (!passwordValidation.valid) {
    res.status(400).json({ error: passwordValidation.error, message: passwordValidation.message });
    return;
  }
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
    if (existingEmail.deleteColumn === 1) {
      res.status(403).json({ error: "account_deactivated", message: "This account has been deactivated. Please contact hospital support." });
      return;
    }
    res.status(409).json({ error: "email_taken", message: "An account with this email already exists. Please sign in." });
    return;
  }

  if (phone) {
    const [existingPhone] = await db.select().from(patientsTable).where(eq(patientsTable.phone, phone));
    if (existingPhone) {
      if (existingPhone.deleteColumn === 1) {
        res.status(403).json({ error: "account_deactivated", message: "This account has been deactivated. Please contact hospital support." });
        return;
      }
      res.status(409).json({ error: "phone_taken", message: "An account with this phone number already exists. Please sign in." });
      return;
    }
  }

  const passwordHash = await hashPassword(password);
  const patient = await registerNewPatientWithNextId({
    name,
    age,
    gender,
    address,
    email,
    phone,
    passwordHash,
    emailVerified: false,
  });

  // Send verification email in the background (non-blocking)
  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(loginTokensTable).values({
    token,
    patientId: patient.id,
    nextUrl: "/portal/dashboard?verified=true",
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

router.post("/auth/login", verifyRecaptcha("patient_login"), async (req, res) => {
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

  if (patient.deleteColumn === 1) {
    res.status(403).json({
      error: "account_deactivated",
      message: "This account has been temporarily deactivated. Click Reactivate to restore access.",
      canReactivate: true,
      email: patient.email,
    });
    return;
  }

  const sessionToken = await createPatientSession(patient.id);
  res.cookie("patient_session", sessionToken, cookieOpts());
  res.json(serializePatient(patient));
});

// ── Reactivate Deactivated Account ─────────────────────────────
router.post("/auth/reactivate", verifyRecaptcha("patient_login"), async (req, res) => {
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

  if (patient.deleteColumn === 1) {
    await db.update(patientsTable).set({ deleteColumn: 0 }).where(eq(patientsTable.id, patient.id));
    patient.deleteColumn = 0;
  }

  const sessionToken = await createPatientSession(patient.id);
  res.cookie("patient_session", sessionToken, cookieOpts());
  res.json({
    success: true,
    message: "Your account has been reactivated successfully.",
    patient: serializePatient(patient),
  });
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
    const [existingToken] = await db.select().from(loginTokensTable).where(eq(loginTokensTable.token, token));
    if (existingToken) {
      const [existingPatient] = await db.select().from(patientsTable).where(and(eq(patientsTable.id, existingToken.patientId), eq(patientsTable.deleteColumn, 0)));
      if (existingPatient?.emailVerified) {
        const sessionToken = await createPatientSession(existingPatient.id);
        res.cookie("patient_session", sessionToken, cookieOpts());
        res.redirect(`${frontendUrl}/portal/dashboard?verified=true`);
        return;
      }
    }
    res.redirect(`${frontendUrl}/portal?error=expired_token`);
    return;
  }

  const sessionToken = await createPatientSession(row.patientId);
  res.cookie("patient_session", sessionToken, cookieOpts());
  const targetPath = row.nextUrl || "/portal/dashboard?verified=true";
  const redirectUrl = targetPath.startsWith("http")
    ? targetPath
    : `${frontendUrl}${targetPath.startsWith("/") ? "" : "/"}${targetPath}`;
  res.redirect(redirectUrl);
});

// ── Resend Verification Email ─────────────────────────────────
router.post("/auth/resend-verification", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  if (!patient.email) {
    res.status(400).json({ error: "no_email", message: "No email address found for this account. Please update your profile with an email address." });
    return;
  }
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
router.post("/auth/forgot-password", verifyRecaptcha("patient_forgot_password"), async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "validation_error", message: "Email is required." });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const [patient] = await db.select().from(patientsTable)
    .where(and(eq(patientsTable.deleteColumn, 0), sql`lower(${patientsTable.email}) = ${normalizedEmail}`));

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
router.post("/auth/reset-password", verifyRecaptcha("patient_reset_password"), async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || typeof token !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "validation_error", message: "Token and new password are required." });
    return;
  }
  const passwordValidation = validatePatientPassword(password);
  if (!passwordValidation.valid) {
    res.status(400).json({ error: passwordValidation.error, message: passwordValidation.message });
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

  const [patient] = await db.select().from(patientsTable).where(and(eq(patientsTable.id, row.patientId), eq(patientsTable.deleteColumn, 0)));
  const sessionToken = await createPatientSession(row.patientId);
  res.cookie("patient_session", sessionToken, cookieOpts());
  res.json({ success: true, patient: patient ? serializePatient(patient) : null });
});

// ── Me ─────────────────────────────────────────────────────────
router.get("/me", async (req, res) => {
  const token = req.cookies?.patient_session;
  if (!token) {
    res.json(null);
    return;
  }
  const patient = await verifyPatientSession(token);
  if (!patient) {
    res.clearCookie("patient_session");
    res.json(null);
    return;
  }
  res.json(serializePatient(patient));
});

// ── Helpers for Patient Data ZIP Export ──────────────────────
async function resolveFileBuffer(objectPath: string | null | undefined): Promise<Buffer | null> {
  if (!objectPath || typeof objectPath !== "string") return null;
  const localFile = findExistingFile(objectPath);
  if (localFile && fs.existsSync(localFile)) {
    try {
      return fs.readFileSync(localFile);
    } catch (e) {
      console.warn("[export-data] Error reading local file:", localFile, e);
    }
  }
  try {
    const file = await objectStorageService.getObjectEntityFile(objectPath);
    const resp = await objectStorageService.downloadObject(file);
    if (resp.body) {
      const arrayBuf = await resp.arrayBuffer();
      return Buffer.from(arrayBuf);
    }
  } catch {
    // Not found in GCS
  }
  return null;
}

function getDeduplicatedFilename(originalName: string, usedNames: Set<string>): string {
  let cleanName = path.basename(originalName).replace(/[/\\]/g, "_").replace(/\.\./g, "_").trim();
  if (!cleanName || cleanName === "." || cleanName === "..") {
    cleanName = "attachment";
  }

  const parsed = path.parse(cleanName);
  let finalName = cleanName;
  let counter = 1;

  while (usedNames.has(finalName.toLowerCase())) {
    finalName = `${parsed.name}_${counter}${parsed.ext}`;
    counter++;
  }

  usedNames.add(finalName.toLowerCase());
  return finalName;
}

function hasAppointmentPrescription(rx: { photoObjectPath?: string | null; notes?: string | null } | null | undefined): boolean {
  if (!rx) return false;
  if (rx.photoObjectPath) return true;
  if (!rx.notes) return false;
  const t = rx.notes.trim();
  if (!t) return false;
  if (t.startsWith("{")) {
    try {
      const parsed = JSON.parse(t);
      if (parsed.token && !parsed.digitalPrescription) return false;
      return !!(parsed.digitalPrescription || (Array.isArray(parsed.formulationRows) && parsed.formulationRows.length > 0) || parsed.diagnosis || (typeof parsed.notes === "string" && parsed.notes.trim().length > 0));
    } catch {
      return false;
    }
  }
  return true;
}

// ── GET /api/patient/me/export-data ─────────────────────────────
router.get("/me/export-data", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  try {
    const zip = new JSZip();

    // FOLDER STRUCTURE:
    // 1. Prescriptions/ (prescriptions directly inside, no "Files" subfolder)
    // 2. Medical_Documents/ (medical documents directly inside)
    zip.folder("Prescriptions");
    zip.folder("Medical_Documents");

    // 1. Fetch authorized prescriptions (both online & offline)
    const onlineRx = await db
      .select({
        id: prescriptionsTable.id,
        photoObjectPath: prescriptionsTable.photoObjectPath,
        notes: prescriptionsTable.notes,
      })
      .from(prescriptionsTable)
      .innerJoin(onlineAppointmentsTable, eq(prescriptionsTable.onlineAppointmentId, onlineAppointmentsTable.id))
      .where(and(
        eq(onlineAppointmentsTable.patientId, patient.id),
        eq(onlineAppointmentsTable.deleteColumn, 0),
        eq(prescriptionsTable.deleteColumn, 0)
      ));

    const physicalConditions = [
      and(
        eq(appointmentsTable.patientId, patient.id),
        eq(appointmentsTable.deleteColumn, 0)
      )
    ];
    if (patient.email) {
      physicalConditions.push(and(
        sql`lower(${appointmentsTable.patientEmail}) = ${patient.email.toLowerCase().trim()}`,
        eq(appointmentsTable.deleteColumn, 0)
      ));
    }
    if (patient.phone) {
      physicalConditions.push(and(
        eq(appointmentsTable.patientPhone, patient.phone),
        eq(appointmentsTable.deleteColumn, 0)
      ));
    }

    const physicalRx = await db
      .select({
        id: prescriptionsTable.id,
        photoObjectPath: prescriptionsTable.photoObjectPath,
        notes: prescriptionsTable.notes,
      })
      .from(prescriptionsTable)
      .innerJoin(appointmentsTable, eq(prescriptionsTable.appointmentId, appointmentsTable.id))
      .where(and(
        or(...physicalConditions),
        eq(prescriptionsTable.deleteColumn, 0)
      ));

    const allValidRx = [...onlineRx, ...physicalRx].filter(r => hasAppointmentPrescription(r));
    const allRxIds = Array.from(new Set(allValidRx.map(r => r.id)));
    const rxUsedNames = new Set<string>();

    for (const rxId of allRxIds) {
      const rxData = await getPrescriptionBufferAndName({
        rxIdOrApptParam: rxId,
        authenticatedPatientId: patient.id,
      });

      if (rxData && rxData.buffer && rxData.buffer.length > 0) {
        const safeName = getDeduplicatedFilename(rxData.fileName, rxUsedNames);
        zip.file(`Prescriptions/${safeName}`, rxData.buffer);
      }
    }

    // 2. Fetch authorized medical documents
    const medicalDocs = await db
      .select()
      .from(patientDocumentsTable)
      .where(and(
        eq(patientDocumentsTable.patientId, patient.id),
        eq(patientDocumentsTable.deleteColumn, 0)
      ));

    const docUsedNames = new Set<string>();
    for (const doc of medicalDocs) {
      if (!doc.objectPath) continue;
      const buf = await resolveFileBuffer(doc.objectPath);
      if (buf && buf.length > 0) {
        const safeName = getDeduplicatedFilename(doc.name || `document_${doc.id}.pdf`, docUsedNames);
        zip.file(`Medical_Documents/${safeName}`, buf);
      }
    }

    const patientCode = (patient.patientCode && patient.patientCode.trim()) ? patient.patientCode.trim() : `P${patient.id}`;
    const zipFilename = `Susruta_Hospital_Patient_Data_${patientCode}.zip`;

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipFilename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(zipBuffer);
  } catch (err: any) {
    console.error("[Export Data Error]", err);
    res.status(500).json({ error: "export_failed", message: "Unable to download your files. Please try again." });
  }
});

// ── POST /api/patient/account/deactivate ─────────────────────────
router.post("/account/deactivate", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  try {
    // 1. Invalidate all active patient sessions
    await db.delete(patientSessionsTable).where(eq(patientSessionsTable.patientId, patient.id));

    // 2. Set deleteColumn = 1 on patientsTable (temporarily deactivated)
    await db.update(patientsTable).set({ deleteColumn: 1 }).where(eq(patientsTable.id, patient.id));

    // 3. Clear session cookie
    res.clearCookie("patient_session", cookieOpts());

    res.json({
      success: true,
      message: "Your account has been temporarily deactivated.",
    });
  } catch (err: any) {
    console.error("[Account Deactivation Error]", err);
    res.status(500).json({ error: "server_error", message: "Failed to deactivate account. Please try again." });
  }
});

// ── POST /api/patient/account/delete-request ─────────────────────
router.post("/account/delete-request", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  try {
    await syncExpiredDeletionRequests();

    // Check if an existing active deletion request exists (PENDING or ELIGIBLE_FOR_DELETION)
    const [existing] = await db
      .select()
      .from(accountDeletionRequestsTable)
      .where(and(
        eq(accountDeletionRequestsTable.patientId, patient.id),
        inArray(accountDeletionRequestsTable.status, ["PENDING", "ELIGIBLE_FOR_DELETION"]),
        eq(accountDeletionRequestsTable.deleteColumn, 0)
      ));

    if (existing) {
      res.status(409).json({
        error: "already_submitted",
        message: "Account deletion request already submitted.",
        request: formatDeletionRequest(existing),
      });
      return;
    }

    const now = new Date();
    const cancellationDeadline = new Date(now.getTime() + CANCELLATION_PERIOD_MS);

    const [newRequest] = await db
      .insert(accountDeletionRequestsTable)
      .values({
        patientId: patient.id,
        patientCode: patient.patientCode ?? null,
        patientName: patient.name,
        patientEmail: patient.email ?? "",
        status: "PENDING",
        reason: typeof req.body?.reason === "string" ? req.body.reason.trim() : null,
        cancellationDeadline,
        isSeen: false,
        deleteColumn: 0,
        createdAt: now,
      })
      .returning();

    notifyAdminNewAccountDeletionRequest(formatDeletionRequest(newRequest, now));

    res.status(201).json({
      success: true,
      message: "Your account deletion request has been submitted. You have 15 days to cancel this request.",
      description: "Your request has been sent to the hospital administrator. You can cancel this request within 15 days from your Patient Profile.",
      request: formatDeletionRequest(newRequest, now),
    });
  } catch (err: any) {
    console.error("[Account Deletion Request Error]", err);
    res.status(500).json({ error: "server_error", message: "Failed to submit account deletion request. Please try again." });
  }
});

// ── GET /api/patient/account/delete-request ──────────────────────
router.get("/account/delete-request", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  try {
    await syncExpiredDeletionRequests();

    const [existing] = await db
      .select()
      .from(accountDeletionRequestsTable)
      .where(and(
        eq(accountDeletionRequestsTable.patientId, patient.id),
        inArray(accountDeletionRequestsTable.status, ["PENDING", "ELIGIBLE_FOR_DELETION"]),
        eq(accountDeletionRequestsTable.deleteColumn, 0)
      ))
      .orderBy(desc(accountDeletionRequestsTable.createdAt))
      .limit(1);

    if (existing) {
      res.json({
        hasPendingRequest: true,
        request: formatDeletionRequest(existing),
      });
    } else {
      res.json({
        hasPendingRequest: false,
        request: null,
      });
    }
  } catch (err: any) {
    console.error("[Get Account Deletion Request Error]", err);
    res.status(500).json({ error: "server_error", message: "Failed to fetch deletion request status." });
  }
});

// ── POST /api/patient/account/delete-request/cancel ───────────────
router.post("/account/delete-request/cancel", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  try {
    await syncExpiredDeletionRequests();

    // Fetch the most recent deletion request for this patient
    const [latestReq] = await db
      .select()
      .from(accountDeletionRequestsTable)
      .where(and(
        eq(accountDeletionRequestsTable.patientId, patient.id),
        eq(accountDeletionRequestsTable.deleteColumn, 0)
      ))
      .orderBy(desc(accountDeletionRequestsTable.createdAt))
      .limit(1);

    if (!latestReq) {
      res.status(404).json({
        error: "not_found",
        message: "No account deletion request found for this account.",
      });
      return;
    }

    // Edge case: Already cancelled
    if (latestReq.status === "CANCELLED") {
      res.status(400).json({
        error: "already_cancelled",
        message: "This deletion request has already been cancelled.",
      });
      return;
    }

    // Edge case: Already processed by Admin
    if (latestReq.status === "COMPLETED" || latestReq.status === "DELETED") {
      res.status(400).json({
        error: "already_processed",
        message: "This deletion request can no longer be cancelled.",
      });
      return;
    }

    const now = new Date();
    const isExpired =
      latestReq.status === "ELIGIBLE_FOR_DELETION" ||
      (latestReq.cancellationDeadline && new Date(latestReq.cancellationDeadline).getTime() <= now.getTime());

    // Edge case: 15-day period expired
    if (isExpired) {
      if (latestReq.status !== "ELIGIBLE_FOR_DELETION") {
        await db
          .update(accountDeletionRequestsTable)
          .set({ status: "ELIGIBLE_FOR_DELETION" })
          .where(eq(accountDeletionRequestsTable.id, latestReq.id));
      }

      res.status(400).json({
        error: "cancellation_period_expired",
        message: "The 15-day cancellation period has expired. This request can no longer be cancelled.",
      });
      return;
    }

    // Atomic cancellation in transaction
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(accountDeletionRequestsTable)
        .set({
          status: "CANCELLED",
          cancelledAt: now,
          notes: "Account deletion request cancelled by patient during 15-day cancellation grace period.",
        })
        .where(and(
          eq(accountDeletionRequestsTable.id, latestReq.id),
          eq(accountDeletionRequestsTable.status, "PENDING")
        ))
        .returning();

      if (!updated) {
        throw new Error("concurrent_modification");
      }

      // Restore patient's active status if deactivated
      await tx
        .update(patientsTable)
        .set({ deleteColumn: 0 })
        .where(eq(patientsTable.id, patient.id));
    });

    notifyAdminAccountDeletionRequestCancelled({ id: latestReq.id, patientId: patient.id, status: "CANCELLED" });

    res.json({
      success: true,
      message: "Your account deletion request has been cancelled successfully.",
    });
  } catch (err: any) {
    if (err?.message === "concurrent_modification") {
      res.status(409).json({
        error: "conflict",
        message: "This deletion request could not be cancelled because its status was concurrently modified.",
      });
      return;
    }
    console.error("[Cancel Account Deletion Request Error]", err);
    res.status(500).json({
      error: "server_error",
      message: "Failed to cancel account deletion request. Please try again.",
    });
  }
});

// ── Profile: Update Full Name ──────────────────────────────────
router.patch("/profile/name", requirePatient, async (req: any, res) => {
  const { name } = req.body;
  if (!name || typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
    res.status(400).json({ error: "validation_error", message: "Full name must be between 2 and 100 characters." });
    return;
  }
  const trimmedName = name.trim();
  const [updated] = await db.update(patientsTable)
    .set({ name: trimmedName })
    .where(eq(patientsTable.id, req.patient.id))
    .returning();

  res.json({ success: true, message: "Full name updated successfully!", patient: serializePatient(updated) });
});

// ── Profile: Update Age, Gender & Address ─────────────────────
router.patch("/profile/details", requirePatient, async (req: any, res) => {
  const { age, gender, address } = req.body;
  const updates: any = {};
  if (age !== undefined && age !== null && age !== "") {
    const parsedAge = Number(age);
    if (isNaN(parsedAge) || parsedAge < 1 || parsedAge > 120) {
      res.status(400).json({ error: "validation_error", message: "Age must be a valid number between 1 and 120." });
      return;
    }
    updates.age = parsedAge;
  }
  if (gender !== undefined && gender !== null && gender !== "") {
    if (typeof gender !== "string" || !["Male", "Female", "Other"].includes(gender.trim())) {
      res.status(400).json({ error: "validation_error", message: "Please select a valid gender (Male, Female, Other)." });
      return;
    }
    updates.gender = gender.trim();
  }
  if (address !== undefined && address !== null && address !== "") {
    if (typeof address !== "string" || address.trim().length === 0) {
      res.status(400).json({ error: "validation_error", message: "Address cannot be empty." });
      return;
    }
    updates.address = address.trim();
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "validation_error", message: "Nothing to update." });
    return;
  }

  const [updated] = await db.update(patientsTable)
    .set(updates)
    .where(eq(patientsTable.id, req.patient.id))
    .returning();

  res.json({ success: true, message: "Profile details updated successfully!", patient: serializePatient(updated) });
});

// ── Profile: Update Address ────────────────────────────────────
router.patch("/profile/address", requirePatient, async (req: any, res) => {
  const { address } = req.body;
  if (!address || typeof address !== "string" || address.trim().length === 0) {
    res.status(400).json({ error: "validation_error", message: "Address is required." });
    return;
  }
  const trimmedAddress = address.trim();
  const [updated] = await db.update(patientsTable)
    .set({ address: trimmedAddress })
    .where(eq(patientsTable.id, req.patient.id))
    .returning();

  res.json({ success: true, message: "Address updated successfully!", patient: serializePatient(updated) });
});

// ── Profile: Request Email Change OTP ─────────────────────────
router.post("/profile/request-email-otp", requirePatient, async (req: any, res) => {
  const { newEmail } = req.body;
  const normalized = normalizePatientEmail(newEmail);
  if (!normalized) {
    res.status(400).json({ error: "validation_error", message: "Please provide a valid email address." });
    return;
  }

  if (normalized.toLowerCase() === req.patient.email.toLowerCase()) {
    res.status(400).json({ error: "same_email", message: "This is already your current registered email." });
    return;
  }

  // Check if taken by another patient
  const [existing] = await db.select({ id: patientsTable.id }).from(patientsTable)
    .where(and(sql`lower(${patientsTable.email}) = ${normalized.toLowerCase()}`, ne(patientsTable.id, req.patient.id)));
  if (existing) {
    res.status(400).json({ error: "email_taken", message: "This email address is already in use by another account." });
    return;
  }

  // Rate limiting & cooldown
  const now = new Date();
  const [activeOtp] = await db.select().from(patientOtpsTable).where(
    and(
      eq(patientOtpsTable.patientId, req.patient.id),
      eq(patientOtpsTable.type, "email_change"),
      eq(patientOtpsTable.verified, false),
      sql`${patientOtpsTable.resendAfter} > ${now}`
    )
  );
  if (activeOtp) {
    const remainingSecs = Math.max(1, Math.ceil((activeOtp.resendAfter.getTime() - now.getTime()) / 1000));
    res.status(429).json({ error: "cooldown", message: `Please wait ${remainingSecs} seconds before requesting another code.`, cooldownSeconds: remainingSecs });
    return;
  }

  // Hourly limit: max 5 requests per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [hourlyCount] = await db.select({ count: sql<number>`count(*)` }).from(patientOtpsTable).where(
    and(
      eq(patientOtpsTable.patientId, req.patient.id),
      eq(patientOtpsTable.type, "email_change"),
      sql`${patientOtpsTable.createdAt} > ${oneHourAgo}`
    )
  );
  if (Number(hourlyCount?.count || 0) >= 5) {
    res.status(429).json({ error: "rate_limit", message: "Too many attempts. For security, please try again in an hour." });
    return;
  }

  // Invalidate any previous unused email OTPs for this patient
  await db.delete(patientOtpsTable).where(
    and(eq(patientOtpsTable.patientId, req.patient.id), eq(patientOtpsTable.type, "email_change"))
  );

  const otp = randomInt(100000, 1000000).toString();
  const otpHash = hashOtp(req.patient.id, normalized, otp);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const resendAfter = new Date(Date.now() + 60 * 1000);

  await db.insert(patientOtpsTable).values({
    patientId: req.patient.id,
    type: "email_change",
    targetValue: normalized,
    otpHash,
    attempts: 0,
    expiresAt,
    resendAfter,
    verified: false,
  });

  sendProfileEmailOtp({ to: normalized, name: req.patient.name, otp, newEmail: normalized }).catch(console.error);

  res.json({ success: true, message: `Verification code sent to ${normalized}. It expires in 10 minutes.`, cooldownSeconds: 60 });
});

// ── Profile: Verify Email Change OTP ──────────────────────────
router.post("/profile/verify-email-otp", requirePatient, async (req: any, res) => {
  const { newEmail, otp } = req.body;
  const normalized = normalizePatientEmail(newEmail);
  if (!normalized || !otp || typeof otp !== "string" || !/^\d{6}$/.test(otp.trim())) {
    res.status(400).json({ error: "validation_error", message: "Valid new email and 6-digit code are required." });
    return;
  }

  const [record] = await db.select().from(patientOtpsTable).where(
    and(
      eq(patientOtpsTable.patientId, req.patient.id),
      eq(patientOtpsTable.type, "email_change"),
      eq(patientOtpsTable.targetValue, normalized),
      eq(patientOtpsTable.verified, false)
    )
  );

  if (!record || record.expiresAt < new Date()) {
    res.status(400).json({ error: "expired_otp", message: "Verification code has expired or is invalid. Please request a new one." });
    return;
  }

  if (record.attempts >= 5) {
    res.status(400).json({ error: "too_many_attempts", message: "Too many failed attempts. For security, please request a new verification code." });
    return;
  }

  const isValid = verifyOtpHash(req.patient.id, normalized, otp.trim(), record.otpHash);
  if (!isValid) {
    const newAttempts = record.attempts + 1;
    await db.update(patientOtpsTable).set({ attempts: newAttempts }).where(eq(patientOtpsTable.id, record.id));
    const remaining = 5 - newAttempts;
    res.status(400).json({
      error: "invalid_otp",
      message: remaining > 0 ? `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` : "Incorrect code. Maximum attempts exceeded. Please request a new code.",
    });
    return;
  }

  // Double check email not taken
  const [existing] = await db.select({ id: patientsTable.id }).from(patientsTable)
    .where(and(sql`lower(${patientsTable.email}) = ${normalized.toLowerCase()}`, ne(patientsTable.id, req.patient.id)));
  if (existing) {
    res.status(400).json({ error: "email_taken", message: "This email address was recently registered to another account." });
    return;
  }

  // Mark verified
  await db.update(patientOtpsTable).set({ verified: true }).where(eq(patientOtpsTable.id, record.id));

  const oldEmail = req.patient.email;
  const [updated] = await db.update(patientsTable)
    .set({ email: normalized, emailVerified: true })
    .where(eq(patientsTable.id, req.patient.id))
    .returning();

  // Send security alert to old email
  sendEmailChangeNotification({ to: oldEmail, name: req.patient.name, newEmail: normalized }).catch(console.error);

  res.json({ success: true, message: "Email updated and verified successfully!", patient: serializePatient(updated) });
});

// ── Profile: Request Phone Change OTP ─────────────────────────
router.post("/profile/request-phone-otp", requirePatient, async (req: any, res) => {
  const { newPhone, countryCode } = req.body;
  const detected = detectCountryFromPhone(newPhone);
  const effectiveCountry = countryCode || detected?.code || "IN";
  const parsed = validatePatientPhone(newPhone, effectiveCountry);
  if (!parsed.valid) {
    res.status(400).json({ error: "validation_error", message: parsed.message });
    return;
  }
  const formattedPhone = parsed.e164;

  if (req.patient.phone === formattedPhone) {
    res.status(400).json({ error: "same_phone", message: "This is already your current registered phone number." });
    return;
  }

  // Rate limiting & cooldown
  const now = new Date();
  const [activeOtp] = await db.select().from(patientOtpsTable).where(
    and(
      eq(patientOtpsTable.patientId, req.patient.id),
      eq(patientOtpsTable.type, "phone_change"),
      eq(patientOtpsTable.verified, false),
      sql`${patientOtpsTable.resendAfter} > ${now}`
    )
  );
  if (activeOtp) {
    const remainingSecs = Math.max(1, Math.ceil((activeOtp.resendAfter.getTime() - now.getTime()) / 1000));
    res.status(429).json({ error: "cooldown", message: `Please wait ${remainingSecs} seconds before requesting another code.`, cooldownSeconds: remainingSecs });
    return;
  }

  // Hourly limit: max 5 requests per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [hourlyCount] = await db.select({ count: sql<number>`count(*)` }).from(patientOtpsTable).where(
    and(
      eq(patientOtpsTable.patientId, req.patient.id),
      eq(patientOtpsTable.type, "phone_change"),
      sql`${patientOtpsTable.createdAt} > ${oneHourAgo}`
    )
  );
  if (Number(hourlyCount?.count || 0) >= 5) {
    res.status(429).json({ error: "rate_limit", message: "Too many attempts. For security, please try again in an hour." });
    return;
  }

  // Invalidate previous phone OTPs for this patient
  await db.delete(patientOtpsTable).where(
    and(eq(patientOtpsTable.patientId, req.patient.id), eq(patientOtpsTable.type, "phone_change"))
  );

  const otp = randomInt(100000, 1000000).toString();
  const otpHash = hashOtp(req.patient.id, formattedPhone, otp);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const resendAfter = new Date(Date.now() + 60 * 1000);

  await db.insert(patientOtpsTable).values({
    patientId: req.patient.id,
    type: "phone_change",
    targetValue: formattedPhone,
    otpHash,
    attempts: 0,
    expiresAt,
    resendAfter,
    verified: false,
  });

  // Send OTP directly to registered email
  sendProfilePhoneOtp({
    to: req.patient.email,
    name: req.patient.name,
    otp,
    newPhone: formattedPhone,
  }).catch((err) => {
    console.error("Failed to send phone update verification code email:", err);
  });

  res.json({
    success: true,
    message: `Verification code sent to your registered email (${req.patient.email}). It expires in 10 minutes.`,
    registeredEmail: req.patient.email,
    cooldownSeconds: 60,
  });
});

// ── Profile: Verify Phone Change OTP ──────────────────────────
router.post("/profile/verify-phone-otp", requirePatient, async (req: any, res) => {
  const { newPhone, countryCode, otp } = req.body;
  const detected = detectCountryFromPhone(newPhone);
  const effectiveCountry = countryCode || detected?.code || "IN";
  const parsed = validatePatientPhone(newPhone, effectiveCountry);
  if (!parsed.valid || !otp || typeof otp !== "string" || !/^\d{6}$/.test(otp.trim())) {
    res.status(400).json({ error: "validation_error", message: parsed.valid ? "A 6-digit verification code is required." : parsed.message });
    return;
  }
  const formattedPhone = parsed.e164;

  const [record] = await db.select().from(patientOtpsTable).where(
    and(
      eq(patientOtpsTable.patientId, req.patient.id),
      eq(patientOtpsTable.type, "phone_change"),
      eq(patientOtpsTable.targetValue, formattedPhone),
      eq(patientOtpsTable.verified, false)
    )
  );

  if (!record || record.expiresAt < new Date()) {
    res.status(400).json({ error: "expired_otp", message: "Verification code has expired or is invalid. Please request a new one." });
    return;
  }

  if (record.attempts >= 5) {
    res.status(400).json({ error: "too_many_attempts", message: "Too many failed attempts. For security, please request a new verification code." });
    return;
  }

  const isValid = verifyOtpHash(req.patient.id, formattedPhone, otp.trim(), record.otpHash);
  if (!isValid) {
    const newAttempts = record.attempts + 1;
    await db.update(patientOtpsTable).set({ attempts: newAttempts }).where(eq(patientOtpsTable.id, record.id));
    const remaining = 5 - newAttempts;
    res.status(400).json({
      error: "invalid_otp",
      message: remaining > 0 ? `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` : "Incorrect code. Maximum attempts exceeded. Please request a new code.",
    });
    return;
  }

  // Mark verified
  await db.update(patientOtpsTable).set({ verified: true }).where(eq(patientOtpsTable.id, record.id));

  const [updated] = await db.update(patientsTable)
    .set({ phone: formattedPhone })
    .where(eq(patientsTable.id, req.patient.id))
    .returning();

  res.json({ success: true, message: "Phone number updated successfully!", patient: serializePatient(updated) });
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
  const cleanupDirect = addDirectCallPatientClient(req.patient.id, res);

  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(heartbeat); }
  }, 15000);

  req.on("close", () => {
    patientSseClients.delete(client);
    cleanupDirect();
    clearInterval(heartbeat);
  });
});

export function notifyPatientAppointmentUpdated(patientId: number) {
  const payload = JSON.stringify({ type: "appointment_updated" });
  for (const client of patientSseClients) {
    if (client.patientId === patientId) {
      try { client.res.write(`event: appointment_updated\ndata: ${payload}\n\n`); } catch { patientSseClients.delete(client); }
    }
  }
}

// ── My Appointments ───────────────────────────────────────────
router.get("/appointments", requirePatient, async (req, res) => {
  const patient = (req as any).patient;
  const conditions = [
    and(
      eq(appointmentsTable.patientId, patient.id),
      eq(appointmentsTable.deleteColumn, 0)
    )
  ];
  if (patient.email) {
    conditions.push(and(
      sql`lower(${appointmentsTable.patientEmail}) = ${patient.email.toLowerCase().trim()}`,
      eq(appointmentsTable.deleteColumn, 0)
    ));
  }
  if (patient.phone) {
    conditions.push(and(
      eq(appointmentsTable.patientPhone, patient.phone),
      eq(appointmentsTable.deleteColumn, 0)
    ));
  }

  const rows = await db
    .select({
      appt: appointmentsTable,
      prescription: prescriptionsTable,
    })
    .from(appointmentsTable)
    .leftJoin(prescriptionsTable, and(
      eq(prescriptionsTable.appointmentId, appointmentsTable.id),
      eq(prescriptionsTable.deleteColumn, 0)
    ))
    .where(or(...conditions))
    .orderBy(desc(appointmentsTable.date));

  const result = rows.map((r) => {
    const a = r.appt;
    if (!a.patientId) {
      db.update(appointmentsTable).set({ patientId: patient.id }).where(eq(appointmentsTable.id, a.id)).catch(() => {});
      a.patientId = patient.id;
    }

    const clinicalNotes = extractClinicalNotes(r.prescription?.notes ?? a.notes);
    const photoPath = r.prescription?.photoObjectPath ?? null;
    const rxUpdatedAt = r.prescription?.updatedAt?.toISOString() ?? a.createdAt?.toISOString() ?? new Date().toISOString();

    return {
      id: a.id,
      patientId: a.patientId,
      patientName: a.patientName,
      patientPhone: a.patientPhone,
      patientEmail: a.patientEmail ?? null,
      date: a.date,
      timeSlot: a.timeSlot,
      status: a.status,
      reason: a.reason ?? null,
      notes: r.prescription?.notes ?? a.notes ?? null,
      arrivedAt: a.arrivedAt?.toISOString() ?? null,
      createdAt: a.createdAt?.toISOString() ?? null,
      prescription: (photoPath || r.prescription?.notes || clinicalNotes) ? {
        id: r.prescription?.id ?? a.id,
        photoObjectPath: photoPath,
        notes: r.prescription?.notes ?? a.notes ?? null,
        updatedAt: rxUpdatedAt,
      } : null,
    };
  });

  res.json(result);
});

// ── GET /api/patient/prescriptions/appointment/:type/:id ──────────
// Fetch prescription for a specific consultation/appointment strictly belonging to the authenticated patient
router.get("/prescriptions/appointment/:type/:id", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  const apptType = req.params.type; // "online" | "offline"
  const apptId = parseInt(req.params.id, 10);

  if (!apptId || isNaN(apptId)) {
    res.status(400).json({ error: "invalid_id", message: "Valid appointment ID is required." });
    return;
  }

  if (apptType === "online") {
    const [row] = await db
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
      .where(and(
        eq(onlineAppointmentsTable.id, apptId),
        eq(onlineAppointmentsTable.patientId, patient.id),
        eq(onlineAppointmentsTable.deleteColumn, 0)
      ));

    if (!row) {
      res.status(404).json({ error: "not_found", message: "Consultation not found or unauthorized." });
      return;
    }

    const rx = row.prescription;
    res.json({
      appointmentId: row.appt.id,
      type: "online",
      date: row.slot.date,
      time: `${row.slot.startTime} – ${row.slot.endTime}`,
      prescription: rx ? {
        id: rx.id,
        photoObjectPath: rx.photoObjectPath,
        notes: rx.notes,
        updatedAt: rx.updatedAt.toISOString(),
      } : null,
    });
  } else {
    // Offline hospital appointment
    const conditions = [
      and(
        eq(appointmentsTable.patientId, patient.id),
        eq(appointmentsTable.deleteColumn, 0)
      )
    ];
    if (patient.email) {
      conditions.push(and(
        sql`lower(${appointmentsTable.patientEmail}) = ${patient.email.toLowerCase().trim()}`,
        eq(appointmentsTable.deleteColumn, 0)
      ));
    }
    if (patient.phone) {
      conditions.push(and(
        eq(appointmentsTable.patientPhone, patient.phone),
        eq(appointmentsTable.deleteColumn, 0)
      ));
    }

    const [row] = await db
      .select({
        appt: appointmentsTable,
        prescription: prescriptionsTable,
      })
      .from(appointmentsTable)
      .leftJoin(prescriptionsTable, and(
        eq(prescriptionsTable.appointmentId, appointmentsTable.id),
        eq(prescriptionsTable.deleteColumn, 0)
      ))
      .where(and(eq(appointmentsTable.id, apptId), eq(appointmentsTable.deleteColumn, 0), or(...conditions)));

    if (!row) {
      res.status(404).json({ error: "not_found", message: "Consultation not found or unauthorized." });
      return;
    }

    const rx = row.prescription;
    res.json({
      appointmentId: row.appt.id,
      type: "offline",
      date: row.appt.date,
      time: row.appt.timeSlot,
      prescription: rx ? {
        id: rx.id,
        photoObjectPath: rx.photoObjectPath,
        notes: rx.notes,
        updatedAt: rx.updatedAt.toISOString(),
      } : (row.appt.notes ? {
        id: row.appt.id,
        photoObjectPath: null,
        notes: row.appt.notes,
        updatedAt: row.appt.createdAt?.toISOString() ?? new Date().toISOString(),
      } : null),
    });
  }
});

// ── GET /api/patient/prescriptions/:id/download ────────────────────
router.get("/prescriptions/:id/download", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  const requestedFileName = typeof req.query.filename === "string" ? req.query.filename : undefined;
  await streamPrescriptionDownload({
    rxIdOrApptParam: String(req.params.id),
    requestedFileName,
    authenticatedPatientId: patient.id,
    res,
  });
});

// ── GET /api/patient/prescriptions/appointment/:type/:id/download ──
router.get("/prescriptions/appointment/:type/:id/download", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  const requestedFileName = typeof req.query.filename === "string" ? req.query.filename : undefined;
  await streamPrescriptionDownload({
    rxIdOrApptParam: `appt-${String(req.params.type)}-${String(req.params.id)}`,
    requestedFileName,
    authenticatedPatientId: patient.id,
    res,
  });
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

  const isSunday = new Date(date + "T12:00:00+05:30").getDay() === 0;
  const isMorning =
    timeSlot.includes("10 AM") ||
    timeSlot.includes("1:30 PM") ||
    timeSlot.includes("1 PM") ||
    timeSlot.includes("Morning") ||
    timeSlot.includes("9 AM");
  const isEvening =
    timeSlot.includes("6 PM") ||
    timeSlot.includes("Evening") ||
    timeSlot.includes("4 PM");

  const [customTiming] = await db
    .select()
    .from(customDayTimingsTable)
    .where(and(eq(customDayTimingsTable.date, date), eq(customDayTimingsTable.deleteColumn, 0)));

  let morningCutoffMins = isSunday ? 13 * 60 : 13 * 60 + 30;
  let morningMaxSlots = isSunday ? 12 : 14;
  let morningEnabled = true;

  let eveningCutoffMins = isSunday ? 0 : 22 * 60;
  let eveningMaxSlots = isSunday ? 0 : 16;
  let eveningEnabled = !isSunday;

  if (customTiming) {
    morningEnabled = customTiming.morningEnabled;
    morningCutoffMins = parseTimeString(customTiming.morningEnd);
    morningMaxSlots = morningEnabled
      ? generateTimeSlots(customTiming.morningStart, customTiming.morningEnd, customTiming.slotIntervalMinutes).length
      : 0;

    eveningEnabled = customTiming.eveningEnabled;
    eveningCutoffMins = parseTimeString(customTiming.eveningEnd);
    eveningMaxSlots = eveningEnabled
      ? generateTimeSlots(customTiming.eveningStart, customTiming.eveningEnd, customTiming.slotIntervalMinutes).length
      : 0;
  }

  if (date < todayStr) {
    res.status(400).json({ error: "date_passed", message: "Cannot book appointments for past dates." });
    return;
  }

  if (date === todayStr) {
    if (isMorning && (!morningEnabled || currentMinutes >= morningCutoffMins)) {
      res.status(400).json({ error: "session_expired", message: "Morning session has already ended. Please select another date or evening session." });
      return;
    }
    if (isEvening && (!eveningEnabled || currentMinutes >= eveningCutoffMins)) {
      res.status(400).json({ error: "session_expired", message: "Evening session has already ended. Please select another date." });
      return;
    }
  }

  // Check capacity for session (offline + online)
  const existingOffline = await db.select().from(appointmentsTable).where(
    and(
      eq(appointmentsTable.date, date),
      ne(appointmentsTable.status, "cancelled"),
      eq(appointmentsTable.deleteColumn, 0)
    )
  );
  const existingOnlineSlots = await db.select().from(onlineSlotsTable).where(
    and(
      eq(onlineSlotsTable.date, date),
      eq(onlineSlotsTable.isBooked, true),
      eq(onlineSlotsTable.deleteColumn, 0)
    )
  );

  if (isMorning) {
    const offlineM = existingOffline.filter(a =>
      a.timeSlot.includes("10 AM") ||
      a.timeSlot.includes("1:30 PM") ||
      a.timeSlot.includes("1 PM") ||
      a.timeSlot.includes("9 AM") ||
      a.timeSlot.includes("Morning") ||
      a.timeSlot.startsWith("08:") ||
      a.timeSlot.startsWith("09:") ||
      a.timeSlot.startsWith("10:") ||
      a.timeSlot.startsWith("11:") ||
      a.timeSlot.startsWith("12:") ||
      a.timeSlot.startsWith("13:") ||
      a.timeSlot.startsWith("01:") ||
      a.timeSlot.startsWith("1:")
    ).length;
    const onlineM = existingOnlineSlots.filter(s => { const [h] = s.startTime.split(":").map(Number); return h < 12; }).length;
    if (offlineM + onlineM >= morningMaxSlots) {
      res.status(409).json({ error: "slot_unavailable", message: "Morning session is fully booked for this date." });
      return;
    }
  } else if (isEvening) {
    const offlineE = existingOffline.filter(a =>
      a.timeSlot.includes("6 PM") ||
      a.timeSlot.includes("4 PM") ||
      a.timeSlot.includes("5 PM") ||
      a.timeSlot.includes("Evening") ||
      a.timeSlot.startsWith("16:") ||
      a.timeSlot.startsWith("17:") ||
      a.timeSlot.startsWith("18:") ||
      a.timeSlot.startsWith("19:") ||
      a.timeSlot.startsWith("20:") ||
      a.timeSlot.startsWith("21:") ||
      a.timeSlot.startsWith("04:") ||
      a.timeSlot.startsWith("05:") ||
      a.timeSlot.startsWith("06:") ||
      a.timeSlot.startsWith("07:") ||
      a.timeSlot.startsWith("08:") ||
      a.timeSlot.startsWith("09:")
    ).length;
    const onlineE = existingOnlineSlots.filter(s => { const [h] = s.startTime.split(":").map(Number); return h >= 12; }).length;
    if (offlineE + onlineE >= eveningMaxSlots) {
      res.status(409).json({ error: "slot_unavailable", message: "Evening session is fully booked for this date." });
      return;
    }
  }

  const existing = await db.select().from(appointmentsTable).where(
    and(
      eq(appointmentsTable.date, date),
      eq(appointmentsTable.timeSlot, timeSlot),
      eq(appointmentsTable.status, "confirmed"),
      eq(appointmentsTable.deleteColumn, 0)
    )
  );
  if (existing.length > 0) {
    res.status(409).json({ error: "slot_unavailable", message: "This time slot is already taken" });
    return;
  }

  // Generate daily queue token (T001, T002, etc.) and 24-hour secure upload token
  const existingCount = existingOffline.length;
  const tokenStr = `T${String(existingCount + 1).padStart(3, "0")}`;
  const uploadToken = randomBytes(32).toString("hex");

  const notesObj = {
    token: tokenStr,
    patientCode: patient.patientCode,
    uploadToken,
  };

  const [appt] = await db.insert(appointmentsTable).values({
    patientId: patient.id,
    patientName,
    patientPhone,
    patientEmail: patient.email,
    date,
    timeSlot,
    reason: reason ?? null,
    notes: JSON.stringify(notesObj),
    status: "pending",
  }).returning();

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  await db.insert(offlineQrTokensTable).values({
    token: uploadToken,
    patientId: patient.id,
    appointmentId: appt.id,
    expiresAt,
  });

  const frontendUrl = getFrontendUrl(req);
  const uploadUrl = `${frontendUrl}/portal/document-upload?token=${uploadToken}`;

  const serialized = {
    ...appt,
    patientId: patient.id,
    patientCode: patient.patientCode,
    token: tokenStr,
    uploadToken,
    uploadUrl,
    createdAt: appt.createdAt?.toISOString() ?? null,
    arrivedAt: null
  };
  notifyNewAppointment(serialized);

  const emailToUse = patient.email || appt.patientEmail;
  if (emailToUse) {
    console.log(`[appointment-email] source: patient_request type: offline email: sending to ${emailToUse}`);
    sendAppointmentAckEmail({
      to: emailToUse,
      patientName,
      type: "offline",
      date,
      timeSlot,
      reason: reason ?? undefined,
    }).catch((err) => console.error("[email] offline ack failed:", err));
  }

  res.status(201).json(serialized);
});

// ── Confirm Follow-up ─────────────────────────────────────────
router.patch("/appointments/:id/confirm-followup", requirePatient, async (req, res) => {
  const patient = (req as any).patient;
  const id = parseInt(req.params.id);
  const [appt] = await db.select().from(appointmentsTable).where(
    and(
      eq(appointmentsTable.id, id),
      eq(appointmentsTable.patientId, patient.id),
      eq(appointmentsTable.deleteColumn, 0)
    )
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
    and(
      eq(appointmentsTable.id, id),
      eq(appointmentsTable.patientId, patient.id),
      eq(appointmentsTable.deleteColumn, 0)
    )
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
    .where(and(
      eq(patientDocumentsTable.patientId, patient.id),
      eq(patientDocumentsTable.deleteColumn, 0)
    ))
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
  const [existing] = await db
    .select()
    .from(patientDocumentsTable)
    .where(and(eq(patientDocumentsTable.patientId, patient.id), eq(patientDocumentsTable.objectPath, objectPath)));
  if (existing) {
    if (existing.deleteColumn === 1) {
      const [reactivated] = await db.update(patientDocumentsTable)
        .set({ deleteColumn: 0, name, contentType, size })
        .where(eq(patientDocumentsTable.id, existing.id))
        .returning();
      res.json({ id: reactivated.id, name: reactivated.name, objectPath: reactivated.objectPath, contentType: reactivated.contentType, size: reactivated.size, createdAt: reactivated.createdAt?.toISOString() ?? null });
      return;
    }
    res.json({ id: existing.id, name: existing.name, objectPath: existing.objectPath, contentType: existing.contentType, size: existing.size, createdAt: existing.createdAt?.toISOString() ?? null });
    return;
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
    .where(and(
      eq(patientDocumentsTable.id, id),
      eq(patientDocumentsTable.patientId, patient.id),
      eq(patientDocumentsTable.deleteColumn, 0)
    ));
  if (!doc) { res.status(404).json({ error: "not_found" }); return; }
  await db.transaction(async (tx) => {
    // Remove this file from every appointment belonging to this patient.
    // Filter in SQL so concurrent attachment updates are not overwritten.
    await tx.update(onlineAppointmentsTable).set({
      documents: sql`coalesce((
        select json_agg(document order by position)
        from json_array_elements(${onlineAppointmentsTable.documents}) with ordinality as attached(document, position)
        where document->>'objectPath' is distinct from ${doc.objectPath}
      ), '[]'::json)`,
    }).where(eq(onlineAppointmentsTable.patientId, patient.id));
    await tx.update(patientDocumentsTable).set({ deleteColumn: 1 }).where(and(
      eq(patientDocumentsTable.patientId, patient.id),
      eq(patientDocumentsTable.objectPath, doc.objectPath),
    ));
  });
  res.json({ ok: true, objectPath: doc.objectPath });
});

// ── POST /api/patient/donations — record a donation ───────────
router.post("/donations", requirePatient, async (req: any, res) => {
  const patient = req.patient;
  const { amount, lastSixDigits, appointmentId } = req.body;

  const numericAmount = parseFloat(typeof amount === "string" ? amount.trim() : String(amount || ""));
  if (!amount || typeof amount !== "string" || amount.trim() === "" || isNaN(numericAmount) || numericAmount <= 0) {
    res.status(400).json({ error: "invalid_amount", message: "Donation amount must be greater than ₹0." });
    return;
  }
  if (!lastSixDigits || typeof lastSixDigits !== "string" || lastSixDigits.trim().length < 4) {
    res.status(400).json({ error: "last_six_required", message: "Please enter the last 4 to 6 digits of your transaction reference." });
    return;
  }

  const apptId = appointmentId ? parseInt(appointmentId) : null;
  let validAppointmentId: number | null = null;
  if (apptId && !isNaN(apptId) && apptId > 0) {
    try {
      const [existing] = await db
        .select({ id: onlineAppointmentsTable.id })
        .from(onlineAppointmentsTable)
        .where(eq(onlineAppointmentsTable.id, apptId))
        .limit(1);
      if (existing) {
        validAppointmentId = existing.id;
      } else {
        console.warn(`[Donations] appointmentId ${apptId} not found in online_appointments, saving as null`);
      }
    } catch (checkErr) {
      console.warn("[Donations] Error validating online appointment id:", checkErr);
    }
  }

  try {
    const [donation] = await db.insert(donationsTable).values({
      patientId: patient.id,
      appointmentId: validAppointmentId,
      patientCode: patient.patientCode ?? null,
      patientName: patient.name,
      patientEmail: patient.email,
      amount: amount.trim(),
      lastSixDigits: lastSixDigits.trim().slice(-6),
      status: "pending",
      thankYouSent: false,
      isSeen: false,
      deleteColumn: 0,
    }).returning();

    const donationPayload = {
      ...donation,
      createdAt: donation.createdAt instanceof Date ? donation.createdAt.toISOString() : new Date(donation.createdAt).toISOString(),
    };

    // Notify doctor and admin portals in real time
    try {
      broadcastNewDonation(donationPayload);
      notifyAdminNewDonation(donationPayload);
    } catch (sseErr) {
      console.error("[Donation SSE Broadcast Error]", sseErr);
    }

    res.json(donation);
  } catch (err: any) {
    console.error("[Donation Creation Error]", err);
    res.status(500).json({ error: "database_error", message: err?.message || "Failed to record donation. Please try again." });
  }
});

export default router;
