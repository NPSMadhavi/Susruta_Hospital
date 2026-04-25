import { Router } from "express";
import { db, siteSettingsTable, patientsTable, loginTokensTable, patientSessionsTable, onlineAppointmentsTable, prescriptionsTable, donationsTable } from "@workspace/db";
import { eq, desc, inArray, and, gte, lte } from "drizzle-orm";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { createAdminSession, deleteAdminSession, requireAdmin } from "../lib/auth";
import { sendMagicLink, testSmtpConnection, sendDonationThankYou, type SmtpConfig } from "../lib/email";
import { addDonationSseClient, broadcastDonationUpdate } from "../lib/donationSse";

const router = Router();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "susruta2024";

const SETTINGS_FIELDS = [
  "testimonialsEnabled", "appointmentBookingEnabled", "clinicPhone1",
  "clinicPhone2", "clinicEmail", "clinicAddress", "workingHours",
  "smtpHost", "smtpPort", "smtpUser", "smtpPass", "smtpSecure",
  "smtpFromName", "smtpFromEmail", "smtpSubscriberFrom",
  "meetingLink",
] as const;

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "invalid_credentials", message: "Invalid username or password" });
    return;
  }
  const token = await createAdminSession();
  res.cookie("admin_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ success: true, message: "Logged in successfully" });
});

router.post("/logout", async (req, res) => {
  const token = req.cookies?.admin_session;
  if (token) {
    await deleteAdminSession(token);
    res.clearCookie("admin_session");
  }
  res.json({ success: true, message: "Logged out" });
});

router.get("/me", async (req, res) => {
  const token = req.cookies?.admin_session;
  if (!token) {
    res.status(401).json({ error: "unauthorized", message: "Not authenticated" });
    return;
  }
  const { verifyAdminSession } = await import("../lib/auth");
  const valid = await verifyAdminSession(token);
  if (!valid) {
    res.status(401).json({ error: "unauthorized", message: "Session expired or invalid" });
    return;
  }
  res.json({ username: ADMIN_USERNAME, isAdmin: true });
});

async function getOrCreateSettings() {
  let [settings] = await db.select().from(siteSettingsTable);
  if (!settings) {
    [settings] = await db
      .insert(siteSettingsTable)
      .values({
        testimonialsEnabled: true,
        appointmentBookingEnabled: true,
        clinicPhone1: "9492068180",
        clinicPhone2: "0877-2220663",
        clinicEmail: null,
        clinicAddress: "119, Ramulavari North Mada Street, Tirupati - 517 507",
        workingHours: "Mon-Sat: 9:00 AM - 1:00 PM, 4:00 PM - 7:00 PM",
        smtpFromName: "Susruta Hospital",
        smtpFromEmail: "noreply@susrutahospital.com",
        smtpSubscriberFrom: "updates@susrutahospital.com",
        smtpSecure: false,
      })
      .returning();
  }
  return settings;
}

function serializeSettings(s: typeof siteSettingsTable.$inferSelect) {
  return {
    testimonialsEnabled: s.testimonialsEnabled,
    appointmentBookingEnabled: s.appointmentBookingEnabled,
    clinicPhone1: s.clinicPhone1,
    clinicPhone2: s.clinicPhone2,
    clinicEmail: s.clinicEmail,
    clinicAddress: s.clinicAddress,
    workingHours: s.workingHours,
    smtpHost: s.smtpHost,
    smtpPort: s.smtpPort,
    smtpUser: s.smtpUser,
    smtpPass: s.smtpPass ? "••••••••" : null,
    smtpSecure: s.smtpSecure,
    smtpFromName: s.smtpFromName,
    smtpFromEmail: s.smtpFromEmail,
    smtpSubscriberFrom: s.smtpSubscriberFrom,
    smtpConfigured: !!(s.smtpHost && s.smtpUser && s.smtpPass),
    doctorPortalConfigured: !!s.doctorPasswordHash,
    pharmacyPortalConfigured: !!s.pharmacyPasswordHash,
    meetingLink: s.meetingLink ?? null,
    phonepeQrObjectPath: s.phonepeQrObjectPath ?? null,
    patientIdPrefix: s.patientIdPrefix,
    patientIdCurrentNumber: s.patientIdCurrentNumber,
    // Computed: current patient ID display (last assigned)
    currentPatientId: s.patientIdCurrentNumber > 0
      ? `${s.patientIdPrefix}${s.patientIdCurrentNumber.toString().padStart(3, "0")}`
      : null,
  };
}

router.get("/settings", async (_req, res) => {
  const settings = await getOrCreateSettings();
  res.json(serializeSettings(settings));
});

router.patch("/settings", requireAdmin, async (req, res) => {
  const updates: Record<string, unknown> = {};
  for (const key of SETTINGS_FIELDS) {
    if (req.body[key] !== undefined) {
      if (key === "smtpPass" && req.body[key] === "••••••••") continue;
      updates[key] = req.body[key];
    }
  }
  // Handle doctor password separately — hash before storing
  if (req.body.doctorPassword && req.body.doctorPassword.trim()) {
    updates.doctorPasswordHash = await bcrypt.hash(req.body.doctorPassword, 12);
  }
  // Handle pharmacy password separately — hash before storing
  if (req.body.pharmacyPassword && req.body.pharmacyPassword.trim()) {
    updates.pharmacyPasswordHash = await bcrypt.hash(req.body.pharmacyPassword, 12);
  }
  // Handle PhonePe QR object path
  if (req.body.phonepeQrObjectPath !== undefined) {
    updates.phonepeQrObjectPath = req.body.phonepeQrObjectPath;
  }
  // Patient ID counter — admin can manually set prefix and current number
  if (req.body.patientIdPrefix !== undefined) {
    const prefix = String(req.body.patientIdPrefix).toUpperCase().trim();
    if (/^[A-Z]$/.test(prefix)) updates.patientIdPrefix = prefix;
  }
  if (req.body.patientIdCurrentNumber !== undefined) {
    const num = parseInt(req.body.patientIdCurrentNumber);
    if (!isNaN(num) && num >= 0 && num <= 999) updates.patientIdCurrentNumber = num;
  }

  updates.updatedAt = new Date();

  const existing = await getOrCreateSettings();
  const [updated] = await db
    .update(siteSettingsTable)
    .set(updates)
    .where(eq(siteSettingsTable.id, existing.id))
    .returning();

  res.json(serializeSettings(updated));
});

// ── SMTP Test ─────────────────────────────────────────────────
router.post("/smtp-test", requireAdmin, async (req, res) => {
  const { host, port, user, pass, secure, fromName, fromEmail, subscriberFrom, testTo } = req.body;
  if (!host || !user || !testTo) {
    res.status(400).json({ error: "missing_fields", message: "Host, username, and test recipient email are required." });
    return;
  }

  // If the password is the masked placeholder, use the stored password from DB
  let resolvedPass = pass;
  if (!resolvedPass || resolvedPass === "••••••••") {
    const settings = await getOrCreateSettings();
    resolvedPass = settings.smtpPass;
    if (!resolvedPass) {
      res.status(400).json({ error: "missing_password", message: "No SMTP password saved yet. Please enter your password and save settings first." });
      return;
    }
  }

  const cfg: SmtpConfig = {
    host,
    port: parseInt(port) || 587,
    user,
    pass: resolvedPass,
    secure: !!secure,
    fromName: fromName || "Susruta Hospital",
    fromEmail: fromEmail || "noreply@susrutahospital.com",
    subscriberFrom: subscriberFrom || "updates@susrutahospital.com",
  };

  try {
    await testSmtpConnection(cfg, testTo);
    res.json({ success: true, message: `Test email sent to ${testTo}. Check your inbox!` });
  } catch (err: any) {
    res.status(400).json({ error: "smtp_error", message: err.message || "SMTP connection failed." });
  }
});

// ── GET /admin/patients — list all registered patients ────────
router.get("/patients", requireAdmin, async (_req, res) => {
  try {
    const patients = await db
      .select({
        id: patientsTable.id,
        patientCode: patientsTable.patientCode,
        name: patientsTable.name,
        email: patientsTable.email,
        phone: patientsTable.phone,
        emailVerified: patientsTable.emailVerified,
        createdAt: patientsTable.createdAt,
      })
      .from(patientsTable)
      .orderBy(desc(patientsTable.createdAt));
    res.json(patients);
  } catch (err) {
    console.error("Admin patients list error:", err);
    res.status(500).json({ error: "Failed to fetch patients" });
  }
});

// ── POST /admin/patients/:id/resend-verification ───────────────
router.post("/patients/:id/resend-verification", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "invalid_id" }); return; }

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, id));
  if (!patient) { res.status(404).json({ error: "not_found" }); return; }
  if (patient.emailVerified) {
    res.status(400).json({ error: "already_verified", message: "Email is already verified." });
    return;
  }

  // Invalidate old tokens
  await db.update(loginTokensTable).set({ used: true }).where(eq(loginTokensTable.patientId, id));

  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(loginTokensTable).values({ token, patientId: id, nextUrl: "/portal/dashboard", expiresAt, used: false });

  let frontendUrl: string;
  if (process.env.REPLIT_DEPLOYMENT === "1") {
    frontendUrl = process.env.APP_URL || "https://susrutahospital.com";
  } else {
    const domain = process.env.REPLIT_DEV_DOMAIN;
    frontendUrl = domain ? `https://${domain}` : (process.env.APP_URL || "https://susrutahospital.com");
  }
  const verifyUrl = `${frontendUrl}/api/patient/auth/verify?token=${token}`;

  sendMagicLink({ to: patient.email, name: patient.name, verifyUrl, isNewAccount: true }).catch(() => {});

  res.json({ success: true, message: `Verification email sent to ${patient.email}` });
});

// ── DELETE /admin/patients/:id ─────────────────────────────────
router.delete("/patients/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "invalid_id" }); return; }

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, id));
  if (!patient) { res.status(404).json({ error: "not_found" }); return; }

  // Delete in FK-safe order
  const appts = await db.select({ id: onlineAppointmentsTable.id })
    .from(onlineAppointmentsTable).where(eq(onlineAppointmentsTable.patientId, id));
  if (appts.length > 0) {
    const apptIds = appts.map(a => a.id);
    await db.delete(prescriptionsTable).where(inArray(prescriptionsTable.onlineAppointmentId, apptIds));
  }
  await db.delete(onlineAppointmentsTable).where(eq(onlineAppointmentsTable.patientId, id));
  await db.delete(patientSessionsTable).where(eq(patientSessionsTable.patientId, id));
  await db.delete(loginTokensTable).where(eq(loginTokensTable.patientId, id));
  await db.delete(patientsTable).where(eq(patientsTable.id, id));

  res.json({ success: true });
});

// ── GET /admin/donations/sse — live updates ────────────────────
router.get("/donations/sse", requireAdmin, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(": connected\n\n");

  const cleanup = addDonationSseClient("admin", res);
  const heartbeat = setInterval(() => { try { res.write(": ping\n\n"); } catch { clearInterval(heartbeat); } }, 15000);
  req.on("close", () => { cleanup(); clearInterval(heartbeat); });
});

// ── GET /admin/donations ───────────────────────────────────────
router.get("/donations", requireAdmin, async (req, res) => {
  try {
    const { month, year } = req.query;
    let query = db.select().from(donationsTable).orderBy(desc(donationsTable.createdAt));

    if (month && year) {
      const y = parseInt(year as string);
      const m = parseInt(month as string);
      if (!isNaN(y) && !isNaN(m)) {
        const from = new Date(y, m - 1, 1);
        const to = new Date(y, m, 1);
        query = db.select().from(donationsTable)
          .where(and(gte(donationsTable.createdAt, from), lte(donationsTable.createdAt, to)))
          .orderBy(desc(donationsTable.createdAt)) as any;
      }
    }

    const rows = await query;
    res.json(rows);
  } catch (err) {
    console.error("Admin donations list error:", err);
    res.status(500).json({ error: "Failed to fetch donations" });
  }
});

// ── PATCH /admin/donations/:id/verify ─────────────────────────
router.patch("/donations/:id/verify", requireAdmin, async (req, res) => {
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

// ── POST /admin/donations/:id/thank-you ────────────────────────
router.post("/donations/:id/thank-you", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "invalid_id" }); return; }

  const [donation] = await db.select().from(donationsTable).where(eq(donationsTable.id, id));
  if (!donation) { res.status(404).json({ error: "not_found" }); return; }
  if (!donation.patientEmail) { res.status(400).json({ error: "no_email" }); return; }

  try {
    const donationDate = new Date(donation.createdAt).toLocaleDateString("en-IN", {
      day: "numeric", month: "long", year: "numeric",
    });
    await sendDonationThankYou({
      to: donation.patientEmail,
      name: donation.patientName || "Patient",
      patientCode: donation.patientCode,
      amount: donation.amount,
      lastSixDigits: donation.lastSixDigits,
      donationDate,
    });
    await db.update(donationsTable).set({ thankYouSent: true }).where(eq(donationsTable.id, id));
    broadcastDonationUpdate({ id, status: donation.status, thankYouSent: true });
    res.json({ success: true });
  } catch (err) {
    console.error("Thank you email error:", err);
    res.status(500).json({ error: "email_failed", message: "Failed to send email. Check SMTP settings." });
  }
});

export default router;
