import { Router } from "express";
import { db, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
      // If admin sends "••••••••" back (masked), skip it — keep existing pass
      if (key === "smtpPass" && req.body[key] === "••••••••") continue;
      updates[key] = req.body[key];
    }
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

export default router;
