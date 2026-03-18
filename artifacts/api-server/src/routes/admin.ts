import { Router } from "express";
import { db, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createAdminSession, deleteAdminSession, requireAdmin } from "../lib/auth";

const router = Router();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "susruta2024";

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

router.get("/settings", async (req, res) => {
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
      })
      .returning();
  }
  res.json({
    testimonialsEnabled: settings.testimonialsEnabled,
    appointmentBookingEnabled: settings.appointmentBookingEnabled,
    clinicPhone1: settings.clinicPhone1,
    clinicPhone2: settings.clinicPhone2,
    clinicEmail: settings.clinicEmail,
    clinicAddress: settings.clinicAddress,
    workingHours: settings.workingHours,
  });
});

router.patch("/settings", requireAdmin, async (req, res) => {
  const allowed = [
    "testimonialsEnabled", "appointmentBookingEnabled", "clinicPhone1",
    "clinicPhone2", "clinicEmail", "clinicAddress", "workingHours"
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  updates.updatedAt = new Date();

  const [existing] = await db.select().from(siteSettingsTable);
  let updated;
  if (existing) {
    [updated] = await db
      .update(siteSettingsTable)
      .set(updates)
      .where(eq(siteSettingsTable.id, existing.id))
      .returning();
  } else {
    [updated] = await db.insert(siteSettingsTable).values(updates as any).returning();
  }
  res.json({
    testimonialsEnabled: updated.testimonialsEnabled,
    appointmentBookingEnabled: updated.appointmentBookingEnabled,
    clinicPhone1: updated.clinicPhone1,
    clinicPhone2: updated.clinicPhone2,
    clinicEmail: updated.clinicEmail,
    clinicAddress: updated.clinicAddress,
    workingHours: updated.workingHours,
  });
});

export default router;
