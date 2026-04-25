import type { Response } from "express";

type SseClient = { role: "admin" | "doctor"; res: Response };

const clients = new Set<SseClient>();

export function addDonationSseClient(role: "admin" | "doctor", res: Response) {
  const client: SseClient = { role, res };
  clients.add(client);
  return () => clients.delete(client);
}

export function broadcastDonationUpdate(payload: {
  id: number;
  status: string;
  thankYouSent?: boolean;
}) {
  const data = `event: donation_updated\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    try { client.res.write(data); } catch { clients.delete(client); }
  }
}

export function broadcastNewDonation(donation: Record<string, unknown>) {
  const data = `event: new_donation\ndata: ${JSON.stringify(donation)}\n\n`;
  for (const client of clients) {
    try { client.res.write(data); } catch { clients.delete(client); }
  }
}
