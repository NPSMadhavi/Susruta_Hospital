import { Router, type Request, type Response } from "express";
import { db, pool, websiteVisitorsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// Regular expression to validate anonymous visitor UUID / identifier format
const VISITOR_ID_REGEX = /^[a-zA-Z0-9_-]{10,128}$/;

// Common automated crawlers to exclude from visitor tracking
const BOT_USER_AGENT_REGEX =
  /Googlebot|bingbot|Baiduspider|YandexBot|DuckDuckBot|Slurp|facebookexternalhit|Twitterbot|SemrushBot|AhrefsBot|DotBot|MJ12bot/i;

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
 * POST /api/visitors/track
 * Tracks a visitor landing or navigating to a page.
 * Upserts the record to ensure unique visitors are deduplicated.
 */
router.post("/track", async (req: Request, res: Response) => {
  try {
    if (isBotRequest(req)) {
      res.json({ success: true, ignored: true });
      return;
    }

    const { visitorId, page } = req.body || {};

    if (!isValidVisitorId(visitorId)) {
      res.status(400).json({ error: "invalid_visitor_id", message: "A valid visitorId is required." });
      return;
    }

    const cleanVisitorId = visitorId.trim();
    const cleanPage = sanitizePage(page);

    await db
      .insert(websiteVisitorsTable)
      .values({
        visitorId: cleanVisitorId,
        lastPage: cleanPage,
        firstSeen: sql`NOW()`,
        lastSeen: sql`NOW()`,
        createdAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .onConflictDoUpdate({
        target: websiteVisitorsTable.visitorId,
        set: {
          lastSeen: sql`NOW()`,
          lastPage: cleanPage,
          updatedAt: sql`NOW()`,
        },
      });

    res.json({ success: true });
  } catch (err: any) {
    console.error("⚠️ [VisitorTrack] Error tracking visitor:", err.message);
    res.status(500).json({ error: "tracking_failed" });
  }
});

/**
 * POST /api/visitors/heartbeat
 * Periodic heartbeat (~30s) while website is active in user's browser.
 * Updates last_seen timestamp and current page.
 */
router.post("/heartbeat", async (req: Request, res: Response) => {
  try {
    if (isBotRequest(req)) {
      res.json({ success: true, ignored: true });
      return;
    }

    const { visitorId, page } = req.body || {};

    if (!isValidVisitorId(visitorId)) {
      res.status(400).json({ error: "invalid_visitor_id", message: "A valid visitorId is required." });
      return;
    }

    const cleanVisitorId = visitorId.trim();
    const cleanPage = sanitizePage(page);

    await db
      .insert(websiteVisitorsTable)
      .values({
        visitorId: cleanVisitorId,
        lastPage: cleanPage,
        firstSeen: sql`NOW()`,
        lastSeen: sql`NOW()`,
        createdAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .onConflictDoUpdate({
        target: websiteVisitorsTable.visitorId,
        set: {
          lastSeen: sql`NOW()`,
          lastPage: cleanPage,
          updatedAt: sql`NOW()`,
        },
      });

    res.json({ success: true });
  } catch (err: any) {
    console.error("⚠️ [VisitorHeartbeat] Error updating heartbeat:", err.message);
    res.status(500).json({ error: "heartbeat_failed" });
  }
});

/**
 * GET /api/visitors/public-stats
 * Returns safe aggregate metrics for the public footer counter.
 * Only returns total unique visitors and today's visitors in IST.
 */
router.get("/public-stats", async (_req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        COUNT(id)::int AS "totalUniqueVisitors",
        COUNT(CASE WHEN last_seen >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata') THEN 1 END)::int AS "todayVisitors"
      FROM website_visitors;
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
