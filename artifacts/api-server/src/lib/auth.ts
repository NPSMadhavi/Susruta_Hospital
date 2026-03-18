import { Request, Response, NextFunction } from "express";
import { db, adminSessionsTable } from "@workspace/db";
import { eq, gt } from "drizzle-orm";
import crypto from "crypto";

export async function createAdminSession(): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(adminSessionsTable).values({ sessionToken: token, expiresAt });
  return token;
}

export async function verifyAdminSession(token: string): Promise<boolean> {
  if (!token) return false;
  const now = new Date();
  const sessions = await db
    .select()
    .from(adminSessionsTable)
    .where(eq(adminSessionsTable.sessionToken, token));
  if (sessions.length === 0) return false;
  return sessions[0].expiresAt > now;
}

export async function deleteAdminSession(token: string): Promise<void> {
  await db.delete(adminSessionsTable).where(eq(adminSessionsTable.sessionToken, token));
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.admin_session || req.headers.authorization?.replace("Bearer ", "");
  const valid = await verifyAdminSession(token);
  if (!valid) {
    res.status(401).json({ error: "unauthorized", message: "Admin access required" });
    return;
  }
  next();
}
