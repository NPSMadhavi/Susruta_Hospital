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

export function getLiveKitConfig() {
  const url = (process.env.LIVEKIT_URL || "ws://localhost:7880").trim();
  const apiKey = (process.env.LIVEKIT_API_KEY || "devkey").trim();
  const apiSecret = (process.env.LIVEKIT_API_SECRET || "secret").trim();
  return { url, apiKey, apiSecret };
}

export function getRoomService() {
  const { url, apiKey, apiSecret } = getLiveKitConfig();
  return new RoomServiceClient(url, apiKey, apiSecret);
}

export const roomService = new Proxy({} as RoomServiceClient, {
  get(_target, prop) {
    const instance = getRoomService();
    const val = (instance as any)[prop];
    return typeof val === "function" ? val.bind(instance) : val;
  },
});

export function makeRoomName(apptId: number) {
  return `susruta-appt-${apptId}`;
}

// ── Token helpers ─────────────────────────────────────────────

export function createPatientToken(apptId: number, patientName: string, patientId: number) {
  const { apiKey, apiSecret } = getLiveKitConfig();
  const at = new AccessToken(apiKey, apiSecret, {
    identity: `patient-${patientId}`,
    name: patientName,
    ttl: 3 * 60 * 60, // 3 hours
  });
  at.addGrant({ roomJoin: true, room: makeRoomName(apptId), canPublish: true, canSubscribe: true });
  return at.toJwt();
}

export function createDoctorToken(apptId: number) {
  const { apiKey, apiSecret } = getLiveKitConfig();
  const at = new AccessToken(apiKey, apiSecret, {
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
  const { apiKey, apiSecret } = getLiveKitConfig();
  const at = new AccessToken(apiKey, apiSecret, {
    identity: `patient-${patientId}`,
    name: patientName,
    ttl: 3 * 60 * 60,
  });
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
  return at.toJwt();
}

export function createDirectDoctorToken(roomName: string) {
  const { apiKey, apiSecret } = getLiveKitConfig();
  const at = new AccessToken(apiKey, apiSecret, {
    identity: "doctor",
    name: "Dr. P. Murali Krishna",
    ttl: 3 * 60 * 60,
  });
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, roomAdmin: true });
  return at.toJwt();
}

export function createGuestToken(apptId: number, guestName = "Guest") {
  const { apiKey, apiSecret } = getLiveKitConfig();
  const at = new AccessToken(apiKey, apiSecret, {
    identity: `guest-${Date.now()}`,
    name: guestName,
    ttl: 3 * 60 * 60,
  });
  at.addGrant({ roomJoin: true, room: makeRoomName(apptId), canPublish: true, canSubscribe: true });
  return at.toJwt();
}

// ── GET /api/livekit/patient-token/:apptId ────────────────────
router.get("/patient-token/:apptId", async (req: any, res) => {
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
  const { url } = getLiveKitConfig();
  res.json({ token, roomName, serverUrl: url });
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
  const { url } = getLiveKitConfig();
  res.json({ token, roomName, serverUrl: url });
});

// ── GET /api/livekit/guest-token/:apptId ─────────────────────
router.get("/guest-token/:apptId", async (req, res) => {
  const apptId = parseInt(req.params.apptId, 10);
  const [appt] = await db.select().from(onlineAppointmentsTable)
    .where(eq(onlineAppointmentsTable.id, apptId));

  if (!appt || !appt.joinEnabled) {
    res.status(403).json({ error: "call_not_active" });
    return;
  }

  const roomName = appt.livekitRoomName || makeRoomName(apptId);
  const token = await createGuestToken(apptId, (req.query.name as string) || "Guest");
  const { url } = getLiveKitConfig();
  res.json({ token, roomName, serverUrl: url });
});

// ── GET /api/livekit/admin-token/:apptId ─────────────────────
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
  const { apiKey, apiSecret, url } = getLiveKitConfig();
  const at = new AccessToken(apiKey, apiSecret, {
    identity: `admin-${Date.now()}`,
    name: "Admin",
    ttl: 3 * 60 * 60,
  });
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, roomAdmin: true });
  const token = await at.toJwt();
  res.json({ token, roomName, serverUrl: url });
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
  const { url } = getLiveKitConfig();
  res.json({
    token: createDirectPatientToken(callId, patient.name, patient.id, row.call.roomName),
    roomName: row.call.roomName,
    serverUrl: url,
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
  const { url } = getLiveKitConfig();
  res.json({ token: createDirectDoctorToken(call.roomName), roomName: call.roomName, serverUrl: url });
});

router.get("/direct-admin-token/:callId", requireAdmin, async (req, res) => {
  const callId = parseInt(req.params.callId, 10);
  const [call] = await db.select().from(directCallsTable).where(eq(directCallsTable.id, callId));
  if (!call || call.status !== "active") {
    res.status(404).json({ error: "call_not_active", message: "This direct call is no longer active." });
    return;
  }
  const { apiKey, apiSecret, url } = getLiveKitConfig();
  const at = new AccessToken(apiKey, apiSecret, {
    identity: `admin-${Date.now()}`,
    name: "Admin",
    ttl: 3 * 60 * 60,
  });
  at.addGrant({ roomJoin: true, room: call.roomName, canPublish: true, canSubscribe: true, roomAdmin: true });
  const token = await at.toJwt();
  res.json({ token, roomName: call.roomName, serverUrl: url });
});

// ── Webhook Handler ───────────────────────────────────────────
router.post("/webhook", express.raw({ type: "application/webhook+json" }), async (req, res) => {
  try {
    const { apiKey, apiSecret } = getLiveKitConfig();
    const receiver = new WebhookReceiver(apiKey, apiSecret);
    const authHeader = req.headers.authorization;
    if (!authHeader) { res.status(401).send("Unauthorized"); return; }
    const bodyStr = Buffer.isBuffer(req.body) ? req.body.toString("utf-8") : String(req.body || "");
    const event = await receiver.receive(bodyStr, authHeader);
    
    if (event.event === "room_finished") {
      const roomName = event.room?.name;
      if (roomName?.startsWith("susruta-appt-")) {
        const apptId = parseInt(roomName.replace("susruta-appt-", ""), 10);
        if (!isNaN(apptId)) {
          const [appt] = await db.select().from(onlineAppointmentsTable).where(eq(onlineAppointmentsTable.id, apptId));
          await db.update(onlineAppointmentsTable)
            .set({ joinEnabled: false, status: "completed" })
            .where(eq(onlineAppointmentsTable.id, apptId));
          notifyAdminCallEnded(apptId);
          notifyGuestsSessionEnded(apptId);
          if (appt?.patientId) {
            notifyPatientSessionEnded(appt.patientId, apptId, null);
          }
          broadcastAppointmentUpdated({ id: apptId, joinEnabled: false, status: "completed" });
        }
      } else if (roomName?.startsWith("susruta-direct-")) {
        const callId = parseInt(roomName.replace("susruta-direct-", ""), 10);
        if (!isNaN(callId)) {
          await endDirectCall(callId);
        }
      }
    }
    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(400).send("Bad request");
  }
});

export default router;
