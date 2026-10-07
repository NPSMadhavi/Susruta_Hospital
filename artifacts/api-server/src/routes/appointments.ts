import { Router, Response } from "express";
import { randomBytes } from "crypto";
import { db, appointmentsTable, patientsTable, onlineSlotsTable, customDayTimingsTable, onlineSlotSessionsTable, offlineQrTokensTable, patientDocumentsTable } from "@workspace/db";
import { eq, and, desc, ne, sql } from "drizzle-orm";
import { parseTimeString, generateTimeSlots } from "./availability";
import { CreateAppointmentBody, UpdateAppointmentBody } from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth";
import { verifyPatientSession } from "../lib/patient-auth";
import { sendAppointmentAckEmail } from "../lib/email";
import { findOrRegisterPatient, findExistingPatientByPhoneOrEmail } from "../lib/patient-id";
import { notifyPatientAppointmentUpdated } from "./patient";

const router = Router();

// Ensure offline_qr_tokens table exists in PostgreSQL database
async function ensureOfflineQrTokensTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS public.offline_qr_tokens (
        id SERIAL PRIMARY KEY,
        token VARCHAR(128) NOT NULL UNIQUE,
        patient_id INTEGER NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
        appointment_id INTEGER NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
  } catch (err: any) {
    console.error("⚠️ Failed to ensure offline_qr_tokens table:", err.message);
  }
}
ensureOfflineQrTokensTable();

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
    a.timeSlot.includes("9 AM") ||
    a.timeSlot.includes("Morning") ||
    a.timeSlot.startsWith("08:") ||
    a.timeSlot.startsWith("09:") ||
    a.timeSlot.startsWith("10:") ||
    a.timeSlot.startsWith("11:")
  ).length;

  const onlineMorningBooked = existingOnlineSlots.filter((s) => {
    const [h] = s.startTime.split(":").map(Number);
    return h < 12;
  }).length;

  const morningBooked = offlineMorningBooked + onlineMorningBooked;

  const offlineEveningBooked = existingOffline.filter((a) =>
    a.timeSlot.includes("12 PM") ||
    a.timeSlot.includes("6 PM") ||
    a.timeSlot.includes("4 PM") ||
    a.timeSlot.includes("5 PM") ||
    a.timeSlot.includes("Evening") ||
    a.timeSlot.startsWith("12:") ||
    a.timeSlot.startsWith("13:") ||
    a.timeSlot.startsWith("14:") ||
    a.timeSlot.startsWith("15:") ||
    a.timeSlot.startsWith("04:") ||
    a.timeSlot.startsWith("05:") ||
    a.timeSlot.startsWith("06:") ||
    a.timeSlot.startsWith("07:") ||
    a.timeSlot.startsWith("08:") ||
    a.timeSlot.startsWith("09:") ||
    a.timeSlot.startsWith("16:") ||
    a.timeSlot.startsWith("17:") ||
    a.timeSlot.startsWith("18:") ||
    a.timeSlot.startsWith("19:") ||
    a.timeSlot.startsWith("20:") ||
    a.timeSlot.startsWith("21:")
  ).length;

  const onlineEveningBooked = existingOnlineSlots.filter((s) => {
    const [h] = s.startTime.split(":").map(Number);
    return h >= 12;
  }).length;

  const eveningBooked = offlineEveningBooked + onlineEveningBooked;

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

  const [customTiming] = await db
    .select()
    .from(customDayTimingsTable)
    .where(eq(customDayTimingsTable.date, date));

  const onlineSessions = await db
    .select()
    .from(onlineSlotSessionsTable)
    .where(eq(onlineSlotSessionsTable.date, date));

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

  let morningLabel = "10 AM - 1 PM";
  let morningTotal = 12;
  let morningCutoffMins = 13 * 60; // 1:00 PM
  let morningEnabled = true;

  let eveningLabel = "6 PM - 10 PM";
  let eveningTotal = 16;
  let eveningCutoffMins = 22 * 60; // 10:00 PM
  let eveningEnabled = true;

  if (customTiming) {
    morningEnabled = customTiming.morningEnabled;
    morningLabel = morningEnabled ? `${customTiming.morningStart} - ${customTiming.morningEnd}` : "Closed";
    morningTotal = morningEnabled
      ? generateTimeSlots(customTiming.morningStart, customTiming.morningEnd, customTiming.slotIntervalMinutes).length
      : 0;
    morningCutoffMins = parseTimeString(customTiming.morningEnd);

    eveningEnabled = customTiming.eveningEnabled;
    eveningLabel = eveningEnabled ? `${customTiming.eveningStart} - ${customTiming.eveningEnd}` : "Closed";
    eveningTotal = eveningEnabled
      ? generateTimeSlots(customTiming.eveningStart, customTiming.eveningEnd, customTiming.slotIntervalMinutes).length
      : 0;
    eveningCutoffMins = parseTimeString(customTiming.eveningEnd);
  } else {
    const morningOnlineSession = onlineSessions.find((s) => {
      const [h] = s.startTime.split(":").map(Number);
      return h < 12;
    });

    const eveningOnlineSession = onlineSessions.find((s) => {
      const [h] = s.startTime.split(":").map(Number);
      return h >= 12;
    });

    if (isSunday) {
      if (onlineSessions.length > 0) {
        if (morningOnlineSession) {
          morningLabel = `${formatHHMMTo12Hour(morningOnlineSession.startTime)} - ${formatHHMMTo12Hour(morningOnlineSession.endTime)}`;
          morningTotal = morningOnlineSession.maxBookings || 12;
          morningCutoffMins = parseTimeString(formatHHMMTo12Hour(morningOnlineSession.endTime));
          morningEnabled = true;
        } else {
          morningLabel = "Closed on Sunday";
          morningTotal = 0;
          morningCutoffMins = 0;
          morningEnabled = false;
        }

        if (eveningOnlineSession) {
          eveningLabel = `${formatHHMMTo12Hour(eveningOnlineSession.startTime)} - ${formatHHMMTo12Hour(eveningOnlineSession.endTime)}`;
          eveningTotal = eveningOnlineSession.maxBookings || 16;
          eveningCutoffMins = parseTimeString(formatHHMMTo12Hour(eveningOnlineSession.endTime));
          eveningEnabled = true;
        } else {
          eveningLabel = "Closed on Sunday";
          eveningTotal = 0;
          eveningCutoffMins = 0;
          eveningEnabled = false;
        }
      } else {
        morningLabel = "10 AM - 1 PM";
        morningTotal = 12;
        morningCutoffMins = 13 * 60;
        morningEnabled = true;

        eveningLabel = "Closed on Sunday";
        eveningTotal = 0;
        eveningCutoffMins = 0;
        eveningEnabled = false;
      }
    } else {
      if (morningOnlineSession) {
        morningLabel = `${formatHHMMTo12Hour(morningOnlineSession.startTime)} - ${formatHHMMTo12Hour(morningOnlineSession.endTime)}`;
        morningTotal = morningOnlineSession.maxBookings || 12;
        morningCutoffMins = parseTimeString(formatHHMMTo12Hour(morningOnlineSession.endTime));
      }
      if (eveningOnlineSession) {
        eveningLabel = `${formatHHMMTo12Hour(eveningOnlineSession.startTime)} - ${formatHHMMTo12Hour(eveningOnlineSession.endTime)}`;
        eveningTotal = eveningOnlineSession.maxBookings || 16;
        eveningCutoffMins = parseTimeString(formatHHMMTo12Hour(eveningOnlineSession.endTime));
      }
    }
  }

  const morningExceeded = !morningEnabled || isPastDate || (isToday && currentMinutes >= morningCutoffMins);
  const eveningExceeded = !eveningEnabled || isPastDate || (isToday && currentMinutes >= eveningCutoffMins);

  const morningRemaining = morningExceeded ? 0 : Math.max(0, morningTotal - morningBooked);
  const morningAvailable = !morningExceeded && morningBooked < morningTotal;

  const eveningRemaining = eveningExceeded ? 0 : Math.max(0, eveningTotal - eveningBooked);
  const eveningAvailable = !eveningExceeded && eveningBooked < eveningTotal;

  res.json({
    date,
    note: customTiming?.note || null,
    morning: {
      label: morningLabel,
      total: morningTotal,
      booked: morningBooked,
      remaining: morningRemaining,
      isAvailable: morningAvailable,
      isExceeded: morningExceeded,
    },
    evening: {
      label: eveningLabel,
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
  const {
    patientName,
    patientPhone,
    patientEmail,
    date,
    timeSlot,
    amount,
    notes,
    paymentStatus,
    paymentThrough,
    age,
    gender,
    address,
    selectedPatientId,
  } = req.body;

  if (!patientName || !patientPhone || !date || !timeSlot) {
    res.status(400).json({ error: "missing_fields", message: "Patient name, phone, date, and time slot are required." });
    return;
  }

  // Strictly validate 10-digit Indian mobile number (handling optional +91 prefix)
  const rawDigits = String(patientPhone || "").replace(/\D/g, "");
  const cleanPhone = rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits;
  if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
    res.status(400).json({
      error: "invalid_phone",
      message: "Please enter a valid 10-digit Indian phone number (starting with 6, 7, 8, or 9)."
    });
    return;
  }

  // Age validation: numeric, reasonable human age (0 to 150)
  const parsedAge = age !== undefined && age !== null && String(age).trim() !== "" ? Number(age) : null;
  if (parsedAge === null || isNaN(parsedAge) || parsedAge < 0 || parsedAge > 150) {
    res.status(400).json({
      error: "invalid_age",
      message: "Please enter a valid age between 0 and 150."
    });
    return;
  }

  // Gender validation: Male, Female, Other
  const rawGender = gender ? String(gender).trim() : "";
  if (!rawGender) {
    res.status(400).json({
      error: "invalid_gender",
      message: "Please select gender."
    });
    return;
  }

  const formattedPhone = `+91${cleanPhone}`;
  const resolvedPaymentThrough = paymentThrough === "Cash" || paymentThrough === "cash" ? "Cash" : "UPI";

  // Mandatory email validation
  const rawEmail = patientEmail ? String(patientEmail).trim() : "";
  if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    res.status(400).json({
      error: "invalid_email",
      message: "A valid email address is required for offline patient registration."
    });
    return;
  }
  const cleanEmail = rawEmail.toLowerCase();
  const cleanAddress = address ? String(address).trim() : null;

  let patient: typeof patientsTable.$inferSelect | null = null;

  // 1. Existing Patient Reuse vs New Patient Creation
  if (selectedPatientId) {
    // Admin explicitly selected an existing patient
    const [existing] = await db
      .select()
      .from(patientsTable)
      .where(
        typeof selectedPatientId === "number"
          ? eq(patientsTable.id, selectedPatientId)
          : eq(patientsTable.patientCode, String(selectedPatientId).trim())
      );

    if (existing) {
      // Update existing patient details (Name, Phone, Email, Age, Gender, Address)
      // Patient ID (patientCode) MUST NEVER CHANGE
      const updates: Record<string, any> = {
        name: patientName.trim(),
        phone: formattedPhone,
        email: cleanEmail,
        age: parsedAge,
        gender: rawGender,
      };
      if (cleanAddress) {
        updates.address = cleanAddress;
      }

      await db.update(patientsTable).set(updates).where(eq(patientsTable.id, existing.id));
      patient = { ...existing, ...updates };
    } else {
      res.status(404).json({ error: "patient_not_found", message: "Selected patient was not found." });
      return;
    }
  } else {
    // No selected patient ID passed — check if phone number already exists
    const existingByPhone = await findExistingPatientByPhoneOrEmail(formattedPhone, cleanEmail);
    if (existingByPhone) {
      // Phone number already belongs to a patient — reuse existing patient ID & update details
      const updates: Record<string, any> = {
        name: patientName.trim(),
        phone: formattedPhone,
        email: cleanEmail,
        age: parsedAge,
        gender: rawGender,
      };
      if (cleanAddress) {
        updates.address = cleanAddress;
      }
      await db.update(patientsTable).set(updates).where(eq(patientsTable.id, existingByPhone.id));
      patient = { ...existingByPhone, ...updates };
    } else {
      // Brand-new patient: allocate next unique Patient ID
      const result = await findOrRegisterPatient({
        name: patientName.trim(),
        phone: formattedPhone,
        email: cleanEmail,
        age: parsedAge,
        gender: rawGender,
        address: cleanAddress,
      });
      patient = result.patient;
    }
  }

  if (!patient) {
    res.status(500).json({ error: "patient_error", message: "Failed to process patient record." });
    return;
  }

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

  // 3. Generate 24-hour secure QR token for temporary document upload access ONLY
  const uploadToken = randomBytes(32).toString("hex");

  const notesObj = {
    token,
    amount: amount ? Number(amount) : 200,
    paymentThrough: resolvedPaymentThrough,
    patientCode: patient.patientCode,
    notes: notes || "",
    isOfflineRegister: true,
    uploadToken,
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

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  await db.insert(offlineQrTokensTable).values({
    token: uploadToken,
    patientId: patient.id,
    appointmentId: appointment.id,
    expiresAt,
  });

  const uploadUrl = `/patient/offline-upload/${uploadToken}`;

  const serialized = {
    ...serializeAppt(appointment),
    patientId: patient.id,
    patientCode: patient.patientCode,
    patientName: patient.name,
    patientPhone: cleanPhone,
    patientEmail: patient.email || "",
    age: patient.age,
    gender: patient.gender,
    address: patient.address || "",
    token,
    amount: amount ? Number(amount) : 200,
    paymentThrough: resolvedPaymentThrough,
    uploadToken,
    uploadUrl,
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
        return a.timeSlot.includes("9 AM") || a.timeSlot.includes("Morning") || a.timeSlot.startsWith("09:") || a.timeSlot.startsWith("10:") || a.timeSlot.startsWith("11:");
      } else {
        return a.timeSlot.includes("4 PM") || a.timeSlot.includes("Evening") || a.timeSlot.includes("12 PM") || a.timeSlot.startsWith("12:") || a.timeSlot.startsWith("13:") || a.timeSlot.startsWith("14:") || a.timeSlot.startsWith("15:") || a.timeSlot.startsWith("04:") || a.timeSlot.startsWith("05:") || a.timeSlot.startsWith("06:") || a.timeSlot.startsWith("16:") || a.timeSlot.startsWith("17:") || a.timeSlot.startsWith("18:");
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

// ── Temporary QR Code Medical Document Upload Verification ─────
router.get("/patient/offline-upload/:token", async (req, res) => {
  const { token } = req.params;
  if (!token || typeof token !== "string") {
    res.status(400).json({ valid: false, error: "invalid_token", message: "Upload token is required." });
    return;
  }

  const [qrRecord] = await db
    .select()
    .from(offlineQrTokensTable)
    .where(eq(offlineQrTokensTable.token, token));

  if (!qrRecord) {
    res.status(404).json({ valid: false, error: "not_found", message: "Invalid or non-existent QR upload token." });
    return;
  }

  if (qrRecord.expiresAt < new Date()) {
    res.status(410).json({
      valid: false,
      error: "expired",
      message: "QR Code Expired. This upload link has expired. Please contact Susruta Hospital for assistance."
    });
    return;
  }

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, qrRecord.patientId));
  const [appointment] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, qrRecord.appointmentId));

  if (!patient || !appointment) {
    res.status(404).json({ valid: false, error: "not_found", message: "Associated patient or appointment record not found." });
    return;
  }

  let tokenStr = "A-101";
  try {
    const parsed = JSON.parse(appointment.notes || "{}");
    if (parsed.token) tokenStr = parsed.token;
  } catch {}

  res.json({
    valid: true,
    patientName: patient.name,
    patientCode: patient.patientCode || `ID #${patient.id}`,
    appointmentDate: appointment.date,
    timeSlot: appointment.timeSlot,
    token: tokenStr,
    expiresAt: qrRecord.expiresAt,
  });
});

// ── Temporary QR Code Medical Document Upload Submission ────────
router.post("/patient/offline-upload/:token/documents", async (req, res) => {
  const { token } = req.params;
  const { name, objectPath, contentType, size } = req.body;

  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "invalid_token", message: "Upload token is required." });
    return;
  }

  if (!name || !objectPath) {
    res.status(400).json({ error: "missing_fields", message: "Document name and objectPath are required." });
    return;
  }

  const [qrRecord] = await db
    .select()
    .from(offlineQrTokensTable)
    .where(eq(offlineQrTokensTable.token, token));

  if (!qrRecord) {
    res.status(404).json({ error: "not_found", message: "Invalid or non-existent QR upload token." });
    return;
  }

  if (qrRecord.expiresAt < new Date()) {
    res.status(410).json({
      error: "expired",
      message: "QR Code Expired. This upload link has expired. Please contact Susruta Hospital for assistance."
    });
    return;
  }

  const [doc] = await db.insert(patientDocumentsTable).values({
    patientId: qrRecord.patientId,
    name: String(name).trim(),
    objectPath: String(objectPath).trim(),
    contentType: String(contentType || "application/octet-stream").trim(),
    size: Number(size) || 0,
  }).returning();

  // Also record metadata in appointment.notes
  const [appointment] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, qrRecord.appointmentId));
  if (appointment) {
    let parsedNotes: any = {};
    try {
      parsedNotes = JSON.parse(appointment.notes || "{}");
    } catch {}
    const existingDocs = Array.isArray(parsedNotes.documents) ? parsedNotes.documents : [];
    existingDocs.push({
      id: doc.id,
      name: doc.name,
      objectPath: doc.objectPath,
      contentType: doc.contentType,
      size: doc.size,
    });
    parsedNotes.documents = existingDocs;
    await db.update(appointmentsTable).set({ notes: JSON.stringify(parsedNotes) }).where(eq(appointmentsTable.id, appointment.id));
  }

  res.json({ success: true, message: "Document uploaded successfully", document: doc });
});

export default router;
