import { Router } from "express";
import { AccessToken, RoomServiceClient, WebhookReceiver } from "livekit-server-sdk";
import { db, onlineAppointmentsTable, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { notifyAdminCallEnded } from "./appointments";
import { notifyPatientSessionEnded } from "./patient";
import { broadcastAppointmentUpdated } from "../lib/appointmentSse";
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
            const [appt] = await db.select().from(onlineAppointmentsTable)
              .where(eq(onlineAppointmentsTable.id, apptId));

            // Only act if it wasn't already ended by the doctor/admin (to avoid double-notifications)
            const wasStillJoinEnabled = appt?.joinEnabled ?? false;

            await db.update(onlineAppointmentsTable)
              .set({ joinEnabled: false, status: "completed" })
              .where(eq(onlineAppointmentsTable.id, apptId));

            // Notify admin panel
            notifyAdminCallEnded(apptId);

            if (wasStillJoinEnabled && appt) {
              // Room closed by LiveKit itself (network blip, timeout, etc.) — notify everyone
              console.log(`[livekit webhook] room closed by LiveKit, notifying patient ${appt.patientId} and doctor portal`);
              const [settings] = await db.select().from(siteSettingsTable);
              notifyPatientSessionEnded(appt.patientId, apptId, settings?.phonepeQrObjectPath ?? null);
              broadcastAppointmentUpdated({ id: apptId, joinEnabled: false, status: "completed" });
            }
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
