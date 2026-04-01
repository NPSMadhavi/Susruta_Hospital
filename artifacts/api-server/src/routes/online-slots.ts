import { Router } from "express";
import { db, onlineSlotSessionsTable, onlineSlotsTable, onlineAppointmentsTable } from "@workspace/db";
import { eq, desc, and, gte } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { z } from "zod/v4";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────
function generateSlots(startTime: string, endTime: string, intervalMinutes: number): Array<{ startTime: string; endTime: string }> {
  const slots: Array<{ startTime: string; endTime: string }> = [];
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let current = sh * 60 + sm;
  const end = eh * 60 + em;
  while (current + intervalMinutes <= end) {
    const s = `${String(Math.floor(current / 60)).padStart(2, "0")}:${String(current % 60).padStart(2, "0")}`;
    current += intervalMinutes;
    const e = `${String(Math.floor(current / 60)).padStart(2, "0")}:${String(current % 60).padStart(2, "0")}`;
    slots.push({ startTime: s, endTime: e });
  }
  return slots;
}

// ── Admin: POST /api/online-slots/sessions ────────────────────
const CreateSessionBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  intervalMinutes: z.coerce.number().refine((v) => v === 15 || v === 30, {
    message: "intervalMinutes must be 15 or 30",
  }),
});

router.post("/sessions", requireAdmin, async (req, res) => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation_error", issues: parsed.error.issues }); return; }

  const { date, startTime, endTime, intervalMinutes } = parsed.data;

  // Prevent duplicate sessions for the same date
  const existing = await db.select().from(onlineSlotSessionsTable).where(eq(onlineSlotSessionsTable.date, date));
  if (existing.length > 0) {
    res.status(409).json({ error: "duplicate", message: `A session already exists for ${date}. Delete it first before creating a new one.` });
    return;
  }

  const slots = generateSlots(startTime, endTime, intervalMinutes);
  if (slots.length === 0) {
    res.status(400).json({ error: "no_slots", message: "The selected time range and interval produce no slots." });
    return;
  }

  const [session] = await db
    .insert(onlineSlotSessionsTable)
    .values({ date, startTime, endTime, intervalMinutes, maxBookings: slots.length })
    .returning();

  // Insert all individual slots
  await db.insert(onlineSlotsTable).values(
    slots.map((s) => ({ sessionId: session.id, date, startTime: s.startTime, endTime: s.endTime }))
  );

  const createdSlots = await db.select().from(onlineSlotsTable).where(eq(onlineSlotsTable.sessionId, session.id));

  res.status(201).json({ session, slots: createdSlots });
});

// ── Admin: GET /api/online-slots/sessions ────────────────────
router.get("/sessions", requireAdmin, async (_req, res) => {
  const sessions = await db
    .select()
    .from(onlineSlotSessionsTable)
    .orderBy(desc(onlineSlotSessionsTable.date));

  const allSlots = await db.select().from(onlineSlotsTable);
  const allAppts = await db.select().from(onlineAppointmentsTable);

  const slotsBySession = allSlots.reduce<Record<number, typeof allSlots>>((acc, s) => {
    (acc[s.sessionId] ||= []).push(s);
    return acc;
  }, {});

  const apptsBySlot = allAppts.reduce<Record<number, typeof allAppts>>((acc, a) => {
    (acc[a.slotId] ||= []).push(a);
    return acc;
  }, {});

  res.json(sessions.map((sess) => {
    const slots = slotsBySession[sess.id] ?? [];
    return {
      ...sess,
      slots: slots.map((sl) => ({
        ...sl,
        bookingCount: (apptsBySlot[sl.id] ?? []).filter((a) => a.status !== "cancelled").length,
      })),
    };
  }));
});

// ── Admin: DELETE /api/online-slots/sessions/:id ──────────────
router.delete("/sessions/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(onlineSlotSessionsTable).where(eq(onlineSlotSessionsTable.id, id));
  res.status(204).send();
});

// ── Public: GET /api/online-slots/available ───────────────────
// Returns only future slots that are not booked
router.get("/available", async (_req, res) => {
  const today = new Date().toISOString().split("T")[0];

  const slots = await db
    .select({
      slot: onlineSlotsTable,
      session: onlineSlotSessionsTable,
    })
    .from(onlineSlotsTable)
    .innerJoin(onlineSlotSessionsTable, eq(onlineSlotsTable.sessionId, onlineSlotSessionsTable.id))
    .where(and(
      eq(onlineSlotsTable.isBooked, false),
      gte(onlineSlotsTable.date, today)
    ));

  // Group by date
  const byDate: Record<string, any[]> = {};
  for (const r of slots) {
    const d = r.slot.date as string;
    (byDate[d] ||= []).push({
      id: r.slot.id,
      date: r.slot.date,
      startTime: r.slot.startTime,
      endTime: r.slot.endTime,
      intervalMinutes: r.session.intervalMinutes,
    });
  }

  res.json(Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, slots]) => ({ date, slots })));
});

export default router;
