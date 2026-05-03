import { Router } from "express";
import { db, onlineAppointmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { addGuestSseClient, getGuestWaitingCount } from "../lib/guestSse";

const router = Router();

// GET /api/guest/sse/:apptId — public SSE stream for guests in the waiting room
router.get("/sse/:apptId", (req, res) => {
  const apptId = parseInt(req.params.apptId, 10);
  if (isNaN(apptId)) { res.status(400).json({ error: "bad_id" }); return; }
  addGuestSseClient(apptId, res);
});

// GET /api/guest/status/:apptId — public, returns joinEnabled + how many guests are waiting
router.get("/status/:apptId", async (req, res) => {
  const apptId = parseInt(req.params.apptId, 10);
  if (isNaN(apptId)) { res.status(400).json({ error: "bad_id" }); return; }
  const [appt] = await db
    .select({ joinEnabled: onlineAppointmentsTable.joinEnabled })
    .from(onlineAppointmentsTable)
    .where(eq(onlineAppointmentsTable.id, apptId));
  if (!appt) { res.status(404).json({ error: "not_found" }); return; }
  res.json({ joinEnabled: appt.joinEnabled, waitingCount: getGuestWaitingCount(apptId) });
});

export default router;
