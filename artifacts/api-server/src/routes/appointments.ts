import { Router } from "express";
import { db, appointmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateAppointmentBody, UpdateAppointmentBody } from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth";

const router = Router();

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
    })
    .returning();

  res.status(201).json({
    ...appointment,
    createdAt: appointment.createdAt.toISOString(),
  });
});

router.get("/", requireAdmin, async (req, res) => {
  const { status, date, month } = req.query as Record<string, string>;
  let query = db.select().from(appointmentsTable);

  const conditions = [];
  if (status) conditions.push(eq(appointmentsTable.status, status));
  if (date) conditions.push(eq(appointmentsTable.date, date));

  const appts = await query.$dynamic().where(conditions.length > 0 ? and(...conditions) : undefined).orderBy(appointmentsTable.date, appointmentsTable.timeSlot);

  let filtered = appts;
  if (month) {
    filtered = appts.filter((a) => a.date.startsWith(month));
  }

  res.json(filtered.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })));
});

router.get("/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const [appt] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, id));
  if (!appt) {
    res.status(404).json({ error: "not_found", message: "Appointment not found" });
    return;
  }
  res.json({ ...appt, createdAt: appt.createdAt.toISOString() });
});

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

  const [updated] = await db
    .update(appointmentsTable)
    .set(updates)
    .where(eq(appointmentsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "not_found", message: "Appointment not found" });
    return;
  }
  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

router.delete("/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(appointmentsTable).where(eq(appointmentsTable.id, id));
  res.status(204).send();
});

export default router;
