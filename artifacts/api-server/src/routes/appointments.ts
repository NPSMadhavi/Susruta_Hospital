import { Router, Response } from "express";
import { db, appointmentsTable, patientsTable, onlineSlotsTable } from "@workspace/db";
import { eq, and, desc, ne } from "drizzle-orm";
import { CreateAppointmentBody, UpdateAppointmentBody } from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth";
import { verifyPatientSession } from "../lib/patient-auth";
import { sendAppointmentAckEmail } from "../lib/email";
import { findOrRegisterPatient, findExistingPatientByPhoneOrEmail } from "../lib/patient-id";
import { notifyPatientAppointmentUpdated } from "./patient";

const router = Router();

// ── SSE Notification Clients ──────────────────────────────────
const sseClients = new Set<Response>();

export function notifyNewAppointment(appt: any) {
  const payload = JSON.stringify({ type: "new_appointment", appointment: appt });
  for (const client of sseClients) {
    try { client.write(`data: ${payload}\n\n`); } catch { sseClients.delete(client); }
  }
}

export function notifyAdminCallEnded(apptId: number, patientName?: string) {
  const payload = JSON.stringify({ type: "call_ended", apptId, patientName: patientName ?? null });
  for (const client of sseClients) {
    try { client.write(`data: ${payload}\n\n`); } catch { sseClients.delete(client); }
  }
}

export function notifyAdminDirectCallUpdated(payload: { id: number; status: string; patientJoined?: boolean }) {
  const msg = JSON.stringify({ type: "direct_call_updated", ...payload });
  for (const client of sseClients) {
    try { client.write(`data: ${msg}\n\n`); } catch { sseClients.delete(client); }
  }
}

export function notifyAdminNewOnlineAppointment(data: any) {
  const msg = JSON.stringify({ type: "new_online_appointment", ...data });
  for (const client of sseClients) {
    try { client.write(`data: ${msg}\n\n`); } catch { sseClients.delete(client); }
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
  let extra: any = {};
  if (a.notes) {
    try {
      const parsed = JSON.parse(a.notes);
      if (parsed.token) {
        extra.token = parsed.token;
      }
      if (parsed.amount) {
        extra.amount = parsed.amount;
      }
      if (parsed.patientCode) {
        extra.patientCode = parsed.patientCode;
      }
      if (parsed.paymentThrough) {
        extra.paymentThrough = parsed.paymentThrough;
      }
    } catch {}
  }
  if (!extra.amount) {
    extra.amount = 200;
  }
  if (!extra.paymentThrough) {
    extra.paymentThrough = a.paymentThrough || (a.paymentMode ? (a.paymentMode.toLowerCase() === "cash" ? "Cash" : "UPI") : "UPI");
  }
  // Patient ID is strictly patientCode (e.g. A001, A005), NEVER the appointment primary key
  const patientCode = a.patientCode || extra.patientCode || null;
  extra.patientCode = patientCode;

  return {
    ...a,
    ...extra,
    createdAt: a.createdAt?.toISOString() ?? null,
    arrivedAt: a.arrivedAt?.toISOString() ?? null,
  };
}

// ── Get offline slots status for a date ──────────────
router.get("/offline/slots-status", async (req, res) => {
  const { date } = req.query as { date: string };
  if (!date) {
    res.status(400).json({ error: "missing_date", message: "Date is required" });
    return;
  }

  const existingOffline = await db
    .select()
    .from(appointmentsTable)
    .where(
      and(
        eq(appointmentsTable.date, date),
        ne(appointmentsTable.status, "cancelled")
      )
    );

  const existingOnlineSlots = await db
    .select()
    .from(onlineSlotsTable)
    .where(
      and(
        eq(onlineSlotsTable.date, date),
        eq(onlineSlotsTable.isBooked, true)
      )
    );

  const offlineMorningBooked = existingOffline.filter((a) =>
    a.timeSlot.includes("10 AM") ||
    a.timeSlot.includes("Morning") ||
    a.timeSlot.startsWith("10:") ||
    a.timeSlot.startsWith("11:") ||
    a.timeSlot.startsWith("12:")
  ).length;

  const onlineMorningBooked = existingOnlineSlots.filter((s) => {
    const [h] = s.startTime.split(":").map(Number);
    return h >= 10 && h < 13;
  }).length;

  const morningBooked = offlineMorningBooked + onlineMorningBooked;

  const offlineEveningBooked = existingOffline.filter((a) =>
    a.timeSlot.includes("6 PM") ||
    a.timeSlot.includes("Evening") ||
    a.timeSlot.startsWith("06:") ||
    a.timeSlot.startsWith("07:") ||
    a.timeSlot.startsWith("08:") ||
    a.timeSlot.startsWith("09:") ||
    a.timeSlot.startsWith("18:") ||
    a.timeSlot.startsWith("19:") ||
    a.timeSlot.startsWith("20:") ||
    a.timeSlot.startsWith("21:")
  ).length;

  const onlineEveningBooked = existingOnlineSlots.filter((s) => {
    const [h] = s.startTime.split(":").map(Number);
    return h >= 18 && h < 22;
  }).length;

  const eveningBooked = offlineEveningBooked + onlineEveningBooked;

  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
  const currentMinutes = hour * 60 + minute;

  const isPastDate = date < todayStr;
  const isToday = date === todayStr;
  const isSunday = new Date(date + "T12:00:00+05:30").getDay() === 0;

  // Morning session (10 AM - 1 PM) cutoff is 13:00 (1:00 PM); Sunday offline is closed
  const morningExceeded = isSunday || isPastDate || (isToday && currentMinutes >= 13 * 60);
  // Evening session (6 PM - 10 PM) cutoff is 22:00 (10:00 PM); Sunday offline is closed
  const eveningExceeded = isSunday || isPastDate || (isToday && currentMinutes >= 22 * 60);

  const morningTotal = isSunday ? 0 : 12;
  const morningRemaining = morningExceeded ? 0 : Math.max(0, morningTotal - morningBooked);
  const morningAvailable = !morningExceeded && morningBooked < morningTotal;

  const eveningTotal = isSunday ? 0 : 16;
  const eveningRemaining = eveningExceeded ? 0 : Math.max(0, eveningTotal - eveningBooked);
  const eveningAvailable = !eveningExceeded && eveningBooked < eveningTotal;

  res.json({
    date,
    morning: {
      label: isSunday ? "Closed on Sunday" : "10 AM - 1 PM",
      total: morningTotal,
      booked: morningBooked,
      remaining: morningRemaining,
      isAvailable: morningAvailable,
      isExceeded: morningExceeded,
    },
    evening: {
      label: isSunday ? "Closed on Sunday" : "6 PM - 10 PM",
      total: eveningTotal,
      booked: eveningBooked,
      remaining: eveningRemaining,
      isAvailable: eveningAvailable,
      isExceeded: eveningExceeded,
    },
  });
});

async function getNextDailyToken(date: string): Promise<string> {
  const existingForDate = await db
    .select()
    .from(appointmentsTable)
    .where(
      and(
        eq(appointmentsTable.date, date),
        ne(appointmentsTable.status, "cancelled")
      )
    );

  let maxSeq = 0;
  for (const a of existingForDate) {
    if (a.notes) {
      try {
        const parsed = JSON.parse(a.notes);
        if (parsed.token) {
          const m = parsed.token.match(/^T(\d+)/i);
          if (m) {
            const num = parseInt(m[1], 10);
            if (num > maxSeq) maxSeq = num;
          }
        }
      } catch {}
    }
  }

  const nextSeq = maxSeq + 1;
  if (nextSeq > 500) {
    throw new Error("Daily token limit of 500 reached for this date.");
  }
  return `T${String(nextSeq).padStart(3, "0")}`;
}

// ── Admin: Offline Register Patient & Generate Token ─────────
router.post("/offline", requireAdmin, async (req, res) => {
  const { patientName, patientPhone, patientEmail, date, timeSlot, amount, notes, paymentStatus, paymentThrough } = req.body;
  if (!patientName || !patientPhone || !date || !timeSlot) {
    res.status(400).json({ error: "missing_fields", message: "Patient name, phone, date, and time slot are required." });
    return;
  }

  // Strictly validate 10-digit Indian mobile number
  const cleanPhone = String(patientPhone || "").replace(/\D/g, "");
  if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
    res.status(400).json({
      error: "invalid_phone",
      message: "Please enter a valid 10-digit Indian phone number (starting with 6, 7, 8, or 9)."
    });
    return;
  }

  const formattedPhone = `+91${cleanPhone}`;
  const resolvedPaymentThrough = paymentThrough === "Cash" || paymentThrough === "cash" ? "Cash" : "UPI";

  // Optional email validation
  const rawEmail = patientEmail ? String(patientEmail).trim() : "";
  if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    res.status(400).json({
      error: "invalid_email",
      message: "Please enter a valid email address or leave it blank."
    });
    return;
  }
  const cleanEmail = rawEmail ? rawEmail.toLowerCase() : null;

  // 1. Find existing patient or register brand-new patient
  // - If patient ALREADY exists: reuses existing patient.id & patientCode; DOES NOT touch the counter!
  // - If brand-new: allocates the next Patient ID & inserts patient in the SAME database transaction.
  const { patient } = await findOrRegisterPatient({
    name: patientName.trim(),
    phone: formattedPhone,
    email: cleanEmail,
  });

  // 2. Daily token for appointment queue
  let token: string;
  try {
    token = await getNextDailyToken(date);
  } catch (err: any) {
    res.status(400).json({
      error: "tokens_exhausted",
      message: err.message || "Daily token limit of 500 reached for this date."
    });
    return;
  }

  const notesObj = {
    token,
    amount: amount ? Number(amount) : 200,
    paymentThrough: resolvedPaymentThrough,
    patientCode: patient.patientCode,
    notes: notes || "",
    isOfflineRegister: true,
  };

  const [appointment] = await db
    .insert(appointmentsTable)
    .values({
      patientId: patient.id,
      patientName: patientName.trim(),
      patientPhone: formattedPhone,
      patientEmail: cleanEmail,
      date,
      timeSlot,
      reason: "Offline Walk-in Registration",
      notes: JSON.stringify(notesObj),
      status: "completed",
      paymentStatus: paymentStatus || "paid",
      paymentMode: resolvedPaymentThrough.toLowerCase(),
      paymentThrough: resolvedPaymentThrough,
      arrivedAt: new Date(),
    })
    .returning();

  const serialized = {
    ...serializeAppt(appointment),
    patientId: patient.id,
    patientCode: patient.patientCode,
    token,
    amount: amount ? Number(amount) : 200,
    paymentThrough: resolvedPaymentThrough,
  };

  notifyNewAppointment(serialized);

  if (cleanEmail) {
    sendAppointmentAckEmail({
      to: cleanEmail,
      patientName: patientName.trim(),
      type: "offline",
      date,
      timeSlot,
      reason: "Offline Walk-in Registration",
    }).catch((err) => console.error("[email] offline ack failed:", err));
  }

  res.status(201).json(serialized);
});

// ── Public: Book (walk-in) ────────────────────────────────────
router.post("/", async (req, res) => {
  const parsed = CreateAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }
  const data = parsed.data;

  const isMorningSession = data.timeSlot.includes("9 AM") || data.timeSlot.includes("Morning");
  const isEveningSession = data.timeSlot.includes("4 PM") || data.timeSlot.includes("Evening");
  const isLegacySession = data.timeSlot.includes("10 AM") || data.timeSlot === "10 AM - 1 PM";

  let generatedToken: string | null = null;

  if (isMorningSession || isEveningSession) {
    const existing = await db
      .select()
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.date, data.date),
          ne(appointmentsTable.status, "cancelled")
        )
      );

    const maxSlots = isMorningSession ? 16 : 12;
    const sessionBooked = existing.filter((a) => {
      if (isMorningSession) {
        return a.timeSlot.includes("9 AM") || a.timeSlot.includes("Morning") || a.timeSlot.startsWith("09:") || a.timeSlot.startsWith("10:") || a.timeSlot.startsWith("11:") || a.timeSlot.startsWith("12:");
      } else {
        return a.timeSlot.includes("4 PM") || a.timeSlot.includes("Evening") || a.timeSlot.startsWith("04:") || a.timeSlot.startsWith("05:") || a.timeSlot.startsWith("06:") || a.timeSlot.startsWith("16:") || a.timeSlot.startsWith("17:") || a.timeSlot.startsWith("18:");
      }
    });

    if (sessionBooked.length >= maxSlots) {
      res.status(409).json({ error: "slot_unavailable", message: `No slots available for ${data.timeSlot} on this date.` });
      return;
    }

    try {
      generatedToken = await getNextDailyToken(data.date);
    } catch (err: any) {
      res.status(409).json({ error: "tokens_exhausted", message: err.message || "Daily token limit of 500 reached for this date." });
      return;
    }
  } else if (isLegacySession) {
    const existing = await db
      .select()
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.date, data.date),
          ne(appointmentsTable.status, "cancelled")
        )
      );
    const booked = existing.filter((a) =>
      a.timeSlot.includes("10 AM") ||
      a.timeSlot.includes("9 AM") ||
      a.timeSlot.includes("Morning") ||
      a.timeSlot.startsWith("10:") ||
      a.timeSlot.startsWith("11:") ||
      a.timeSlot.startsWith("12:")
    ).length;

    if (booked >= 12) {
      res.status(409).json({ error: "slot_unavailable", message: "No slots available for 10 AM - 1 PM on this date." });
      return;
    }
  } else {
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
  }

  // Optionally link to a logged-in or existing patient account
  let patientId: number | null = null;
  let linkedPatientCode: string | null = null;

  const patientToken = req.cookies?.patient_session;
  if (patientToken) {
    const linkedPatient = await verifyPatientSession(patientToken);
    if (linkedPatient) {
      patientId = linkedPatient.id;
      linkedPatientCode = linkedPatient.patientCode ?? null;
    }
  }

  if (!patientId) {
    const existingPatient = await findExistingPatientByPhoneOrEmail(data.patientPhone, data.patientEmail);
    if (existingPatient) {
      patientId = existingPatient.id;
      linkedPatientCode = existingPatient.patientCode ?? null;
    }
  }

  const notesObj: any = {
    ...(generatedToken ? { token: generatedToken, isOfflineRegister: true } : {}),
    ...(linkedPatientCode ? { patientCode: linkedPatientCode } : {}),
  };
  const notesPayload = Object.keys(notesObj).length > 0 ? JSON.stringify(notesObj) : null;

  const [appointment] = await db
    .insert(appointmentsTable)
    .values({
      patientName: data.patientName,
      patientPhone: data.patientPhone,
      patientEmail: data.patientEmail ?? null,
      date: data.date,
      timeSlot: data.timeSlot,
      reason: data.reason ?? null,
      notes: notesPayload,
      status: "pending",
      patientId,
    })
    .returning();

  const serialized = {
    ...serializeAppt(appointment),
    ...(linkedPatientCode ? { patientCode: linkedPatientCode } : {}),
  };
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
  // Ensure any existing offline walk-in registrations are marked as completed
  await db.update(appointmentsTable)
    .set({ status: "completed" })
    .where(
      and(
        eq(appointmentsTable.reason, "Offline Walk-in Registration"),
        eq(appointmentsTable.status, "confirmed")
      )
    )
    .catch(() => {});

  const { status, date, month } = req.query as Record<string, string>;

  const conditions = [];
  if (status) conditions.push(eq(appointmentsTable.status, status));
  if (date) conditions.push(eq(appointmentsTable.date, date));

  const appts = await db
    .select({
      id: appointmentsTable.id,
      patientName: appointmentsTable.patientName,
      patientPhone: appointmentsTable.patientPhone,
      patientEmail: appointmentsTable.patientEmail,
      patientId: appointmentsTable.patientId,
      date: appointmentsTable.date,
      timeSlot: appointmentsTable.timeSlot,
      reason: appointmentsTable.reason,
      status: appointmentsTable.status,
      notes: appointmentsTable.notes,
      arrivedAt: appointmentsTable.arrivedAt,
      paymentStatus: appointmentsTable.paymentStatus,
      paymentMode: appointmentsTable.paymentMode,
      rescheduleDates: appointmentsTable.rescheduleDates,
      rescheduleChosen: appointmentsTable.rescheduleChosen,
      followUpDate: appointmentsTable.followUpDate,
      followUpConfirmed: appointmentsTable.followUpConfirmed,
      createdAt: appointmentsTable.createdAt,
      patientCode: patientsTable.patientCode,
    })
    .from(appointmentsTable)
    .leftJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(appointmentsTable.createdAt));

  for (const a of appts) {
    if (!a.patientCode) {
      const existing = await findExistingPatientByPhoneOrEmail(a.patientPhone, a.patientEmail);
      if (existing) {
        a.patientCode = existing.patientCode;
        if (!a.patientId) {
          db.update(appointmentsTable).set({ patientId: existing.id }).where(eq(appointmentsTable.id, a.id)).catch(() => {});
        }
      }
    }
  }

  let filtered = appts;
  if (month) filtered = appts.filter((a) => a.date.startsWith(month));

  res.json(filtered.map(serializeAppt));
});

// ── Helper to fetch full appointment with patientCode ─────────
async function getFullAppointment(id: number) {
  const [appt] = await db
    .select({
      id: appointmentsTable.id,
      patientName: appointmentsTable.patientName,
      patientPhone: appointmentsTable.patientPhone,
      patientEmail: appointmentsTable.patientEmail,
      patientId: appointmentsTable.patientId,
      date: appointmentsTable.date,
      timeSlot: appointmentsTable.timeSlot,
      reason: appointmentsTable.reason,
      status: appointmentsTable.status,
      notes: appointmentsTable.notes,
      arrivedAt: appointmentsTable.arrivedAt,
      paymentStatus: appointmentsTable.paymentStatus,
      paymentMode: appointmentsTable.paymentMode,
      paymentThrough: appointmentsTable.paymentThrough,
      rescheduleDates: appointmentsTable.rescheduleDates,
      rescheduleChosen: appointmentsTable.rescheduleChosen,
      followUpDate: appointmentsTable.followUpDate,
      followUpConfirmed: appointmentsTable.followUpConfirmed,
      createdAt: appointmentsTable.createdAt,
      patientCode: patientsTable.patientCode,
    })
    .from(appointmentsTable)
    .leftJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
    .where(eq(appointmentsTable.id, id));

  if (!appt) return null;

  if (!appt.patientCode) {
    const existing = await findExistingPatientByPhoneOrEmail(appt.patientPhone, appt.patientEmail);
    if (existing) {
      if (!appt.patientId) {
        await db.update(appointmentsTable).set({ patientId: existing.id }).where(eq(appointmentsTable.id, id)).catch(() => {});
      }
      appt.patientCode = existing.patientCode;
    }
  }

  return serializeAppt(appt);
}

// ── Admin: Get one ────────────────────────────────────────────
router.get("/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const serialized = await getFullAppointment(id);
  if (!serialized) { res.status(404).json({ error: "not_found" }); return; }
  res.json(serialized);
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
  if (updated.patientId) {
    notifyPatientAppointmentUpdated(updated.patientId);
  }
  const serialized = await getFullAppointment(id);
  res.json(serialized);
});

// ── Admin: Mark Arrived ───────────────────────────────────────
router.patch("/:id/arrive", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const [updated] = await db.update(appointmentsTable)
    .set({ arrivedAt: new Date(), status: "arrived" })
    .where(eq(appointmentsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "not_found" }); return; }
  if (updated.patientId) {
    notifyPatientAppointmentUpdated(updated.patientId);
  }
  const serialized = await getFullAppointment(id);
  res.json(serialized);
});

// ── Admin: Mark Paid ──────────────────────────────────────────
router.patch("/:id/pay", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { mode } = req.body;
  if (!["cash", "upi"].includes(mode)) {
    res.status(400).json({ error: "invalid_mode", message: "mode must be cash or upi" });
    return;
  }

  const [appt] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, id));
  if (!appt) { res.status(404).json({ error: "not_found" }); return; }

  let notesObj: any = {};
  let token = "";
  if (appt.notes) {
    try {
      notesObj = JSON.parse(appt.notes);
      token = notesObj.token || "";
    } catch {}
  }

  if (!token) {
    try {
      token = await getNextDailyToken(appt.date);
    } catch {
      token = `T${String(appt.id).padStart(3, "0")}`;
    }
  }

  notesObj.token = token;
  if (!notesObj.amount) {
    notesObj.amount = 200;
  }
  notesObj.paymentMode = mode;
  notesObj.paymentThrough = mode === "cash" ? "Cash" : "UPI";

  const [updated] = await db.update(appointmentsTable)
    .set({
      paymentStatus: "paid",
      paymentMode: mode,
      paymentThrough: mode === "cash" ? "Cash" : "UPI",
      status: "completed",
      notes: JSON.stringify(notesObj),
    })
    .where(eq(appointmentsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "not_found" }); return; }
  if (updated.patientId) {
    notifyPatientAppointmentUpdated(updated.patientId);
  }
  const serialized = await getFullAppointment(id);
  res.json(serialized);
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
  if (updated.patientId) {
    notifyPatientAppointmentUpdated(updated.patientId);
  }
  const serialized = await getFullAppointment(id);
  res.json(serialized);
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
  if (updated.patientId) {
    notifyPatientAppointmentUpdated(updated.patientId);
  }
  const serialized = await getFullAppointment(id);
  res.json(serialized);
});

// ── Admin: Delete ─────────────────────────────────────────────
router.delete("/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const [appt] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, id));
  await db.delete(appointmentsTable).where(eq(appointmentsTable.id, id));
  if (appt?.patientId) {
    notifyPatientAppointmentUpdated(appt.patientId);
  }
  res.status(204).send();
});

export default router;
