import { Router } from "express";
import { db, blockedDatesTable, openMonthsTable, appointmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();

const MORNING_SLOTS = [
  "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM", "01:00 PM"
];

const EVENING_SLOTS = [
  "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM",
  "08:00 PM", "08:30 PM", "09:00 PM", "09:30 PM", "10:00 PM"
];

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

  const dayOfWeek = new Date(date).getDay(); // 0 = Sunday
  const isSunday = dayOfWeek === 0;

  const allSlots = isSunday ? MORNING_SLOTS : [...MORNING_SLOTS, ...EVENING_SLOTS];

  const bookedAppts = await db
    .select()
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.date, date), eq(appointmentsTable.status, "confirmed")));

  const bookedSlots = new Set(bookedAppts.map((a) => a.timeSlot));

  res.json(allSlots.map((t) => ({ time: t, available: !bookedSlots.has(t) })));
});

router.get("/blocked-dates", requireAdmin, async (req, res) => {
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

router.get("/months", async (req, res) => {
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
