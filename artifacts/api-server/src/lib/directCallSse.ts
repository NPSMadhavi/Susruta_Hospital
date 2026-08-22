import type { Response } from "express";

export function notifyPatientDirectCallStarted(patientId: number, call: object) {
  const payload = `event: direct_call_started\ndata: ${JSON.stringify(call)}\n\n`;
  // Importing the patient set here would create a route cycle, so callers
  // register patient responses with this module.
  for (const client of patientClients) {
    if (client.patientId === patientId) {
      try { client.res.write(payload); } catch { patientClients.delete(client); }
    }
  }
}

export function notifyPatientDirectCallEnded(patientId: number, callId: number) {
  const payload = `event: direct_call_ended\ndata: ${JSON.stringify({ callId })}\n\n`;
  for (const client of patientClients) {
    if (client.patientId === patientId) {
      try { client.res.write(payload); } catch { patientClients.delete(client); }
    }
  }
}

type PatientClient = { patientId: number; res: Response };
const patientClients = new Set<PatientClient>();

export function addDirectCallPatientClient(patientId: number, res: Response) {
  const client = { patientId, res };
  patientClients.add(client);
  return () => patientClients.delete(client);
}