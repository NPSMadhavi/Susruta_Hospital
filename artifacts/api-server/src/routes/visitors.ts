import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { pool } from "@workspace/db";
import {
  getClientIp,
  isIpRateLimited,
  isNewVisitorLimitExceeded,
  recordNewVisitor,
  isOriginAllowed,
} from "../lib/visitor-limiter";

const router = Router();

const COOKIE_NAME = "susruta_vid";
const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

// Regular expression to validate anonymous visitor UUID / identifier format
const VISITOR_ID_REGEX = /^[a-zA-Z0-9_-]{10,64}$/;

// Automated crawlers to exclude from visitor tracking
const BOT_USER_AGENT_REGEX =
  /Googlebot|bingbot|Baiduspider|YandexBot|DuckDuckBot|Slurp|facebookexternalhit|Twitterbot|SemrushBot|AhrefsBot|DotBot|MJ12bot|curl|wget|python-requests/i;

function isValidVisitorId(id: unknown): id is string {
  return typeof id === "string" && VISITOR_ID_REGEX.test(id.trim());
}

function sanitizePage(page: unknown): string {
  if (typeof page !== "string" || !page.trim()) return "/";
  return page.trim().slice(0, 500);
}

function isBotRequest(req: Request): boolean {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" && BOT_USER_AGENT_REGEX.test(ua);
}

/**
 * Checks if request comes from an authenticated staff member (Admin, Doctor, Pharmacy).
 * Staff browsing the website should never pollute public visitor statistics.
 */
function isStaffSession(req: Request): boolean {
  return Boolean(
    req.cookies?.admin_session ||
    req.cookies?.doctor_session ||
    req.cookies?.pharmacy_session
  );
}

/**
 * Determines whether visitor tracking is enabled in this environment.
 * Default: enabled in production, disabled in local development to avoid polluting the DB.
 */
export function isVisitorTrackingEnabled(): boolean {
  if (process.env.VISITOR_TRACKING_ENABLED !== undefined) {
    return process.env.VISITOR_TRACKING_ENABLED === "true";
  }
  return process.env.NODE_ENV === "production";
}

/**
 * Helper to resolve visitor ID from cookie or payload, or generate a fresh one.
 */
function resolveVisitorId(req: Request): string {
  const cookieVid = req.cookies?.[COOKIE_NAME];
  if (isValidVisitorId(cookieVid)) {
    return cookieVid.trim();
  }
  const bodyVid = req.body?.visitorId;
  if (isValidVisitorId(bodyVid)) {
    return bodyVid.trim();
  }
  return crypto.randomUUID();
}

/**
 * Sets or refreshes the first-party HttpOnly visitor ID cookie.
 */
function setVisitorCookie(res: Response, visitorId: string): void {
  res.cookie(COOKIE_NAME, visitorId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  });
}

/**
 * POST /api/visitors/track
 * Tracks a visitor landing or navigating to a public page.
 * Avoids consuming a SERIAL sequence on every visit by performing an UPDATE first.
 */
router.post("/track", async (req: Request, res: Response) => {
  try {
    if (!isVisitorTrackingEnabled()) {
      res.json({ success: true, disabled: true });
      return;
    }

    if (!isOriginAllowed(req.headers.origin)) {
      res.status(403).json({ error: "forbidden_origin" });
      return;
    }

    if (isBotRequest(req)) {
      res.json({ success: true, ignored: true, reason: "bot" });
      return;
    }

    if (isStaffSession(req)) {
      res.json({ success: true, ignored: true, reason: "staff_session" });
      return;
    }

    const ip = getClientIp(req);
    if (isIpRateLimited(ip)) {
      res.status(429).json({ error: "rate_limited", message: "Too many requests" });
      return;
    }

    const cleanVisitorId = resolveVisitorId(req);
    const cleanPage = sanitizePage(req.body?.page);

    // Exclude internal staff routes
    if (
      cleanPage.startsWith("/admin") ||
      cleanPage.startsWith("/doctor") ||
      cleanPage.startsWith("/portal")
    ) {
      res.json({ success: true, ignored: true, reason: "internal_route" });
      return;
    }

    // 1. Try to update existing visitor without advancing SERIAL sequence
    const updateRes = await pool.query(
      `
      UPDATE website_visitors
      SET last_heartbeat = NOW(),
          last_seen = NOW(),
          last_page = $2,
          updated_at = NOW()
      WHERE visitor_id = $1
      `,
      [cleanVisitorId, cleanPage]
    );

    // 2. If visitor does not exist yet, insert new record
    if (updateRes.rowCount === 0) {
      if (isNewVisitorLimitExceeded(ip)) {
        res.status(429).json({ error: "new_visitor_limit_exceeded" });
        return;
      }

      await pool.query(
        `
        INSERT INTO website_visitors (visitor_id, last_page, first_seen, last_seen, last_heartbeat, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW(), NOW(), NOW(), NOW())
        ON CONFLICT (visitor_id) DO UPDATE
        SET last_heartbeat = EXCLUDED.last_heartbeat,
            last_seen = EXCLUDED.last_seen,
            last_page = EXCLUDED.last_page,
            updated_at = EXCLUDED.updated_at
        `,
        [cleanVisitorId, cleanPage]
      );
      recordNewVisitor(ip);
    }

    // 3. Record visit in visitor_days for today in Asia/Kolkata timezone
    await pool.query(
      `
      INSERT INTO visitor_days (visitor_id, day_ist, first_seen)
      VALUES ($1, (NOW() AT TIME ZONE 'Asia/Kolkata')::date, NOW())
      ON CONFLICT (visitor_id, day_ist) DO NOTHING
      `,
      [cleanVisitorId]
    );

    setVisitorCookie(res, cleanVisitorId);
    res.json({ success: true, visitorId: cleanVisitorId });
  } catch (err: any) {
    console.error("⚠️ [VisitorTrack] Error tracking visitor:", err.message);
    res.status(500).json({ error: "tracking_failed" });
  }
});

/**
 * POST /api/visitors/heartbeat
 * Periodic heartbeat (~30s) while website tab is VISIBLE.
 * Updates last_heartbeat and last_seen.
 */
router.post("/heartbeat", async (req: Request, res: Response) => {
  try {
    if (!isVisitorTrackingEnabled()) {
      res.json({ success: true, disabled: true });
      return;
    }

    if (!isOriginAllowed(req.headers.origin)) {
      res.status(403).json({ error: "forbidden_origin" });
      return;
    }

    if (isBotRequest(req)) {
      res.json({ success: true, ignored: true, reason: "bot" });
      return;
    }

    if (isStaffSession(req)) {
      res.json({ success: true, ignored: true, reason: "staff_session" });
      return;
    }

    const ip = getClientIp(req);
    if (isIpRateLimited(ip)) {
      res.status(429).json({ error: "rate_limited" });
      return;
    }

    const cleanVisitorId = resolveVisitorId(req);
    const cleanPage = sanitizePage(req.body?.page);

    // 1. Update heartbeat timestamp
    const updateRes = await pool.query(
      `
      UPDATE website_visitors
      SET last_heartbeat = NOW(),
          last_seen = NOW(),
          last_page = $2,
          updated_at = NOW()
      WHERE visitor_id = $1
      `,
      [cleanVisitorId, cleanPage]
    );

    // If visitor row was missing, insert safely
    if (updateRes.rowCount === 0) {
      await pool.query(
        `
        INSERT INTO website_visitors (visitor_id, last_page, first_seen, last_seen, last_heartbeat, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW(), NOW(), NOW(), NOW())
        ON CONFLICT (visitor_id) DO UPDATE
        SET last_heartbeat = EXCLUDED.last_heartbeat,
            last_seen = EXCLUDED.last_seen,
            last_page = EXCLUDED.last_page,
            updated_at = EXCLUDED.updated_at
        `,
        [cleanVisitorId, cleanPage]
      );
    }

    // 2. Ensure recorded for today's IST day (e.g. if tab crossed midnight IST)
    await pool.query(
      `
      INSERT INTO visitor_days (visitor_id, day_ist, first_seen)
      VALUES ($1, (NOW() AT TIME ZONE 'Asia/Kolkata')::date, NOW())
      ON CONFLICT (visitor_id, day_ist) DO NOTHING
      `,
      [cleanVisitorId]
    );

    setVisitorCookie(res, cleanVisitorId);
    res.json({ success: true });
  } catch (err: any) {
    console.error("⚠️ [VisitorHeartbeat] Error updating heartbeat:", err.message);
    res.status(500).json({ error: "heartbeat_failed" });
  }
});

/**
 * POST /api/visitors/leave
 * Sent via navigator.sendBeacon when tab hides or unloads.
 * Immediately clears last_heartbeat so visitor disappears from "Viewing Now".
 */
router.post("/leave", async (req: Request, res: Response) => {
  try {
    if (!isVisitorTrackingEnabled()) {
      res.json({ success: true, disabled: true });
      return;
    }

    // Handle JSON or raw text body from sendBeacon
    let visitorId = req.cookies?.[COOKIE_NAME] || req.body?.visitorId;
    if (!visitorId && typeof req.body === "string") {
      try {
        const parsed = JSON.parse(req.body);
        visitorId = parsed.visitorId;
      } catch {
        // Ignore parse error
      }
    }

    if (!isValidVisitorId(visitorId)) {
      res.json({ success: true, ignored: true });
      return;
    }

    await pool.query(
      `
      UPDATE website_visitors
      SET last_heartbeat = NULL
      WHERE visitor_id = $1
      `,
      [visitorId.trim()]
    );

    res.json({ success: true });
  } catch (err: any) {
    console.error("⚠️ [VisitorLeave] Error clearing presence:", err.message);
    res.json({ success: true }); // Always 200 for beacon
  }
});

/**
 * GET /api/visitors/public-stats
 * Returns safe aggregate metrics for the public footer counter.
 * Uses identical IST date logic and visitor_days source of truth as the admin panel.
 */
router.get("/public-stats", async (_req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        (SELECT COUNT(*)::int FROM website_visitors) AS "totalUniqueVisitors",
        (SELECT COUNT(*)::int FROM visitor_days WHERE day_ist = (NOW() AT TIME ZONE 'Asia/Kolkata')::date) AS "todayVisitors";
    `;
    const result = await pool.query(query);
    const row = result.rows[0] || {};

    res.json({
      totalUniqueVisitors: Number(row.totalUniqueVisitors) || 0,
      todayVisitors: Number(row.todayVisitors) || 0,
    });
  } catch (err: any) {
    console.error("⚠️ [VisitorPublicStats] Error fetching public stats:", err.message);
    res.status(500).json({
      error: "stats_unavailable",
      totalUniqueVisitors: 0,
      todayVisitors: 0,
    });
  }
});

export default router;
