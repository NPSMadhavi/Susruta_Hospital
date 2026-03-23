import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db, subscribersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { sendSubscriptionConfirmation, sendBroadcastEmail } from "../lib/email";
import { z } from "zod/v4";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const SubscribeBody = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(6).max(20),
  email: z.string().email(),
  country: z.string().max(100).optional(),
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

// ── Admin: Broadcast to all subscribers ──────────────────────
router.post("/broadcast", requireAdmin, async (req, res) => {
  const { subject, bodyHtml } = req.body;
  if (!subject?.trim() || !bodyHtml?.trim()) {
    res.status(400).json({ error: "missing_fields", message: "Subject and message body are required." });
    return;
  }

  const subs = await db.select().from(subscribersTable).orderBy(desc(subscribersTable.subscribedAt));
  if (subs.length === 0) {
    res.status(400).json({ error: "no_subscribers", message: "No subscribers to send to." });
    return;
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const s of subs) {
    try {
      await sendBroadcastEmail({ to: s.email, name: s.name, subject, bodyHtml });
      sent++;
    } catch (err: any) {
      failed++;
      errors.push(`${s.email}: ${err.message}`);
    }
  }

  res.json({ sent, failed, total: subs.length, errors: errors.slice(0, 10) });
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
