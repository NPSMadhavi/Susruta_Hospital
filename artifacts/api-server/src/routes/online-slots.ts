import { Router } from "express";
import { db, onlineSlotSessionsTable, onlineSlotsTable, onlineAppointmentsTable } from "@workspace/db";
import { eq, desc, asc, and, gte, inArray } from "drizzle-orm";
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

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function parseSessionId(value: string | string[]): number {
  return parseInt(Array.isArray(value) ? value[0] : value, 10);
}

const TimeString = z.string()
  .regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format")
  .refine((value) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  }, "Time must be a valid clock time");

// ── Admin: POST /api/online-slots/sessions ────────────────────
const CreateSessionBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: TimeString,
  endTime: TimeString,
  intervalMinutes: z.coerce.number().refine((v) => v === 15 || v === 30, {
    message: "intervalMinutes must be 15 or 30",
  }),
});

const ExtendSessionBody = z.object({
  endTime: TimeString,
});

router.post("/sessions", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation_error", issues: parsed.error.issues }); return; }

  const { date, startTime, endTime, intervalMinutes } = parsed.data;

  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    res.status(400).json({ error: "invalid_range", message: "Session end time must be later than the start time." });
    return;
  }

  // Multiple sessions may share a date, but their time ranges must not overlap.
  const existing = await db.select().from(onlineSlotSessionsTable).where(eq(onlineSlotSessionsTable.date, date));
  const overlaps = existing.find((session) =>
    timeToMinutes(startTime) < timeToMinutes(session.endTime) &&
    timeToMinutes(endTime) > timeToMinutes(session.startTime)
  );
  if (overlaps) {
    res.status(409).json({
      error: "overlap",
      message: `This time overlaps the existing ${overlaps.startTime}–${overlaps.endTime} session. Choose a different time range.`,
    });
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

// ── Admin: PATCH /api/online-slots/sessions/:id ────────────────
// Extends a session by appending slots after its current end time.
// Existing slots, including booked ones, are never changed.
router.patch("/sessions/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseSessionId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "invalid_id" }); return; }

  const parsed = ExtendSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation_error", issues: parsed.error.issues }); return; }

  const [session] = await db
    .select()
    .from(onlineSlotSessionsTable)
    .where(eq(onlineSlotSessionsTable.id, id));

  if (!session) {
    res.status(404).json({ error: "not_found", message: "Slot session not found." });
    return;
  }

  const { endTime } = parsed.data;
  if (timeToMinutes(endTime) <= timeToMinutes(session.endTime)) {
    res.status(400).json({
      error: "invalid_extension",
      message: `The new end time must be later than the current end time (${session.endTime}).`,
    });
    return;
  }

  const otherSessions = await db
    .select()
    .from(onlineSlotSessionsTable)
    .where(eq(onlineSlotSessionsTable.date, session.date));
  const conflictingSession = otherSessions.find((other) =>
    other.id !== session.id &&
    timeToMinutes(session.startTime) < timeToMinutes(other.endTime) &&
    timeToMinutes(endTime) > timeToMinutes(other.startTime)
  );
  if (conflictingSession) {
    res.status(409).json({
      error: "overlap",
      message: `The extension overlaps the existing ${conflictingSession.startTime}–${conflictingSession.endTime} session.`,
    });
    return;
  }

  const newSlots = generateSlots(session.endTime, endTime, session.intervalMinutes);
  if (newSlots.length === 0) {
    res.status(400).json({
      error: "no_slots",
      message: `The extension must be at least ${session.intervalMinutes} minutes long.`,
    });
    return;
  }

  const existingSlots = await db
    .select()
    .from(onlineSlotsTable)
    .where(eq(onlineSlotsTable.sessionId, session.id));

  await db.insert(onlineSlotsTable).values(
    newSlots.map((slot) => ({
      sessionId: session.id,
      date: session.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
    }))
  );

  const [updatedSession] = await db
    .update(onlineSlotSessionsTable)
    .set({
      endTime,
      maxBookings: existingSlots.length + newSlots.length,
    })
    .where(eq(onlineSlotSessionsTable.id, session.id))
    .returning();

  const updatedSlots = await db
    .select()
    .from(onlineSlotsTable)
    .where(eq(onlineSlotsTable.sessionId, session.id));

  res.json({ session: updatedSession, slots: updatedSlots, addedSlots: newSlots.length });
});

// ── Admin: GET /api/online-slots/sessions ────────────────────
router.get("/sessions", requireAdmin, async (_req, res): Promise<void> => {
  const sessions = await db
    .select()
    .from(onlineSlotSessionsTable)
    .orderBy(desc(onlineSlotSessionsTable.date), asc(onlineSlotSessionsTable.startTime));

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
// Deletes a session and all its slots.
// First removes all appointment records for those slots (FK would otherwise block CASCADE).
router.delete("/sessions/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseSessionId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "invalid_id" }); return; }

  try {
    // 1. Find all slots belonging to this session
    const slots = await db
      .select({ id: onlineSlotsTable.id })
      .from(onlineSlotsTable)
      .where(eq(onlineSlotsTable.sessionId, id));

    if (slots.length > 0) {
      const slotIds = slots.map(s => s.id);
      // 2. Hard-delete all appointment records for these slots.
      //    (The FK on online_appointments.slot_id has no CASCADE so we must remove them first.)
      await db.delete(onlineAppointmentsTable).where(inArray(onlineAppointmentsTable.slotId, slotIds));
    }

    // 3. Delete the session — ON DELETE CASCADE removes the slots
    await db.delete(onlineSlotSessionsTable).where(eq(onlineSlotSessionsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    console.error("[DELETE session] error:", err?.message ?? err);
    res.status(500).json({ error: "delete_failed", message: err?.message ?? "Unknown error" });
  }
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
