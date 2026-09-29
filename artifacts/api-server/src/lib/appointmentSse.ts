import type { Response } from "express";

const doctorClients = new Set<Response>();

export function addAppointmentSseClient(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const keepAlive = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 25_000);

  doctorClients.add(res);

  res.on("close", () => {
    clearInterval(keepAlive);
    doctorClients.delete(res);
  });
}

function broadcast(event: string, data: object) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of doctorClients) {
    try { client.write(msg); } catch { doctorClients.delete(client); }
  }
}

export function broadcastNewOnlineAppointment(appt: object) {
  broadcast("new_online_appointment", appt);
}

export function broadcastAppointmentUpdated(payload: {
  id: number;
  joinEnabled?: boolean;
  status?: string;
  patientJoinedAt?: string | null;
  patientName?: string;
  patientCode?: string | null;
  roomName?: string;
}) {
  broadcast("appointment_updated", payload);
}

export function broadcastPermissionUpdate(apptId: number, participants: object[]) {
  broadcast("permission_update", { apptId, participants });
}

export function broadcastDirectCallUpdated(payload: object) {
  broadcast("direct_call_updated", payload);
}
