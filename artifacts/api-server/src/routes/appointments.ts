import { Router, Response } from "express";
import { db, appointmentsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { CreateAppointmentBody, UpdateAppointmentBody } from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth";
import { verifyPatientSession } from "../lib/patient-auth";
import { sendAppointmentAckEmail } from "../lib/email";

const router = Router();

// ── SSE Notification Clients ──────────────────────────────────
const sseClients = new Set<Response>();

export function notifyNewAppointment(appt: any) {
  const payload = JSON.stringify({ type: "new_appointment", appointment: appt });
  for (const client of sseClients) {
    try { client.write(`data: ${payload}\n\n`); } catch { sseClients.delete(client); }
  }
}

export function notifyAdminCallEnded(apptId: number) {
  const payload = JSON.stringify({ type: "call_ended", apptId });
  for (const client of sseClients) {
    try { client.write(`data: ${payload}\n\n`); } catch { sseClients.delete(client); }
  }
}

router.get("/notifications", requireAdmin, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable Nginx/Replit proxy buffering
  res.setHeader("Transfer-Encoding", "chunked");
  res.flushHeaders();

  res.write(": connected\n\n");
  // Heartbeat every 10s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(heartbeat); }
  }, 10000);

  sseClients.add(res);
  req.on("close", () => { sseClients.delete(res); clearInterval(heartbeat); });
});

// ── Helper ────────────────────────────────────────────────────
function serializeAppt(a: any) {
  return {
    ...a,
    createdAt: a.createdAt?.toISOString() ?? null,
    arrivedAt: a.arrivedAt?.toISOString() ?? null,
  };
}

// ── Public: Book (walk-in) ────────────────────────────────────
router.post("/", async (req, res) => {
  const parsed = CreateAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }
  const data = parsed.data;

  const existing = await db
    .select()
    .from(appointmentsTable)
    .where(
      and(
        eq(appointmentsTable.date, data.date),
        eq(appointmentsTable.timeSlot, data.timeSlot),
        eq(appointmentsTable.status, "confirmed")
      )
    );

  if (existing.length > 0) {
    res.status(409).json({ error: "slot_unavailable", message: "This time slot is already booked" });
    return;
  }

  // Optionally link to a logged-in patient account
  let patientId: number | null = null;
  const patientToken = req.cookies?.patient_session;
  if (patientToken) {
    const linkedPatient = await verifyPatientSession(patientToken);
    if (linkedPatient) patientId = linkedPatient.id;
  }

  const [appointment] = await db
    .insert(appointmentsTable)
    .values({
      patientName: data.patientName,
      patientPhone: data.patientPhone,
      patientEmail: data.patientEmail ?? null,
      date: data.date,
      timeSlot: data.timeSlot,
      reason: data.reason ?? null,
      status: "pending",
      patientId,
    })
    .returning();

  const serialized = serializeAppt(appointment);
  notifyNewAppointment(serialized);

  // Send acknowledgement email if patient provided email (fire and forget)
  if (data.patientEmail) {
    sendAppointmentAckEmail({
      to: data.patientEmail,
      patientName: data.patientName,
      type: "offline",
      date: data.date,
      timeSlot: data.timeSlot,
      reason: data.reason ?? undefined,
    }).catch((err) => console.error("[email] offline ack failed:", err));
  }

  res.status(201).json(serialized);
});

// ── Admin: List ───────────────────────────────────────────────
router.get("/", requireAdmin, async (req, res) => {
  const { status, date, month } = req.query as Record<string, string>;
  let query = db.select().from(appointmentsTable);

  const conditions = [];
  if (status) conditions.push(eq(appointmentsTable.status, status));
  if (date) conditions.push(eq(appointmentsTable.date, date));

  const appts = await query.$dynamic()
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(appointmentsTable.createdAt));

  let filtered = appts;
  if (month) filtered = appts.filter((a) => a.date.startsWith(month));

  res.json(filtered.map(serializeAppt));
});

// ── Admin: Get one ────────────────────────────────────────────
router.get("/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const [appt] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, id));
  if (!appt) { res.status(404).json({ error: "not_found" }); return; }
  res.json(serializeAppt(appt));
});

// ── Admin: Update (approve / cancel / notes) ──────────────────
router.patch("/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = UpdateAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;

  const [updated] = await db.update(appointmentsTable).set(updates).where(eq(appointmentsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "not_found" }); return; }
  res.json(serializeAppt(updated));
});

// ── Admin: Mark Arrived ───────────────────────────────────────
router.patch("/:id/arrive", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const [updated] = await db.update(appointmentsTable)
    .set({ arrivedAt: new Date(), status: "arrived" })
    .where(eq(appointmentsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "not_found" }); return; }
  res.json(serializeAppt(updated));
});

// ── Admin: Mark Paid ──────────────────────────────────────────
router.patch("/:id/pay", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { mode } = req.body;
  if (!["cash", "upi"].includes(mode)) {
    res.status(400).json({ error: "invalid_mode", message: "mode must be cash or upi" });
    return;
  }
  const [updated] = await db.update(appointmentsTable)
    .set({ paymentStatus: "paid", paymentMode: mode, status: "completed" })
    .where(eq(appointmentsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "not_found" }); return; }
  res.json(serializeAppt(updated));
});

// ── Admin: Propose Reschedule ─────────────────────────────────
router.patch("/:id/reschedule", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { dates } = req.body;
  if (!Array.isArray(dates) || dates.length === 0) {
    res.status(400).json({ error: "invalid_dates" }); return;
  }
  const [updated] = await db.update(appointmentsTable)
    .set({ rescheduleDates: JSON.stringify(dates), status: "reschedule_proposed" })
    .where(eq(appointmentsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "not_found" }); return; }
  res.json(serializeAppt(updated));
});

// ── Admin: Set Follow-up Date ─────────────────────────────────
router.patch("/:id/followup", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { followUpDate } = req.body;
  if (!followUpDate) { res.status(400).json({ error: "missing_date" }); return; }
  const [updated] = await db.update(appointmentsTable)
    .set({ followUpDate, followUpConfirmed: false })
    .where(eq(appointmentsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "not_found" }); return; }
  res.json(serializeAppt(updated));
});

// ── Admin: Delete ─────────────────────────────────────────────
router.delete("/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(appointmentsTable).where(eq(appointmentsTable.id, id));
  res.status(204).send();
});

export default router;
