import { Router } from "express";
import { db, patientsTable, appointmentsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import {
  hashPassword, verifyPassword, createPatientSession,
  deletePatientSession, requirePatient,
} from "../lib/patient-auth";
import { z } from "zod/v4";

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_ENABLED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

function getGoogleCallbackUrl(req: any) {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (domain) return `https://${domain}/api/patient/auth/google/callback`;
  const proto = req.protocol;
  const host = req.get("host");
  return `${proto}://${host}/api/patient/auth/google/callback`;
}

function getFrontendUrl(req: any) {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (domain) return `https://${domain}`;
  return `${req.protocol}://${req.get("host")}`;
}

// ── Google OAuth — redirect to Google ─────────────────────────
router.get("/auth/google", (req, res) => {
  if (!GOOGLE_ENABLED) {
    res.status(503).send("Google login is not configured");
    return;
  }
  const callbackUrl = getGoogleCallbackUrl(req);
  const next = (req.query.next as string) || "/portal/dashboard";
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID!,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state: Buffer.from(JSON.stringify({ next })).toString("base64"),
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// ── Google OAuth — callback ────────────────────────────────────
router.get("/auth/google/callback", async (req, res) => {
  const frontendUrl = getFrontendUrl(req);

  // Decode state for next URL
  let nextPath = "/portal/dashboard";
  try {
    const raw = req.query.state as string;
    if (raw) {
      const decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
      if (decoded.next && typeof decoded.next === "string" && decoded.next.startsWith("/")) {
        nextPath = decoded.next;
      }
    }
  } catch { /* ignore */ }

  if (!GOOGLE_ENABLED) {
    res.redirect(`${frontendUrl}/portal?error=google_not_configured`);
    return;
  }
  const code = req.query.code as string | undefined;
  if (!code) {
    res.redirect(`${frontendUrl}/portal?error=google_denied`);
    return;
  }
  try {
    const callbackUrl = getGoogleCallbackUrl(req);
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json() as any;
    if (!tokens.access_token) throw new Error("No access token");

    // Get user info
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await userRes.json() as any;
    if (!profile.email) throw new Error("No email from Google");

    // Find or create patient
    let [patient] = await db.select().from(patientsTable).where(eq(patientsTable.email, profile.email));
    if (!patient) {
      [patient] = await db.insert(patientsTable).values({
        name: profile.name || profile.email.split("@")[0],
        email: profile.email,
        googleId: profile.id,
        avatarUrl: profile.picture ?? null,
        phone: null,
        passwordHash: null,
      }).returning();
    } else if (!patient.googleId) {
      [patient] = await db.update(patientsTable)
        .set({ googleId: profile.id, avatarUrl: profile.picture ?? patient.avatarUrl })
        .where(eq(patientsTable.id, patient.id))
        .returning();
    }

    const token = await createPatientSession(patient.id);
    res.cookie("patient_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.redirect(`${frontendUrl}${nextPath}`);
  } catch (err) {
    console.error("Google OAuth error:", err);
    res.redirect(`${frontendUrl}/portal?error=google_failed`);
  }
});

const RegisterBody = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function cookieOpts() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
}

function serializePatient(p: any) {
  return { id: p.id, name: p.name, email: p.email, phone: p.phone, avatarUrl: p.avatarUrl, createdAt: p.createdAt };
}

// ── Register ───────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: "Invalid input" });
    return;
  }
  const { name, email, phone, password } = parsed.data;
  const [existing] = await db.select().from(patientsTable).where(eq(patientsTable.email, email));
  if (existing) {
    res.status(409).json({ error: "email_exists", message: "An account with this email already exists" });
    return;
  }
  const passwordHash = await hashPassword(password);
  const [patient] = await db.insert(patientsTable).values({ name, email, phone: phone ?? null, passwordHash }).returning();
  const token = await createPatientSession(patient.id);
  res.cookie("patient_session", token, cookieOpts());
  res.status(201).json(serializePatient(patient));
});

// ── Login ──────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: "Invalid input" });
    return;
  }
  const { email, password } = parsed.data;
  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.email, email));
  if (!patient || !patient.passwordHash) {
    res.status(401).json({ error: "invalid_credentials", message: "Incorrect email or password" });
    return;
  }
  const valid = await verifyPassword(password, patient.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "invalid_credentials", message: "Incorrect email or password" });
    return;
  }
  const token = await createPatientSession(patient.id);
  res.cookie("patient_session", token, cookieOpts());
  res.json(serializePatient(patient));
});

// ── Logout ─────────────────────────────────────────────────────
router.post("/logout", async (req, res) => {
  const token = req.cookies?.patient_session;
  if (token) await deletePatientSession(token);
  res.clearCookie("patient_session");
  res.json({ success: true });
});

// ── Me ─────────────────────────────────────────────────────────
router.get("/me", requirePatient, (req, res) => {
  res.json(serializePatient((req as any).patient));
});

// ── My Appointments ───────────────────────────────────────────
router.get("/appointments", requirePatient, async (req, res) => {
  const patient = (req as any).patient;
  const appts = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.patientId, patient.id))
    .orderBy(desc(appointmentsTable.date));
  res.json(appts.map((a) => ({ ...a, createdAt: a.createdAt?.toISOString() ?? null, arrivedAt: a.arrivedAt?.toISOString() ?? null })));
});

// ── Book Appointment ──────────────────────────────────────────
const BookBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeSlot: z.string(),
  reason: z.string().optional(),
  patientName: z.string().min(1),
  patientPhone: z.string().min(6),
});

router.post("/appointments", requirePatient, async (req, res) => {
  const patient = (req as any).patient;
  const parsed = BookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: "Invalid input" });
    return;
  }
  const { date, timeSlot, reason, patientName, patientPhone } = parsed.data;

  const existing = await db.select().from(appointmentsTable).where(
    and(eq(appointmentsTable.date, date), eq(appointmentsTable.timeSlot, timeSlot), eq(appointmentsTable.status, "confirmed"))
  );
  if (existing.length > 0) {
    res.status(409).json({ error: "slot_unavailable", message: "This time slot is already taken" });
    return;
  }

  const [appt] = await db.insert(appointmentsTable).values({
    patientId: patient.id,
    patientName,
    patientPhone,
    patientEmail: patient.email,
    date,
    timeSlot,
    reason: reason ?? null,
    status: "pending",
  }).returning();

  res.status(201).json({ ...appt, createdAt: appt.createdAt?.toISOString() ?? null });
});

// ── Confirm Follow-up ─────────────────────────────────────────
router.patch("/appointments/:id/confirm-followup", requirePatient, async (req, res) => {
  const patient = (req as any).patient;
  const id = parseInt(req.params.id);
  const [appt] = await db.select().from(appointmentsTable).where(
    and(eq(appointmentsTable.id, id), eq(appointmentsTable.patientId, patient.id))
  );
  if (!appt) { res.status(404).json({ error: "not_found" }); return; }

  const [updated] = await db.update(appointmentsTable)
    .set({ followUpConfirmed: true })
    .where(eq(appointmentsTable.id, id))
    .returning();
  res.json({ ...updated, createdAt: updated.createdAt?.toISOString() ?? null });
});

// ── Choose Reschedule Date ────────────────────────────────────
router.patch("/appointments/:id/choose-reschedule", requirePatient, async (req, res) => {
  const patient = (req as any).patient;
  const id = parseInt(req.params.id);
  const { chosenDate } = req.body;
  if (!chosenDate) { res.status(400).json({ error: "missing_date" }); return; }

  const [appt] = await db.select().from(appointmentsTable).where(
    and(eq(appointmentsTable.id, id), eq(appointmentsTable.patientId, patient.id))
  );
  if (!appt || appt.status !== "reschedule_proposed") {
    res.status(400).json({ error: "invalid_state" }); return;
  }
  const dates: string[] = JSON.parse(appt.rescheduleDates ?? "[]");
  if (!dates.includes(chosenDate)) {
    res.status(400).json({ error: "invalid_date" }); return;
  }

  const [updated] = await db.update(appointmentsTable)
    .set({ rescheduleChosen: chosenDate, status: "reschedule_accepted" })
    .where(eq(appointmentsTable.id, id))
    .returning();
  res.json({ ...updated, createdAt: updated.createdAt?.toISOString() ?? null });
});

export default router;
