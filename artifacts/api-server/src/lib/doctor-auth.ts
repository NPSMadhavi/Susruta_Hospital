import { Request, Response, NextFunction } from "express";
import { db, doctorSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function verifyDoctorSession(token: string): Promise<boolean> {
  if (!token) return false;
  const [session] = await db.select().from(doctorSessionsTable).where(eq(doctorSessionsTable.sessionToken, token));
  if (!session) return false;
  return session.expiresAt > new Date();
}

export async function requireDoctor(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = (req as any).cookies?.doctor_session;
  if (!token) { res.status(401).json({ error: "unauthorized" }); return; }
  const valid = await verifyDoctorSession(token);
  if (!valid) { res.status(401).json({ error: "unauthorized" }); return; }
  next();
}
