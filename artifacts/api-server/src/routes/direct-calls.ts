import { Router } from "express";
import { randomBytes } from "crypto";
import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
import { db, directCallsTable, patientsTable } from "@workspace/db";
import { requireAdmin } from "../lib/auth";
import { requireDoctor } from "../lib/doctor-auth";
import { requirePatient } from "../lib/patient-auth";
import { roomService } from "./livekit";
import {
  addDirectCallPatientClient,
  notifyPatientDirectCallEnded,
  notifyPatientDirectCallStarted,
} from "../lib/directCallSse";
import { broadcastDirectCallUpdated } from "../lib/appointmentSse";

const router = Router();

function serializeCall(call: typeof directCallsTable.$inferSelect, patient: typeof patientsTable.$inferSelect) {
  return {
    id: call.id,
    status: call.status,
    roomName: call.roomName,
    startedAt: call.startedAt.toISOString(),
    patientJoinedAt: call.patientJoinedAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    patient: {
      id: patient.id,
      patientCode: patient.patientCode ?? null,
      name: patient.name,
      email: patient.email,
      phone: patient.phone ?? null,
    },
  };
}

async function getCallWithPatient(id: number) {
  const [row] = await db
    .select({ call: directCallsTable, patient: patientsTable })
    .from(directCallsTable)
    .innerJoin(patientsTable, eq(directCallsTable.patientId, patientsTable.id))
    .where(eq(directCallsTable.id, id));
  return row;
}

export async function endDirectCall(id: number) {
  const row = await getCallWithPatient(id);
  if (!row || row.call.status !== "active") return row ? false : null;

  const [updated] = await db.update(directCallsTable)
    .set({ status: "ended", endedAt: new Date() })
    .where(and(eq(directCallsTable.id, id), eq(directCallsTable.status, "active")))
    .returning();

  if (!updated) return false;
  roomService.deleteRoom(row.call.roomName).catch((err: { status?: number }) => {
    // A room is only created when someone joins. It is normal for an
    // unanswered direct call to have no LiveKit room to delete.
    if (err?.status !== 404) console.error("[livekit] direct room delete failed:", err);
  });
  notifyPatientDirectCallEnded(row.patient.id, id);
  broadcastDirectCallUpdated({ id, status: "ended" });
  return true;
}

// ── Admin: list currently active direct calls ───────────────────
router.get("/admin/active", requireAdmin, async (_req, res) => {
  const rows = await db.select({ call: directCallsTable, patient: patientsTable })
    .from(directCallsTable)
    .innerJoin(patientsTable, eq(directCallsTable.patientId, patientsTable.id))
    .where(eq(directCallsTable.status, "active"))
    .orderBy(desc(directCallsTable.startedAt));
  res.json(rows.map(row => serializeCall(row.call, row.patient)));
});

const StartBody = z.object({ patientId: z.coerce.number().int().positive() });

// ── Admin: start a direct call for a registered patient ─────────
router.post("/admin", requireAdmin, async (req, res) => {
  const parsed = StartBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: "A registered patient is required." });
    return;
  }

  const [patient] = await db.select().from(patientsTable)
    .where(eq(patientsTable.id, parsed.data.patientId));
  if (!patient) {
    res.status(404).json({ error: "patient_not_found", message: "That patient no longer exists." });
    return;
  }

  const [active] = await db.select().from(directCallsTable)
    .where(eq(directCallsTable.status, "active"))
    .limit(1);
  if (active) {
    res.status(409).json({ error: "call_already_active", message: "Another direct call is already active. End it before starting a new call." });
    return;
  }

  const roomName = `susruta-direct-${randomBytes(12).toString("hex")}`;
  const [call] = await db.insert(directCallsTable).values({
    patientId: patient.id,
    roomName,
    status: "active",
  }).returning();

  // LiveKit creates the room when the patient, doctor, or admin first joins.
  // Avoid pre-creating an empty room: hosted LiveKit can expire an empty room
  // before the patient has had time to answer the call.

  const serialized = serializeCall(call, patient);
  notifyPatientDirectCallStarted(patient.id, serialized);
  broadcastDirectCallUpdated({
    id: call.id,
    status: "active",
    roomName,
    patient: serialized.patient,
  });
  res.status(201).json(serialized);
});

router.post("/admin/:id/end", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "invalid_id" }); return; }
  const ended = await endDirectCall(id);
  if (ended === null) { res.status(404).json({ error: "not_found" }); return; }
  res.json({ ok: true, alreadyEnded: ended === false });
});

// ── Doctor: active call list and end control ────────────────────
router.get("/doctor/active", requireDoctor, async (_req, res) => {
  const rows = await db.select({ call: directCallsTable, patient: patientsTable })
    .from(directCallsTable)
    .innerJoin(patientsTable, eq(directCallsTable.patientId, patientsTable.id))
    .where(eq(directCallsTable.status, "active"))
    .orderBy(desc(directCallsTable.startedAt));
  res.json(rows.map(row => serializeCall(row.call, row.patient)));
});

router.post("/doctor/:id/end", requireDoctor, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "invalid_id" }); return; }
  const ended = await endDirectCall(id);
  if (ended === null) { res.status(404).json({ error: "not_found" }); return; }
  res.json({ ok: true, alreadyEnded: ended === false });
});

// ── Patient: current call + patient joined marker ───────────────
router.get("/patient/active", requirePatient, async (req: any, res) => {
  const [row] = await db.select({ call: directCallsTable, patient: patientsTable })
    .from(directCallsTable)
    .innerJoin(patientsTable, eq(directCallsTable.patientId, patientsTable.id))
    .where(and(eq(directCallsTable.patientId, req.patient.id), eq(directCallsTable.status, "active")))
    .orderBy(desc(directCallsTable.startedAt))
    .limit(1);
  res.json(row ? serializeCall(row.call, row.patient) : null);
});

router.post("/:id/patient-joined", requirePatient, async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "invalid_id" }); return; }
  const [call] = await db.select().from(directCallsTable)
    .where(and(eq(directCallsTable.id, id), eq(directCallsTable.patientId, req.patient.id)));
  if (!call || call.status !== "active") { res.status(404).json({ error: "not_found" }); return; }
  await db.update(directCallsTable).set({ patientJoinedAt: new Date() })
    .where(eq(directCallsTable.id, id));
  res.json({ ok: true });
});

// The patient SSE connection is authenticated by the existing patient
// middleware and shared with the direct-call notification channel.
router.get("/patient/sse", requirePatient, (req: any, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(": connected\n\n");
  const cleanup = addDirectCallPatientClient(req.patient.id, res);
  const heartbeat = setInterval(() => { try { res.write(": ping\n\n"); } catch { clearInterval(heartbeat); } }, 15000);
  req.on("close", () => { cleanup(); clearInterval(heartbeat); });
});

export default router;