import { Router, Response } from "express";
import { db, patientsTable, appointmentsTable, loginTokensTable, siteSettingsTable, patientDocumentsTable, donationsTable, onlineAppointmentsTable, patientOtpsTable, onlineSlotsTable } from "@workspace/db";
import { eq, and, desc, ne, isNotNull, sql, or } from "drizzle-orm";
import {
  createPatientSession, deletePatientSession, requirePatient,
  verifyPatientSession, hashPassword, verifyPassword,
} from "../lib/patient-auth";
import { sendMagicLink, sendPasswordResetEmail, sendProfileEmailOtp, sendEmailChangeNotification } from "../lib/email";
import { sendMobileOtp } from "../lib/sms";
import { broadcastNewDonation } from "../lib/donationSse";
import { randomBytes, randomInt, createHash, timingSafeEqual } from "crypto";
import { z } from "zod/v4";
import { notifyNewAppointment } from "./appointments";
import { normalizePatientEmail, validatePatientPhone } from "@workspace/patient-contact";
import { normalizeVerificationEmail } from "../lib/verification";
import { addDirectCallPatientClient } from "../lib/directCallSse";
import { registerNewPatientWithNextId } from "../lib/patient-id";

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

function getFrontendUrl(req: any) {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/$/, "");

  const referer = req.get("referer") || req.get("origin");
  if (referer) {
    try {
      const u = new URL(referer);
      return u.origin;
    } catch {}
  }

  if (process.env.REPLIT_DEPLOYMENT === "1") {
    return process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  }
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (domain) return `https://${domain}`;

  const host = req.get("host") || "";
  if (host.includes(":5000")) {
    return `${req.protocol}://${host.replace(":5000", ":5173")}`;
  }
  return `${req.protocol}://${host}`;
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

router.post("/auth/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "validation_error",
      message: "Name, age, gender, address, email, country, phone number, and a password (min 6 chars) are required.",
    });
    return;
  }
  const { name, age, gender, address, password } = parsed.data;
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
    const [existingToken] = await db.select().from(loginTokensTable).where(eq(loginTokensTable.token, token));
    if (existingToken) {
      const [existingPatient] = await db.select().from(patientsTable).where(eq(patientsTable.id, existingToken.patientId));
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
  res.redirect(`${frontendUrl}${row.nextUrl ?? "/portal/dashboard"}`);
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
  const { newPhone } = req.body;
  const parsed = parseIndianPhoneNumber(newPhone);
  if (!parsed.valid) {
    res.status(400).json({ error: "validation_error", message: parsed.message });
    return;
  }

  if (req.patient.phone === parsed.formatted) {
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
  const otpHash = hashOtp(req.patient.id, parsed.formatted, otp);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const resendAfter = new Date(Date.now() + 60 * 1000);

  await db.insert(patientOtpsTable).values({
    patientId: req.patient.id,
    type: "phone_change",
    targetValue: parsed.formatted,
    otpHash,
    attempts: 0,
    expiresAt,
    resendAfter,
    verified: false,
  });

  // Send OTP directly to mobile number via SMS (do not send to email, do not log OTP in terminal)
  const smsResult = await sendMobileOtp({ phone: parsed.formatted, otp });
  if (!smsResult.success) {
    if (smsResult.error === "sms_not_configured") {
      res.status(503).json({
        error: "sms_not_configured",
        message: "SMS Gateway is not configured. Please add FAST2SMS_API_KEY (or your SMS provider key) in .env to deliver SMS.",
      });
      return;
    }
    res.status(502).json({
      error: "sms_send_failed",
      message: `Failed to deliver SMS to ${parsed.formatted}: ${smsResult.error || "Provider error"}. Please check your SMS provider balance.`,
    });
    return;
  }

  res.json({
    success: true,
    message: `Verification code sent via SMS to ${parsed.formatted}.`,
    cooldownSeconds: 60,
  });
});

// ── Profile: Verify Phone Change OTP ──────────────────────────
router.post("/profile/verify-phone-otp", requirePatient, async (req: any, res) => {
  const { newPhone, otp } = req.body;
  const parsed = parseIndianPhoneNumber(newPhone);
  if (!parsed.valid || !otp || typeof otp !== "string" || !/^\d{6}$/.test(otp.trim())) {
    res.status(400).json({ error: "validation_error", message: "Valid 10-digit Indian phone number and 6-digit code are required." });
    return;
  }

  const [record] = await db.select().from(patientOtpsTable).where(
    and(
      eq(patientOtpsTable.patientId, req.patient.id),
      eq(patientOtpsTable.type, "phone_change"),
      eq(patientOtpsTable.targetValue, parsed.formatted),
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

  const isValid = verifyOtpHash(req.patient.id, parsed.formatted, otp.trim(), record.otpHash);
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
    .set({ phone: parsed.formatted })
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
  const conditions = [eq(appointmentsTable.patientId, patient.id)];
  if (patient.email) {
    conditions.push(sql`lower(${appointmentsTable.patientEmail}) = ${patient.email.toLowerCase().trim()}`);
  }
  if (patient.phone) {
    conditions.push(eq(appointmentsTable.patientPhone, patient.phone));
  }

  const appts = await db
    .select()
    .from(appointmentsTable)
    .where(or(...conditions))
    .orderBy(desc(appointmentsTable.date));

  // Backfill patientId for matching records if missing
  for (const a of appts) {
    if (!a.patientId) {
      db.update(appointmentsTable).set({ patientId: patient.id }).where(eq(appointmentsTable.id, a.id)).catch(() => {});
      a.patientId = patient.id;
    }
  }

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

  const isMorning = timeSlot.includes("10 AM") || timeSlot.includes("Morning") || timeSlot.includes("9 AM");
  const isEvening = timeSlot.includes("6 PM") || timeSlot.includes("Evening") || timeSlot.includes("4 PM");

  if (date < todayStr) {
    res.status(400).json({ error: "date_passed", message: "Cannot book appointments for past dates." });
    return;
  }

  if (date === todayStr) {
    if (isMorning && currentMinutes >= 13 * 60) {
      res.status(400).json({ error: "session_expired", message: "Morning session has already ended. Please select another date or evening session." });
      return;
    }
    if (isEvening && currentMinutes >= 22 * 60) {
      res.status(400).json({ error: "session_expired", message: "Evening session has already ended. Please select another date." });
      return;
    }
  }

  // Check capacity for session (offline + online)
  const existingOffline = await db.select().from(appointmentsTable).where(
    and(eq(appointmentsTable.date, date), ne(appointmentsTable.status, "cancelled"))
  );
  const existingOnlineSlots = await db.select().from(onlineSlotsTable).where(
    and(eq(onlineSlotsTable.date, date), eq(onlineSlotsTable.isBooked, true))
  );

  if (isMorning) {
    const offlineM = existingOffline.filter(a =>
      a.timeSlot.includes("10 AM") ||
      a.timeSlot.includes("9 AM") ||
      a.timeSlot.includes("Morning") ||
      a.timeSlot.startsWith("08:") ||
      a.timeSlot.startsWith("09:") ||
      a.timeSlot.startsWith("10:") ||
      a.timeSlot.startsWith("11:")
    ).length;
    const onlineM = existingOnlineSlots.filter(s => { const [h] = s.startTime.split(":").map(Number); return h < 12; }).length;
    if (offlineM + onlineM >= 12) {
      res.status(409).json({ error: "slot_unavailable", message: "Morning session is fully booked for this date." });
      return;
    }
  } else if (isEvening) {
    const offlineE = existingOffline.filter(a =>
      a.timeSlot.includes("12 PM") ||
      a.timeSlot.includes("6 PM") ||
      a.timeSlot.includes("4 PM") ||
      a.timeSlot.includes("5 PM") ||
      a.timeSlot.includes("Evening") ||
      a.timeSlot.startsWith("12:") ||
      a.timeSlot.startsWith("13:") ||
      a.timeSlot.startsWith("14:") ||
      a.timeSlot.startsWith("15:") ||
      a.timeSlot.startsWith("04:") ||
      a.timeSlot.startsWith("05:") ||
      a.timeSlot.startsWith("06:") ||
      a.timeSlot.startsWith("07:") ||
      a.timeSlot.startsWith("08:") ||
      a.timeSlot.startsWith("09:") ||
      a.timeSlot.startsWith("16:") ||
      a.timeSlot.startsWith("17:") ||
      a.timeSlot.startsWith("18:") ||
      a.timeSlot.startsWith("19:") ||
      a.timeSlot.startsWith("20:") ||
      a.timeSlot.startsWith("21:")
    ).length;
    const onlineE = existingOnlineSlots.filter(s => { const [h] = s.startTime.split(":").map(Number); return h >= 12; }).length;
    if (offlineE + onlineE >= 16) {
      res.status(409).json({ error: "slot_unavailable", message: "Evening session is fully booked for this date." });
      return;
    }
  }

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

  const serialized = { ...appt, patientCode: patient.patientCode, createdAt: appt.createdAt?.toISOString() ?? null, arrivedAt: null };
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
  const [existing] = await db
    .select()
    .from(patientDocumentsTable)
    .where(and(eq(patientDocumentsTable.patientId, patient.id), eq(patientDocumentsTable.objectPath, objectPath)));
  if (existing) {
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
    .where(and(eq(patientDocumentsTable.id, id), eq(patientDocumentsTable.patientId, patient.id)));
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
    await tx.delete(patientDocumentsTable).where(and(
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
