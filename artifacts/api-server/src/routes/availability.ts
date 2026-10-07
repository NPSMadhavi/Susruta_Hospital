import { Router } from "express";
import { db, blockedDatesTable, openMonthsTable, appointmentsTable, customDayTimingsTable, onlineSlotSessionsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { sendSlotAvailabilityUpdateBroadcastEmail } from "../lib/email";

const router = Router();

// Ensure custom_day_timings table exists in PostgreSQL database
async function ensureCustomDayTimingsTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS public.custom_day_timings (
        id SERIAL PRIMARY KEY,
        date VARCHAR(10) NOT NULL UNIQUE,
        morning_enabled BOOLEAN NOT NULL DEFAULT true,
        morning_start VARCHAR(10) NOT NULL DEFAULT '10:00 AM',
        morning_end VARCHAR(10) NOT NULL DEFAULT '01:00 PM',
        evening_enabled BOOLEAN NOT NULL DEFAULT true,
        evening_start VARCHAR(10) NOT NULL DEFAULT '06:00 PM',
        evening_end VARCHAR(10) NOT NULL DEFAULT '10:00 PM',
        slot_interval_minutes INTEGER NOT NULL DEFAULT 30,
        note TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
  } catch (err: any) {
    console.error("⚠️ Failed to ensure custom_day_timings table:", err.message);
  }
}
ensureCustomDayTimingsTable();

const MORNING_SLOTS = [
  "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM", "01:00 PM"
];

const EVENING_SLOTS = [
  "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM",
  "08:00 PM", "08:30 PM", "09:00 PM", "09:30 PM", "10:00 PM"
];

export function parseTimeString(timeStr: string): number {
  if (!timeStr) return 0;
  const [time, period] = timeStr.trim().split(/\s+/);
  let [h, m] = (time || "").split(":").map(Number);
  if (isNaN(h)) h = 0;
  if (isNaN(m)) m = 0;
  if (period?.toUpperCase() === "PM" && h < 12) h += 12;
  if (period?.toUpperCase() === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

export function formatMinutesToTimeString(mins: number): string {
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? "PM" : "AM";
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
}

export function generateTimeSlots(startStr: string, endStr: string, intervalMins: number = 30): string[] {
  const startMins = parseTimeString(startStr);
  const endMins = parseTimeString(endStr);
  if (endMins <= startMins) return [];
  const slots: string[] = [];
  const step = intervalMins > 0 ? intervalMins : 30;
  for (let current = startMins; current + step <= endMins; current += step) {
    slots.push(formatMinutesToTimeString(current));
  }
  return slots;
}

function getDaysInMonth(year: number, month: number): string[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const days: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return days;
}

router.get("/", async (req, res) => {
  const { month } = req.query as { month: string };
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "invalid_month", message: "Month must be in YYYY-MM format" });
    return;
  }

  const [year, monthNum] = month.split("-").map(Number);

  const openMonthRecord = await db
    .select()
    .from(openMonthsTable)
    .where(eq(openMonthsTable.month, month));

  const isOpen = openMonthRecord.length > 0 ? openMonthRecord[0].isOpen : true;

  const blocked = await db.select().from(blockedDatesTable);
  const blockedSet = new Set(blocked.map((b) => b.date));

  const allDays = getDaysInMonth(year, monthNum);
  const today = new Date().toISOString().split("T")[0];
  const availableDates = isOpen
    ? allDays.filter((d) => d >= today && !blockedSet.has(d))
    : [];

  res.json({
    month,
    isOpen,
    availableDates,
    blockedDates: blocked.filter((b) => b.date.startsWith(month)).map((b) => b.date),
  });
});

router.get("/slots", async (req, res) => {
  const { date } = req.query as { date: string };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "invalid_date", message: "Date must be in YYYY-MM-DD format" });
    return;
  }

  const blocked = await db.select().from(blockedDatesTable).where(eq(blockedDatesTable.date, date));
  if (blocked.length > 0) {
    const allSlots = [...MORNING_SLOTS, ...EVENING_SLOTS];
    res.json(allSlots.map((t) => ({ time: t, available: false })));
    return;
  }

  const [customTiming] = await db
    .select()
    .from(customDayTimingsTable)
    .where(eq(customDayTimingsTable.date, date));

  const onlineSessions = await db
    .select()
    .from(onlineSlotSessionsTable)
    .where(eq(onlineSlotSessionsTable.date, date));

  let allSlots: string[] = [];

  if (customTiming) {
    const morningSlots = customTiming.morningEnabled
      ? generateTimeSlots(customTiming.morningStart, customTiming.morningEnd, customTiming.slotIntervalMinutes)
      : [];
    const eveningSlots = customTiming.eveningEnabled
      ? generateTimeSlots(customTiming.eveningStart, customTiming.eveningEnd, customTiming.slotIntervalMinutes)
      : [];
    allSlots = [...morningSlots, ...eveningSlots];
  } else if (onlineSessions.length > 0) {
    function formatHHMMTo12Hour(hhmm: string): string {
      if (!hhmm) return "";
      const [hStr, mStr] = hhmm.split(":");
      let h = parseInt(hStr, 10);
      const m = parseInt(mStr || "0", 10);
      const period = h >= 12 ? "PM" : "AM";
      if (h > 12) h -= 12;
      if (h === 0) h = 12;
      return `${h}:${String(m).padStart(2, "0")} ${period}`;
    }

    const sessionSlots: string[] = [];
    for (const session of onlineSessions) {
      const startStr = formatHHMMTo12Hour(session.startTime);
      const endStr = formatHHMMTo12Hour(session.endTime);
      const slots = generateTimeSlots(startStr, endStr, session.intervalMinutes || 30);
      sessionSlots.push(...slots);
    }
    const dayOfWeek = new Date(date + "T12:00:00+05:30").getDay();
    const isSunday = dayOfWeek === 0;
    if (isSunday && !onlineSessions.some((s) => parseInt(s.startTime.split(":")[0], 10) < 12)) {
      sessionSlots.unshift(...MORNING_SLOTS);
    }
    allSlots = Array.from(new Set(sessionSlots));
  } else {
    const dayOfWeek = new Date(date + "T12:00:00+05:30").getDay(); // 0 = Sunday
    const isSunday = dayOfWeek === 0;
    allSlots = isSunday ? MORNING_SLOTS : [...MORNING_SLOTS, ...EVENING_SLOTS];
  }

  const bookedAppts = await db
    .select()
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.date, date), eq(appointmentsTable.status, "confirmed")));

  const bookedSlots = new Set(bookedAppts.map((a) => a.timeSlot));

  res.json(allSlots.map((t) => ({ time: t, available: !bookedSlots.has(t) })));
});

// ── CUSTOM DAY TIMINGS ──────────────────────────────────────
router.get("/custom-timings", async (_req, res) => {
  await ensureCustomDayTimingsTable();
  const timings = await db
    .select()
    .from(customDayTimingsTable)
    .orderBy(customDayTimingsTable.date);
  res.json(
    timings.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    }))
  );
});

router.post("/custom-timings", requireAdmin, async (req, res) => {
  await ensureCustomDayTimingsTable();
  const {
    date,
    morningEnabled = true,
    morningStart = "10:00 AM",
    morningEnd = "01:00 PM",
    eveningEnabled = true,
    eveningStart = "06:00 PM",
    eveningEnd = "10:00 PM",
    slotIntervalMinutes = 30,
    note = null,
  } = req.body;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "invalid_date", message: "Date must be YYYY-MM-DD" });
    return;
  }

  const [existing] = await db
    .select()
    .from(customDayTimingsTable)
    .where(eq(customDayTimingsTable.date, date));

  let resultRecord: any;

  if (existing) {
    const [updated] = await db
      .update(customDayTimingsTable)
      .set({
        morningEnabled: Boolean(morningEnabled),
        morningStart,
        morningEnd,
        eveningEnabled: Boolean(eveningEnabled),
        eveningStart,
        eveningEnd,
        slotIntervalMinutes: Number(slotIntervalMinutes) || 30,
        note: note || null,
      })
      .where(eq(customDayTimingsTable.date, date))
      .returning();

    resultRecord = updated;
  } else {
    const [created] = await db
      .insert(customDayTimingsTable)
      .values({
        date,
        morningEnabled: Boolean(morningEnabled),
        morningStart,
        morningEnd,
        eveningEnabled: Boolean(eveningEnabled),
        eveningStart,
        eveningEnd,
        slotIntervalMinutes: Number(slotIntervalMinutes) || 30,
        note: note || null,
      })
      .returning();

    resultRecord = created;
  }

  // Notify registered patients via email about updated offline consultation timings
  sendSlotAvailabilityUpdateBroadcastEmail({
    date,
    type: "offline",
    morningSession: morningEnabled ? `${morningStart} - ${morningEnd}` : "Closed",
    eveningSession: eveningEnabled ? `${eveningStart} - ${eveningEnd}` : "Closed",
    intervalMinutes: Number(slotIntervalMinutes) || 30,
    note: note || undefined,
  }).catch(() => {});

  res.status(existing ? 200 : 201).json({ ...resultRecord, createdAt: resultRecord.createdAt.toISOString() });
});

router.delete("/custom-timings/:id", requireAdmin, async (req, res) => {
  await ensureCustomDayTimingsTable();
  const id = parseInt(req.params.id, 10);
  await db.delete(customDayTimingsTable).where(eq(customDayTimingsTable.id, id));
  res.status(204).send();
});

// ── BLOCKED DATES ───────────────────────────────────────────
router.get("/blocked-dates", requireAdmin, async (_req, res) => {
  const blocked = await db.select().from(blockedDatesTable).orderBy(blockedDatesTable.date);
  res.json(blocked.map((b) => ({ ...b, createdAt: b.createdAt.toISOString() })));
});

router.post("/blocked-dates", requireAdmin, async (req, res) => {
  const { date, reason } = req.body;
  if (!date) {
    res.status(400).json({ error: "missing_date", message: "Date is required" });
    return;
  }
  const [existing] = await db.select().from(blockedDatesTable).where(eq(blockedDatesTable.date, date));
  if (existing) {
    res.json({ ...existing, createdAt: existing.createdAt.toISOString() });
    return;
  }
  const [blocked] = await db
    .insert(blockedDatesTable)
    .values({ date, reason: reason ?? null })
    .returning();
  res.status(201).json({ ...blocked, createdAt: blocked.createdAt.toISOString() });
});

router.delete("/blocked-dates/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(blockedDatesTable).where(eq(blockedDatesTable.id, id));
  res.status(204).send();
});

// ── OPEN MONTHS ─────────────────────────────────────────────
router.get("/months", async (_req, res) => {
  const months = await db.select().from(openMonthsTable).orderBy(openMonthsTable.month);
  res.json(months.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })));
});

router.post("/months", requireAdmin, async (req, res) => {
  const { month, isOpen } = req.body;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "invalid_month", message: "Month must be YYYY-MM format" });
    return;
  }

  const targetIsOpen = typeof isOpen === "boolean" ? isOpen : true;
  const [existing] = await db.select().from(openMonthsTable).where(eq(openMonthsTable.month, month));
  if (existing) {
    const [updated] = await db
      .update(openMonthsTable)
      .set({ isOpen: targetIsOpen })
      .where(eq(openMonthsTable.month, month))
      .returning();
    res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
    return;
  }

  const [record] = await db
    .insert(openMonthsTable)
    .values({ month, isOpen: targetIsOpen })
    .returning();
  res.status(201).json({ ...record, createdAt: record.createdAt.toISOString() });
});

router.delete("/months/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(openMonthsTable).where(eq(openMonthsTable.id, id));
  res.status(204).send();
});

export default router;
