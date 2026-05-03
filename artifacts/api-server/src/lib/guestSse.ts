import { Response } from "express";

type GuestClient = { apptId: number; res: Response };
const guestClients = new Set<GuestClient>();

export function addGuestSseClient(apptId: number, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const client: GuestClient = { apptId, res };
  guestClients.add(client);

  const hb = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { cleanup(); }
  }, 15000);

  function cleanup() {
    clearInterval(hb);
    guestClients.delete(client);
  }

  res.on("close", cleanup);
  res.on("error", cleanup);
}

export function getGuestWaitingCount(apptId: number): number {
  let count = 0;
  for (const c of guestClients) {
    if (c.apptId === apptId) count++;
  }
  return count;
}

export function notifyGuestsJoinEnabled(apptId: number) {
  const payload = `event: join_enabled\ndata: ${JSON.stringify({ apptId })}\n\n`;
  for (const c of guestClients) {
    if (c.apptId === apptId) {
      try { c.res.write(payload); } catch { guestClients.delete(c); }
    }
  }
}

export function notifyGuestsSessionEnded(apptId: number) {
  const payload = `event: session_ended\ndata: ${JSON.stringify({ apptId })}\n\n`;
  for (const c of guestClients) {
    if (c.apptId === apptId) {
      try { c.res.write(payload); } catch { guestClients.delete(c); }
    }
  }
}
