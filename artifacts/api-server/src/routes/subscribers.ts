import { Router, Response } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db, subscribersTable } from "@workspace/db";
import { eq, desc, and, ne } from "drizzle-orm";
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

// ── Shared page renderer for unsubscribe flow ─────────────────
function renderPage(res: Response, html: string) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Susruta Hospital — Unsubscribe</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,Helvetica,sans-serif;background:#f0f4f1;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px}
    .header{background:#1a3d2b;width:100%;max-width:540px;border-radius:16px 16px 0 0;padding:28px 36px;text-align:center}
    .header h1{color:#fff;font-size:18px;letter-spacing:.5px;margin:0}
    .header p{color:rgba(255,255,255,.6);font-size:12px;margin:5px 0 0}
    .card{background:#fff;width:100%;max-width:540px;border-radius:0 0 16px 16px;padding:36px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .icon{font-size:44px;margin-bottom:16px;display:block;text-align:center}
    h2{font-size:20px;color:#1a3d2b;margin:0 0 10px;font-weight:bold}
    .sub{color:#666;font-size:14px;line-height:1.65;margin:0 0 22px}
    .warning{background:#fff8e1;border:1px solid #ffe082;border-radius:12px;padding:16px 18px;margin:0 0 24px}
    .warning p{color:#795548;font-size:13px;line-height:1.6;margin:0}
    .reasons{list-style:none;margin:0 0 20px}
    .reasons li{margin-bottom:10px}
    .reasons label{display:flex;align-items:flex-start;gap:12px;cursor:pointer;color:#444;font-size:14px;line-height:1.5}
    .reasons input[type=checkbox]{width:17px;height:17px;flex-shrink:0;margin-top:2px;accent-color:#2d6a4f;cursor:pointer}
    textarea{width:100%;border:1px solid #ddd;border-radius:10px;padding:12px 14px;font-size:14px;font-family:Arial,sans-serif;color:#444;resize:vertical;min-height:80px;outline:none;transition:border .2s}
    textarea:focus{border-color:#2d6a4f}
    .actions{display:flex;gap:12px;margin-top:24px;flex-wrap:wrap}
    .btn-unsub{flex:1;min-width:160px;background:#c62828;color:#fff;border:none;padding:13px 20px;border-radius:10px;font-size:14px;font-weight:bold;cursor:pointer;transition:background .2s}
    .btn-unsub:hover{background:#b71c1c}
    .btn-keep{flex:1;min-width:160px;background:#f5f5f5;color:#444;border:1px solid #ddd;padding:13px 20px;border-radius:10px;font-size:14px;font-weight:bold;cursor:pointer;text-decoration:none;text-align:center;display:inline-flex;align-items:center;justify-content:center;transition:background .2s}
    .btn-keep:hover{background:#e8f5e9;border-color:#2d6a4f;color:#1a3d2b}
    .success-icon{font-size:56px;display:block;text-align:center;margin-bottom:20px}
    .footer-note{color:#bbb;font-size:11px;text-align:center;margin-top:20px;line-height:1.6}
    .optional-label{font-size:12px;color:#aaa;margin:0 0 8px;display:block}
  </style>
</head>
<body>
  <div class="header">
    <h1>SUSRUTA HOSPITAL</h1>
    <p>Authentic Ayurvedic Healthcare · Tirupati</p>
  </div>
  <div class="card">
    ${html}
  </div>
  <p class="footer-note">119, Ramulavari North Mada Street, Tirupati - 517 507 · +91 9492068180</p>
</body>
</html>`);
}

// ── Public: GET — Show feedback form ──────────────────────────
// GET /api/subscribers/unsubscribe?email=xxx&token=xxx
router.get("/unsubscribe", async (req, res) => {
  const email = (req.query.email as string | undefined)?.toLowerCase().trim();
  const token = req.query.token as string | undefined;

  if (!email || !token) {
    renderPage(res, `<span class="icon">⚠️</span>
      <h2>Invalid Link</h2>
      <p class="sub">This unsubscribe link is missing required information. Please use the link directly from the email you received.</p>
      <a class="btn-keep" href="https://susrutahospital.com">Back to Website</a>`);
    return;
  }

  if (!verifyUnsubscribeToken(email, token)) {
    renderPage(res, `<span class="icon">⚠️</span>
      <h2>Invalid Link</h2>
      <p class="sub">This unsubscribe link appears to be invalid or has been altered. Please use the original link from your email.</p>
      <a class="btn-keep" href="https://susrutahospital.com">Back to Website</a>`);
    return;
  }

  const [sub] = await db.select().from(subscribersTable).where(eq(subscribersTable.email, email));

  if (!sub || sub.unsubscribed) {
    renderPage(res, `<span class="icon">✅</span>
      <h2>Already Unsubscribed</h2>
      <p class="sub">This email address is no longer on our list. You will not receive any further emails from Susruta Hospital.</p>
      <a class="btn-keep" href="https://susrutahospital.com">Back to Website</a>`);
    return;
  }

  const formAction = `/api/subscribers/unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;

  renderPage(res, `
    <span class="icon">💚</span>
    <h2>We're sorry to see you go, ${sub.name.split(" ")[0]}</h2>
    <p class="sub">Before you leave, please know what unsubscribing means for you:</p>

    <div class="warning">
      <p>
        <strong>By unsubscribing, you will no longer receive:</strong><br>
        &nbsp;· Health tips and Ayurvedic wellness updates from Dr. P. Murali Krishna<br>
        &nbsp;· Announcements about new treatments, services, and clinic hours<br>
        &nbsp;· Early access notifications for our online patient portal and appointment booking<br>
        &nbsp;· Seasonal health advice curated specifically for your wellbeing<br><br>
        Your medical care at Susruta Hospital is completely unaffected — this only removes you from our newsletter list.
      </p>
    </div>

    <form method="POST" action="${formAction}">
      <p class="sub" style="margin-bottom:14px;font-weight:600;color:#444;">Would you mind telling us why? <span style="font-weight:400;color:#aaa;">(optional)</span></p>
      <ul class="reasons">
        <li><label><input type="checkbox" name="reason" value="too_many_emails"> I receive too many emails</label></li>
        <li><label><input type="checkbox" name="reason" value="not_relevant"> The content is not relevant to me</label></li>
        <li><label><input type="checkbox" name="reason" value="did_not_subscribe"> I did not subscribe to this list</label></li>
        <li><label><input type="checkbox" name="reason" value="different_email"> I prefer to use a different email address</label></li>
        <li><label><input type="checkbox" name="reason" value="not_interested"> I am no longer interested in Ayurvedic healthcare</label></li>
        <li><label><input type="checkbox" name="reason" value="moving"> I am moving to a different location</label></li>
      </ul>
      <span class="optional-label">Any other comments? (optional)</span>
      <textarea name="other" placeholder="Tell us anything that could help us improve..."></textarea>
      <div class="actions">
        <button type="submit" class="btn-unsub">Confirm Unsubscribe</button>
        <a class="btn-keep" href="https://susrutahospital.com">Keep my subscription</a>
      </div>
    </form>`);
});

// ── Public: POST — Process unsubscribe form ───────────────────
router.post("/unsubscribe", async (req, res) => {
  const email = (req.query.email as string | undefined)?.toLowerCase().trim();
  const token = req.query.token as string | undefined;

  if (!email || !token || !verifyUnsubscribeToken(email, token)) {
    renderPage(res, `<span class="icon">⚠️</span>
      <h2>Invalid Request</h2>
      <p class="sub">This unsubscribe link is invalid. Please use the original link from your email.</p>
      <a class="btn-keep" href="https://susrutahospital.com">Back to Website</a>`);
    return;
  }

  const [sub] = await db.select().from(subscribersTable).where(eq(subscribersTable.email, email));

  if (!sub) {
    renderPage(res, `<span class="icon">✅</span>
      <h2>Already Unsubscribed</h2>
      <p class="sub">This email address is not on our list — you may have already unsubscribed.</p>
      <a class="btn-keep" href="https://susrutahospital.com">Back to Website</a>`);
    return;
  }

  // Collect reasons (may be single string or array)
  const rawReasons = req.body.reason;
  const reasons: string[] = rawReasons
    ? Array.isArray(rawReasons) ? rawReasons : [rawReasons]
    : [];
  const other = (req.body.other as string | undefined)?.trim() || "";
  const reasonText = [...reasons, ...(other ? [`Other: ${other}`] : [])].join("; ") || null;

  // Soft-delete: mark unsubscribed, keep row for audit + suppression
  await db
    .update(subscribersTable)
    .set({ unsubscribed: true, unsubscribedAt: new Date(), unsubscribeReason: reasonText })
    .where(eq(subscribersTable.id, sub.id));

  const firstName = sub.name.split(" ")[0];
  renderPage(res, `
    <span class="success-icon">🌿</span>
    <h2 style="text-align:center;">You've been unsubscribed</h2>
    <p class="sub" style="text-align:center;margin-bottom:20px;">
      <strong>${firstName}</strong>, you have been successfully removed from the Susruta Hospital updates list.<br><br>
      You will <strong>not receive any further emails</strong> from us. If this was a mistake, you are always welcome to re-subscribe on our website.
    </p>
    ${reasonText ? `<div style="background:#f9f9f9;border-radius:10px;padding:14px 16px;margin-bottom:20px;"><p style="color:#aaa;font-size:12px;margin:0;">Thank you for your feedback — we appreciate you taking the time to let us know.</p></div>` : ""}
    <div style="text-align:center;">
      <a class="btn-keep" href="https://susrutahospital.com" style="display:inline-flex;max-width:220px;">Visit Susruta Hospital</a>
    </div>`);
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

  const subs = await db
    .select()
    .from(subscribersTable)
    .where(ne(subscribersTable.unsubscribed, true))
    .orderBy(desc(subscribersTable.subscribedAt));
  if (subs.length === 0) {
    res.status(400).json({ error: "no_subscribers", message: "No active subscribers to send to." });
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
