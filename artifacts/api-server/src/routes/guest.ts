import { Router } from "express";
import { db, onlineAppointmentsTable, patientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { addGuestSseClient, getGuestWaitingCount } from "../lib/guestSse";
import { setPermission, getPermissions } from "../lib/permissionStore";
import { broadcastPermissionUpdate } from "../lib/appointmentSse";

const router = Router();

// GET /api/guest/sse/:apptId — public SSE stream for guests in the waiting room
router.get("/sse/:apptId", (req, res) => {
  const apptId = parseInt(req.params.apptId, 10);
  if (isNaN(apptId)) { res.status(400).json({ error: "bad_id" }); return; }
  addGuestSseClient(apptId, res);
});

// GET /api/guest/status/:apptId — public, returns joinEnabled + waiting count + patient first name
router.get("/status/:apptId", async (req, res) => {
  const apptId = parseInt(req.params.apptId, 10);
  if (isNaN(apptId)) { res.status(400).json({ error: "bad_id" }); return; }

  const rows = await db
    .select({
      joinEnabled: onlineAppointmentsTable.joinEnabled,
      patientName: patientsTable.name,
    })
    .from(onlineAppointmentsTable)
    .innerJoin(patientsTable, eq(onlineAppointmentsTable.patientId, patientsTable.id))
    .where(eq(onlineAppointmentsTable.id, apptId));

  if (rows.length === 0) { res.status(404).json({ error: "not_found" }); return; }

  const { joinEnabled, patientName } = rows[0];
  // Return only the patient's first name for the default guest label
  const firstName = (patientName ?? "").split(" ")[0] || "Patient";

  res.json({
    joinEnabled,
    waitingCount: getGuestWaitingCount(apptId),
    patientFirstName: firstName,
  });
});

// POST /api/guest/permissions/:apptId — Guest reports camera/mic status after Allow button
router.post("/permissions/:apptId", async (req, res) => {
  const apptId = parseInt(req.params.apptId, 10);
  if (isNaN(apptId)) { res.status(400).json({ error: "bad_id" }); return; }
  const { name, camera, mic } = req.body;
  const guestKey = `guest-${(name || "Guest").slice(0, 60)}`;

  setPermission(apptId, guestKey, {
    name: name || "Guest",
    role: "guest",
    camera: typeof camera === "boolean" ? camera : null,
    mic: typeof mic === "boolean" ? mic : null,
    updatedAt: Date.now(),
  });
  broadcastPermissionUpdate(apptId, getPermissions(apptId));
  res.json({ ok: true });
});

export default router;
