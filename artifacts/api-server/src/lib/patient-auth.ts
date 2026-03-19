import { db, patientSessionsTable, patientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import type { Request, Response, NextFunction } from "express";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createPatientSession(patientId: number): Promise<string> {
  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(patientSessionsTable).values({ sessionToken: token, patientId, expiresAt });
  return token;
}

export async function verifyPatientSession(token: string) {
  const [session] = await db
    .select({ session: patientSessionsTable, patient: patientsTable })
    .from(patientSessionsTable)
    .innerJoin(patientsTable, eq(patientSessionsTable.patientId, patientsTable.id))
    .where(eq(patientSessionsTable.sessionToken, token));

  if (!session || session.session.expiresAt < new Date()) return null;
  return session.patient;
}

export async function deletePatientSession(token: string) {
  await db.delete(patientSessionsTable).where(eq(patientSessionsTable.sessionToken, token));
}

export async function requirePatient(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.patient_session;
  if (!token) {
    res.status(401).json({ error: "unauthorized", message: "Please log in" });
    return;
  }
  const patient = await verifyPatientSession(token);
  if (!patient) {
    res.clearCookie("patient_session");
    res.status(401).json({ error: "unauthorized", message: "Session expired" });
    return;
  }
  (req as any).patient = patient;
  next();
}
