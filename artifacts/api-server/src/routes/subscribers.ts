import { Router, Response } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db, subscribersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { sendSubscriptionConfirmation, sendBroadcastEmail, verifyUnsubscribeToken } from "../lib/email";
import { z } from "zod/v4";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const SubscribeBody = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(6).max(20),
  email: z.string().email(),
  country: z.string().max(100).optional(),
});

// ── Public: One-click unsubscribe (linked from every email) ──
// GET /api/subscribers/unsubscribe?email=xxx&token=xxx
router.get("/unsubscribe", async (req, res) => {
  const email = (req.query.email as string | undefined)?.toLowerCase().trim();
  const token = req.query.token as string | undefined;

  function page(title: string, message: string, success: boolean) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — Susruta Hospital</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;background:#f5f5f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;border-radius:16px;padding:48px 40px;max-width:440px;width:100%;text-align:center;box-shadow:0 2px 16px rgba(0,0,0,.08)}
    .icon{font-size:48px;margin-bottom:20px}
    h1{font-size:22px;color:#1a3d2b;margin-bottom:12px}
    p{color:#666;font-size:15px;line-height:1.6;margin-bottom:24px}
    a{display:inline-block;padding:12px 28px;border-radius:10px;font-weight:bold;font-size:14px;text-decoration:none;color:#fff;background:${success ? "#2d6a4f" : "#999"}}
  </style>
</head><body>
  <div class="card">
    <div class="icon">${success ? "✅" : "⚠️"}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="https://susrutahospital.com">Back to Website</a>
  </div>
</body></html>`);
  }

  if (!email || !token) {
    page("Invalid Link", "This unsubscribe link is missing required information.", false);
    return;
  }

  if (!verifyUnsubscribeToken(email, token)) {
    page("Invalid Link", "This unsubscribe link is invalid or has been tampered with.", false);
    return;
  }

  const [sub] = await db.select().from(subscribersTable).where(eq(subscribersTable.email, email));
  if (!sub) {
    page("Already Unsubscribed", "This email address is not on our list — you may have already unsubscribed.", true);
    return;
  }

  await db.delete(subscribersTable).where(eq(subscribersTable.email, email));
  page("You've been unsubscribed", `<strong>${sub.name}</strong>, you have been removed from the Susruta Hospital updates list. You will not receive any further emails from us.`, true);
});

// ── SSE Notification Clients ──────────────────────────────────
const sseClients = new Set<Response>();

export function notifyNewSubscriber(sub: any) {
  const payload = JSON.stringify({ type: "new_subscriber", subscriber: sub });
  for (const client of sseClients) {
    try { client.write(`data: ${payload}\n\n`); } catch { sseClients.delete(client); }
  }
}

// ── Admin: SSE stream ─────────────────────────────────────────
router.get("/notifications", requireAdmin, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Transfer-Encoding", "chunked");
  res.flushHeaders();

  res.write(": connected\n\n");
  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(heartbeat); }
  }, 10000);

  sseClients.add(res);
  req.on("close", () => { sseClients.delete(res); clearInterval(heartbeat); });
});

// ── Public: Subscribe ────────────────────────────────────────
router.post("/", async (req, res) => {
  const parsed = SubscribeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: "Please provide a valid name, phone number, and email address." });
    return;
  }
  const { name, phone, email, country } = parsed.data;

  const existing = await db.select().from(subscribersTable).where(eq(subscribersTable.email, email));
  if (existing.length > 0) {
    res.status(200).json({ already_subscribed: true, message: "You are already subscribed! We will notify you when our services go live." });
    return;
  }

  const [sub] = await db.insert(subscribersTable).values({ name, phone, email, country: country ?? null }).returning();
  const serialized = { ...sub, subscribedAt: sub.subscribedAt.toISOString() };

  // Real-time push to admin panel
  notifyNewSubscriber(serialized);

  sendSubscriptionConfirmation({ to: email, name }).catch(() => {});
  res.status(201).json({ id: sub.id, message: "Subscribed successfully." });
});

// ── Admin: List ──────────────────────────────────────────────
router.get("/", requireAdmin, async (_req, res) => {
  const subs = await db.select().from(subscribersTable).orderBy(desc(subscribersTable.subscribedAt));
  res.json(subs.map((s) => ({ ...s, subscribedAt: s.subscribedAt.toISOString() })));
});

// ── Admin: Delete ────────────────────────────────────────────
router.delete("/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(subscribersTable).where(eq(subscribersTable.id, id));
  res.status(204).send();
});

// ── Admin: Broadcast (streaming NDJSON) ──────────────────────
// Streams one JSON line per email sent so the frontend can show real-time progress.
// Sends emails sequentially with a configurable delay between each to avoid
// triggering spam rate limits.
router.post("/broadcast", requireAdmin, async (req, res) => {
  const { subject, bodyHtml, delayMs = 2000 } = req.body;
  if (!subject?.trim() || !bodyHtml?.trim()) {
    res.status(400).json({ error: "missing_fields", message: "Subject and message body are required." });
    return;
  }

  const subs = await db.select().from(subscribersTable).orderBy(desc(subscribersTable.subscribedAt));
  if (subs.length === 0) {
    res.status(400).json({ error: "no_subscribers", message: "No subscribers to send to." });
    return;
  }

  // Clamp delay: 500ms–5000ms
  const delay = Math.min(5000, Math.max(500, Number(delayMs) || 2000));

  // Switch to streaming NDJSON response
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Transfer-Encoding", "chunked");
  res.flushHeaders();

  const send = (obj: object) => res.write(JSON.stringify(obj) + "\n");

  send({ type: "start", total: subs.length, delayMs: delay });

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < subs.length; i++) {
    const s = subs[i];
    try {
      await sendBroadcastEmail({ to: s.email, name: s.name, subject, bodyHtml });
      sent++;
      send({ type: "sent", current: i + 1, total: subs.length, email: s.email, name: s.name });
    } catch (err: any) {
      failed++;
      send({ type: "error", current: i + 1, total: subs.length, email: s.email, name: s.name, message: err.message });
    }

    // Delay between emails (keeps-alive the stream with a heartbeat tick too)
    if (i < subs.length - 1) {
      await new Promise((r) => setTimeout(r, delay));
      send({ type: "tick" }); // keeps connection alive through proxies
    }
  }

  send({ type: "done", sent, failed, total: subs.length });
  res.end();
});

// ── Admin: Import from Excel ─────────────────────────────────
router.post("/import", requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "no_file", message: "Please upload an Excel (.xlsx or .xls) or CSV file." });
    return;
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(req.file.buffer, { type: "buffer" });
  } catch {
    res.status(400).json({ error: "invalid_file", message: "Could not read the file. Please upload a valid Excel or CSV file." });
    return;
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (rows.length === 0) {
    res.status(400).json({ error: "empty_file", message: "The file has no data rows." });
    return;
  }

  function findCol(row: any, ...keys: string[]): string {
    for (const k of keys) {
      for (const col of Object.keys(row)) {
        if (col.toLowerCase().replace(/\s|_/g, "") === k.toLowerCase().replace(/\s|_/g, "")) {
          return String(row[col] ?? "").trim();
        }
      }
    }
    return "";
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = findCol(row, "name", "fullname", "full_name", "patientname");
    const phone = findCol(row, "phone", "phonenumber", "phone_number", "mobile", "contact");
    const email = findCol(row, "email", "emailaddress", "email_address");
    const country = findCol(row, "country", "location", "region");

    if (!name || !email) {
      skipped++;
      errors.push(`Row ${i + 2}: Missing name or email`);
      continue;
    }

    const emailValid = z.string().email().safeParse(email).success;
    if (!emailValid) {
      skipped++;
      errors.push(`Row ${i + 2}: Invalid email "${email}"`);
      continue;
    }

    try {
      await db.insert(subscribersTable)
        .values({ name, phone: phone || "—", email, country: country || null })
        .onConflictDoNothing();
      imported++;
    } catch {
      skipped++;
      errors.push(`Row ${i + 2}: Could not import "${email}"`);
    }
  }

  res.json({ imported, skipped, errors: errors.slice(0, 20) });
});

export default router;
