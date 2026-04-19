import { Router } from "express";
import { db, siteSettingsTable, patientsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createAdminSession, deleteAdminSession, requireAdmin } from "../lib/auth";
import { testSmtpConnection, type SmtpConfig } from "../lib/email";

const router = Router();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "susruta2024";

const SETTINGS_FIELDS = [
  "testimonialsEnabled", "appointmentBookingEnabled", "clinicPhone1",
  "clinicPhone2", "clinicEmail", "clinicAddress", "workingHours",
  "smtpHost", "smtpPort", "smtpUser", "smtpPass", "smtpSecure",
  "smtpFromName", "smtpFromEmail", "smtpSubscriberFrom",
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
    phonepeQrObjectPath: s.phonepeQrObjectPath ?? null,
    // Online consultation settings
    meetingLink: s.meetingLink ?? null,
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
  // Meeting link
  if (req.body.meetingLink !== undefined) {
    updates.meetingLink = req.body.meetingLink || null;
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
  if (!host || !user || !pass || !testTo) {
    res.status(400).json({ error: "missing_fields", message: "Host, username, password and test recipient email are required." });
    return;
  }

  const cfg: SmtpConfig = {
    host,
    port: parseInt(port) || 587,
    user,
    pass,
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

export default router;
