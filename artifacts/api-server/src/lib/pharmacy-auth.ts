import { Request, Response, NextFunction } from "express";
import { db, pharmacySessionsTable, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export async function createPharmacySession(): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(pharmacySessionsTable).values({ sessionToken: token, expiresAt });
  return token;
}

export async function verifyPharmacySession(token: string): Promise<boolean> {
  if (!token) return false;
  const [session] = await db.select().from(pharmacySessionsTable).where(eq(pharmacySessionsTable.sessionToken, token));
  if (!session) return false;
  return session.expiresAt > new Date();
}

export async function deletePharmacySession(token: string): Promise<void> {
  await db.delete(pharmacySessionsTable).where(eq(pharmacySessionsTable.sessionToken, token));
}

export async function requirePharmacy(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.pharmacy_session;
  const valid = await verifyPharmacySession(token);
  if (!valid) {
    res.status(401).json({ error: "unauthorized", message: "Pharmacy access required" });
    return;
  }
  next();
}
