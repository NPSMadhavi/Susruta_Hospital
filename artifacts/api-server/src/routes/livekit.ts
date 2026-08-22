import { Router } from "express";
import { AccessToken, RoomServiceClient, WebhookReceiver } from "livekit-server-sdk";
import { db, onlineAppointmentsTable, siteSettingsTable, patientsTable, directCallsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { notifyAdminCallEnded } from "./appointments";
import { notifyGuestsSessionEnded } from "../lib/guestSse";
import { notifyPatientSessionEnded } from "./patient";
import { broadcastAppointmentUpdated } from "../lib/appointmentSse";
import { requireAdmin } from "../lib/auth";
import { endDirectCall } from "./direct-calls";
import express from "express";

const router = Router();

const LK_URL = process.env.LIVEKIT_URL!;
const LK_API_KEY = process.env.LIVEKIT_API_KEY!;
const LK_API_SECRET = process.env.LIVEKIT_API_SECRET!;

export const roomService = new RoomServiceClient(LK_URL, LK_API_KEY, LK_API_SECRET);

export function makeRoomName(apptId: number) {
  return `susruta-appt-${apptId}`;
}

// ── Token helpers ─────────────────────────────────────────────

export function createPatientToken(apptId: number, patientName: string, patientId: number) {
  const at = new AccessToken(LK_API_KEY, LK_API_SECRET, {
    identity: `patient-${patientId}`,
    name: patientName,
    ttl: 3 * 60 * 60, // 3 hours
  });
  at.addGrant({ roomJoin: true, room: makeRoomName(apptId), canPublish: true, canSubscribe: true });
  return at.toJwt();
}

export function createDoctorToken(apptId: number) {
  const at = new AccessToken(LK_API_KEY, LK_API_SECRET, {
    identity: "doctor",
    name: "Dr. P. Murali Krishna",
    ttl: 3 * 60 * 60,
  });
  at.addGrant({
    roomJoin: true,
    room: makeRoomName(apptId),
    canPublish: true,
    canSubscribe: true,
    roomAdmin: true,
  });
  return at.toJwt();
}

export function makeDirectRoomName(callId: number) {
  return `susruta-direct-${callId}`;
}

export function createDirectPatientToken(callId: number, patientName: string, patientId: number, roomName: string) {
  const at = new AccessToken(LK_API_KEY, LK_API_SECRET, {
    identity: `patient-${patientId}`,
    name: patientName,
    ttl: 3 * 60 * 60,
  });
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
  return at.toJwt();
}

export function createDirectDoctorToken(roomName: string) {
  const at = new AccessToken(LK_API_KEY, LK_API_SECRET, {
    identity: "doctor",
    name: "Dr. P. Murali Krishna",
    ttl: 3 * 60 * 60,
  });
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, roomAdmin: true });
  return at.toJwt();
}

export function createGuestToken(apptId: number, guestName = "Guest") {
  const at = new AccessToken(LK_API_KEY, LK_API_SECRET, {
    identity: `guest-${Date.now()}`,
    name: guestName,
    ttl: 3 * 60 * 60,
  });
  at.addGrant({ roomJoin: true, room: makeRoomName(apptId), canPublish: true, canSubscribe: true });
  return at.toJwt();
}

// ── GET /api/livekit/patient-token/:apptId ────────────────────
// Patient gets their own token to join the call
router.get("/patient-token/:apptId", async (req: any, res) => {
  // manual patient auth (requirePatient middleware isn't chainable here easily)
  const { verifyPatientSession } = await import("../lib/patient-auth");
  const sessionToken = req.cookies?.["patient_session"];
  if (!sessionToken) { res.status(401).json({ error: "unauthorized" }); return; }
  const patient = await verifyPatientSession(sessionToken);
  if (!patient) { res.status(401).json({ error: "unauthorized" }); return; }

  const apptId = parseInt(req.params.apptId, 10);
  const [appt] = await db.select().from(onlineAppointmentsTable)
    .where(eq(onlineAppointmentsTable.id, apptId));

  if (!appt || appt.patientId !== patient.id) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (!appt.joinEnabled) {
    res.status(403).json({ error: "call_not_started", message: "Doctor has not started the call yet." });
    return;
  }

  const roomName = appt.livekitRoomName || makeRoomName(apptId);
  const token = await createPatientToken(apptId, patient.name, patient.id);
  res.json({ token, roomName, serverUrl: LK_URL });
});

// ── GET /api/livekit/doctor-token/:apptId ────────────────────
router.get("/doctor-token/:apptId", async (req: any, res) => {
  const { verifyDoctorSession } = await import("../lib/doctor-auth");
  const sessionToken = req.cookies?.["doctor_session"];
  if (!sessionToken) { res.status(401).json({ error: "unauthorized" }); return; }
  const valid = await verifyDoctorSession(sessionToken);
  if (!valid) { res.status(401).json({ error: "unauthorized" }); return; }

  const apptId = parseInt(req.params.apptId, 10);
  const [appt] = await db.select().from(onlineAppointmentsTable)
    .where(eq(onlineAppointmentsTable.id, apptId));
  if (!appt) { res.status(404).json({ error: "not_found" }); return; }
  if (!appt.joinEnabled) {
    res.status(403).json({ error: "call_not_started", message: "Call has not been started yet." });
    return;
  }

  const roomName = appt.livekitRoomName || makeRoomName(apptId);
  const token = await createDoctorToken(apptId);
  res.json({ token, roomName, serverUrl: LK_URL });
});

// ── GET /api/livekit/guest-token/:apptId ─────────────────────
// Public endpoint — uses the pre-generated guest token stored on the appointment
router.get("/guest-token/:apptId", async (req, res) => {
  const apptId = parseInt(req.params.apptId, 10);
  const [appt] = await db.select().from(onlineAppointmentsTable)
    .where(eq(onlineAppointmentsTable.id, apptId));

  if (!appt || !appt.joinEnabled) {
    res.status(403).json({ error: "call_not_active" });
    return;
  }

  const roomName = appt.livekitRoomName || makeRoomName(apptId);
  // Issue a fresh guest token each time (short TTL)
  const token = await createGuestToken(apptId, (req.query.name as string) || "Guest");
  res.json({ token, roomName, serverUrl: LK_URL });
});

// ── GET /api/livekit/admin-token/:apptId ─────────────────────
// Admin joins an ongoing call as a silent observer (no cam/mic published by default)
router.get("/admin-token/:apptId", requireAdmin, async (req, res) => {
  const apptId = parseInt(req.params.apptId, 10);
  const [appt] = await db.select().from(onlineAppointmentsTable)
    .where(eq(onlineAppointmentsTable.id, apptId));

  if (!appt) { res.status(404).json({ error: "not_found" }); return; }
  if (!appt.joinEnabled) {
    res.status(403).json({ error: "call_not_active", message: "This session is not currently active." });
    return;
  }

  const roomName = appt.livekitRoomName || makeRoomName(apptId);
  const at = new AccessToken(LK_API_KEY, LK_API_SECRET, {
    identity: `admin-${Date.now()}`,
    name: "Admin",
    ttl: 3 * 60 * 60,
  });
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, roomAdmin: true });
  const token = await at.toJwt();
  res.json({ token, roomName, serverUrl: LK_URL });
});

// ── Direct-call token routes ───────────────────────────────────
router.get("/direct-patient-token/:callId", async (req: any, res) => {
  const { verifyPatientSession } = await import("../lib/patient-auth");
  const sessionToken = req.cookies?.["patient_session"];
  if (!sessionToken) { res.status(401).json({ error: "unauthorized" }); return; }
  const patient = await verifyPatientSession(sessionToken);
  if (!patient) { res.status(401).json({ error: "unauthorized" }); return; }

  const callId = parseInt(req.params.callId, 10);
  const [row] = await db.select({ call: directCallsTable, patient: patientsTable })
    .from(directCallsTable)
    .innerJoin(patientsTable, eq(directCallsTable.patientId, patientsTable.id))
    .where(and(eq(directCallsTable.id, callId), eq(directCallsTable.patientId, patient.id)));
  if (!row || row.call.status !== "active") {
    res.status(404).json({ error: "call_not_active", message: "This direct call is no longer active." });
    return;
  }
  res.json({
    token: createDirectPatientToken(callId, patient.name, patient.id, row.call.roomName),
    roomName: row.call.roomName,
    serverUrl: LK_URL,
  });
});

router.get("/direct-doctor-token/:callId", async (req: any, res) => {
  const { verifyDoctorSession } = await import("../lib/doctor-auth");
  const sessionToken = req.cookies?.["doctor_session"];
  if (!sessionToken || !(await verifyDoctorSession(sessionToken))) {
    res.status(401).json({ error: "unauthorized" }); return;
  }
  const callId = parseInt(req.params.callId, 10);
  const [call] = await db.select().from(directCallsTable).where(eq(directCallsTable.id, callId));
  if (!call || call.status !== "active") {
    res.status(404).json({ error: "call_not_active", message: "This direct call is no longer active." });
    return;
  }
  res.json({ token: createDirectDoctorToken(call.roomName), roomName: call.roomName, serverUrl: LK_URL });
});

router.get("/direct-admin-token/:callId", requireAdmin, async (req, res) => {
  const callId = parseInt(req.params.callId, 10);
  const [call] = await db.select().from(directCallsTable).where(eq(directCallsTable.id, callId));
  if (!call || call.status !== "active") {
    res.status(404).json({ error: "call_not_active", message: "This direct call is no longer active." });
    return;
  }
  const at = new AccessToken(LK_API_KEY, LK_API_SECRET, {
    identity: `admin-direct-${Date.now()}`,
    name: "Admin",
    ttl: 3 * 60 * 60,
  });
  at.addGrant({ roomJoin: true, room: call.roomName, canPublish: false, canSubscribe: true, roomAdmin: true });
  res.json({ token: await at.toJwt(), roomName: call.roomName, serverUrl: LK_URL });
});

// ── POST /api/livekit/webhook ─────────────────────────────────
// LiveKit calls this when room events happen (participant left, room closed, etc.)
router.post(
  "/webhook",
  express.raw({ type: "application/webhook+json" }),
  async (req, res) => {
    const receiver = new WebhookReceiver(LK_API_KEY, LK_API_SECRET);
    try {
      const body = req.body instanceof Buffer ? req.body.toString() : JSON.stringify(req.body);
      const authHeader = req.headers["authorization"] as string | undefined;
      const event = await receiver.receive(body, authHeader);

      if (event.event === "room_finished") {
        const roomName = event.room?.name;
        console.log(`[livekit webhook] room_finished: ${roomName}`);
        if (roomName?.startsWith("susruta-appt-")) {
          const apptId = parseInt(roomName.replace("susruta-appt-", ""), 10);
          if (!isNaN(apptId)) {
            const rows = await db
              .select({ appt: onlineAppointmentsTable, patient: patientsTable })
              .from(onlineAppointmentsTable)
              .innerJoin(patientsTable, eq(onlineAppointmentsTable.patientId, patientsTable.id))
              .where(eq(onlineAppointmentsTable.id, apptId));

            const appt = rows[0]?.appt;
            const patientName = rows[0]?.patient?.name;

            // Only act if it wasn't already ended by the doctor/admin (to avoid double-notifications)
            const wasStillJoinEnabled = appt?.joinEnabled ?? false;

            await db.update(onlineAppointmentsTable)
              .set({ joinEnabled: false, status: "completed" })
              .where(eq(onlineAppointmentsTable.id, apptId));

            // Notify admin panel immediately with patient name
            notifyAdminCallEnded(apptId, patientName);

            if (wasStillJoinEnabled && appt) {
              // Room closed by LiveKit itself (network blip, timeout, etc.) — notify everyone
              console.log(`[livekit webhook] room closed by LiveKit, notifying patient ${appt.patientId} and doctor portal`);
              const [settings] = await db.select().from(siteSettingsTable);
              notifyPatientSessionEnded(appt.patientId, apptId, settings?.phonepeQrObjectPath ?? null);
              notifyGuestsSessionEnded(apptId);
              broadcastAppointmentUpdated({ id: apptId, joinEnabled: false, status: "completed" });
            }
          }
        }
        if (roomName?.startsWith("susruta-direct-")) {
          const calls = await db.select().from(directCallsTable)
            .where(eq(directCallsTable.roomName, roomName));
          const call = calls[0];
          if (call?.status === "active") {
            await endDirectCall(call.id);
          }
        }
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[livekit webhook]", err);
      res.status(400).json({ error: "webhook_invalid" });
    }
  }
);

export default router;
