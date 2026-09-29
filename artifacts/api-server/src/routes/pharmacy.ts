import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { db, siteSettingsTable, medicineOrdersTable, medicineOrderItemsTable, patientsTable } from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { requirePharmacy, createPharmacySession, deletePharmacySession, verifyPharmacySession } from "../lib/pharmacy-auth";
import { getSmtpConfig } from "../lib/email";
import nodemailer from "nodemailer";

const router = Router();

// ── SSE clients set ───────────────────────────────────────────
export const pharmacySseClients = new Set<Response>();

export function notifyPharmacySse(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of pharmacySseClients) {
    try { client.write(payload); } catch { pharmacySseClients.delete(client); }
  }
}

// ── POST /api/pharmacy/login ──────────────────────────────────
router.post("/login", async (req, res) => {
  const { password } = req.body;
  if (!password) { res.status(400).json({ error: "password_required" }); return; }

  const [settings] = await db.select().from(siteSettingsTable);
  if (!settings?.pharmacyPasswordHash) {
    res.status(403).json({ error: "not_configured", message: "Pharmacy portal not yet configured. Contact admin." });
    return;
  }

  const valid = await bcrypt.compare(password, settings.pharmacyPasswordHash);
  if (!valid) { res.status(401).json({ error: "invalid_password", message: "Incorrect password." }); return; }

  const token = await createPharmacySession();
  res.cookie("pharmacy_session", token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ success: true });
});

// ── POST /api/pharmacy/logout ─────────────────────────────────
router.post("/logout", async (req, res) => {
  const token = req.cookies?.pharmacy_session;
  if (token) { await deletePharmacySession(token); }
  res.clearCookie("pharmacy_session");
  res.json({ success: true });
});

// ── GET /api/pharmacy/me ──────────────────────────────────────
router.get("/me", async (req, res) => {
  const token = req.cookies?.pharmacy_session;
  const valid = await verifyPharmacySession(token);
  if (!valid) { res.status(401).json({ error: "unauthorized" }); return; }
  res.json({ authenticated: true });
});

// ── GET /api/pharmacy/sse — Real-time notifications ───────────
router.get("/sse", requirePharmacy, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(": connected\n\n");
  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(heartbeat); }
  }, 10000);

  pharmacySseClients.add(res);
  req.on("close", () => { pharmacySseClients.delete(res); clearInterval(heartbeat); });
});

// ── GET /api/pharmacy/orders — All orders ────────────────────
router.get("/orders", requirePharmacy, async (_req, res) => {
  const rows = await db
    .select({ order: medicineOrdersTable, patient: patientsTable })
    .from(medicineOrdersTable)
    .innerJoin(patientsTable, eq(medicineOrdersTable.patientId, patientsTable.id))
    .orderBy(desc(medicineOrdersTable.createdAt));

  const orderIds = rows.map(r => r.order.id);
  const allItems = orderIds.length > 0
    ? await db.select().from(medicineOrderItemsTable).where(inArray(medicineOrderItemsTable.orderId, orderIds))
    : [];

  // Build items map
  const itemsMap: Record<number, typeof allItems> = {};
  for (const item of allItems) {
    if (!itemsMap[item.orderId]) itemsMap[item.orderId] = [];
    itemsMap[item.orderId].push(item);
  }

  res.json(rows.map(r => ({
    id: r.order.id,
    status: r.order.status,
    deliveryAddress: r.order.deliveryAddress,
    phone: r.order.phone,
    trackingNumber: r.order.trackingNumber,
    pharmacistNotes: r.order.pharmacistNotes,
    appointmentId: r.order.appointmentId,
    appointmentType: r.order.appointmentType,
    createdAt: r.order.createdAt.toISOString(),
    updatedAt: r.order.updatedAt.toISOString(),
    patient: { id: r.patient.id, name: r.patient.name, email: r.patient.email, phone: r.patient.phone },
    items: (itemsMap[r.order.id] ?? []).map(it => ({
      id: it.id, medicineName: it.medicineName, instructions: it.instructions,
      qty: it.qty, available: it.available,
    })),
  })));
});

// ── PATCH /api/pharmacy/orders/:id/availability ───────────────
const AvailBody = z.object({
  items: z.array(z.object({ id: z.number().int(), available: z.boolean() })),
  notes: z.string().optional(),
});

router.patch("/orders/:id/availability", requirePharmacy, async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = AvailBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation_error" }); return; }

  const [order] = await db.select().from(medicineOrdersTable).where(eq(medicineOrdersTable.id, id));
  if (!order) { res.status(404).json({ error: "not_found" }); return; }

  const { items, notes } = parsed.data;
  const hasUnavailable = items.some(it => !it.available);

  // Update each item's availability
  for (const item of items) {
    await db.update(medicineOrderItemsTable)
      .set({ available: item.available })
      .where(eq(medicineOrderItemsTable.id, item.id));
  }

  const newStatus = hasUnavailable ? "partial_approval_needed" : "payment_requested";
  const [updated] = await db.update(medicineOrdersTable)
    .set({ status: newStatus, pharmacistNotes: notes ?? order.pharmacistNotes, updatedAt: new Date() })
    .where(eq(medicineOrdersTable.id, id))
    .returning();

  // If partial, email patient
  if (hasUnavailable) {
    const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, order.patientId));
    if (patient && patient.email) {
      sendPartialEmail(patient.email, patient.name, id).catch(() => {});
    }
  }

  // Notify SSE
  notifyPharmacySse("order_updated", { id, status: newStatus });

  res.json(updated);
});

// ── PATCH /api/pharmacy/orders/:id/request-payment ───────────
router.patch("/orders/:id/request-payment", requirePharmacy, async (req, res) => {
  const id = parseInt(req.params.id);
  const [order] = await db.select().from(medicineOrdersTable).where(eq(medicineOrdersTable.id, id));
  if (!order) { res.status(404).json({ error: "not_found" }); return; }

  const [updated] = await db.update(medicineOrdersTable)
    .set({ status: "payment_requested", updatedAt: new Date() })
    .where(eq(medicineOrdersTable.id, id))
    .returning();

  notifyPharmacySse("order_updated", { id, status: "payment_requested" });
  res.json(updated);
});

// ── PATCH /api/pharmacy/orders/:id/payment-confirmed ─────────
router.patch("/orders/:id/payment-confirmed", requirePharmacy, async (req, res) => {
  const id = parseInt(req.params.id);
  const [updated] = await db.update(medicineOrdersTable)
    .set({ status: "payment_confirmed", updatedAt: new Date() })
    .where(eq(medicineOrdersTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "not_found" }); return; }
  notifyPharmacySse("order_updated", { id, status: "payment_confirmed" });
  res.json(updated);
});

// ── PATCH /api/pharmacy/orders/:id/shipping ───────────────────
const ShipBody = z.object({ trackingNumber: z.string().min(1) });

router.patch("/orders/:id/shipping", requirePharmacy, async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = ShipBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation_error" }); return; }

  const [updated] = await db.update(medicineOrdersTable)
    .set({ status: "shipped", trackingNumber: parsed.data.trackingNumber, updatedAt: new Date() })
    .where(eq(medicineOrdersTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "not_found" }); return; }

  notifyPharmacySse("order_updated", { id, status: "shipped" });
  res.json(updated);
});

// ── GET /api/pharmacy/settings (QR code) ─────────────────────
router.get("/settings", async (_req, res) => {
  const [settings] = await db.select().from(siteSettingsTable);
  res.json({ phonepeQrObjectPath: settings?.phonepeQrObjectPath ?? null });
});

// ── Helper: send partial availability email to patient ────────
async function sendPartialEmail(to: string, name: string, orderId: number) {
  const cfg = await getSmtpConfig();
  if (!cfg) return;
  const transport = nodemailer.createTransport({
    host: cfg.host, port: cfg.port, secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: false },
  });
  await transport.sendMail({
    from: `${cfg.fromName} <${cfg.fromEmail}>`,
    to,
    subject: "Susruta Hospital — Medicine Order Update (Action Required)",
    text: `Dear ${name},\n\nSome medicines in your order #${orderId} are currently unavailable. Our pharmacy has updated your order. Please log in to your patient portal to review and approve the updated order.\n\nSusruta Hospital · Tirupati`,
    html: `<p>Dear <strong>${name}</strong>,</p><p>Some medicines in your <strong>Order #${orderId}</strong> are currently unavailable at our pharmacy. Please <a href="https://susrutahospital.com/portal">log in to your portal</a> to review and approve the updated order before we proceed.</p><p>— Susruta Hospital, Tirupati</p>`,
  });
}

export default router;
