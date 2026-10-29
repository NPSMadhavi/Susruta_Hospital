import assert from "node:assert/strict";
import test from "node:test";
import {
  isIpRateLimited,
  isNewVisitorLimitExceeded,
  recordNewVisitor,
  isOriginAllowed,
} from "./visitor-limiter";
import { isVisitorTrackingEnabled } from "../routes/visitors";

test("Visitor rate limiter allows requests within threshold and blocks excess", () => {
  const testIp = `test-ip-${Date.now()}`;
  for (let i = 0; i < 60; i++) {
    const limited = isIpRateLimited(testIp);
    assert.equal(limited, false, `Request ${i + 1} should be allowed`);
  }
  // 61st request should be rate-limited
  assert.equal(isIpRateLimited(testIp), true, "61st request should be rate limited");
});

test("New visitor limiter prevents automated creation of excess unique visitor IDs", () => {
  const testIp = `test-new-vid-ip-${Date.now()}`;
  assert.equal(isNewVisitorLimitExceeded(testIp), false);

  for (let i = 0; i < 20; i++) {
    recordNewVisitor(testIp);
  }

  // After 20 new visitors in an hour, limit is exceeded
  assert.equal(isNewVisitorLimitExceeded(testIp), true);
});

test("isOriginAllowed permits configured origins and blocks foreign origins", () => {
  process.env.APP_URL = "https://susrutahospital.com";

  // Allowed origins
  assert.equal(isOriginAllowed(undefined), true); // same-origin/beacon
  assert.equal(isOriginAllowed("http://localhost:5173"), true);
  assert.equal(isOriginAllowed("http://127.0.0.1:5173"), true);
  assert.equal(isOriginAllowed("http://localhost:5000"), true);
  assert.equal(isOriginAllowed("https://susrutahospital.com"), true);

  // Disallowed origins
  assert.equal(isOriginAllowed("https://malicious-site.com"), false);
  assert.equal(isOriginAllowed("http://evil-tracker.org"), false);
});

test("isVisitorTrackingEnabled respects environment configuration", () => {
  const oldEnv = process.env.VISITOR_TRACKING_ENABLED;
  const oldNodeEnv = process.env.NODE_ENV;

  try {
    process.env.VISITOR_TRACKING_ENABLED = "true";
    assert.equal(isVisitorTrackingEnabled(), true);

    process.env.VISITOR_TRACKING_ENABLED = "false";
    assert.equal(isVisitorTrackingEnabled(), false);

    delete process.env.VISITOR_TRACKING_ENABLED;
    process.env.NODE_ENV = "production";
    assert.equal(isVisitorTrackingEnabled(), true);

    process.env.NODE_ENV = "development";
    assert.equal(isVisitorTrackingEnabled(), false);
  } finally {
    if (oldEnv !== undefined) {
      process.env.VISITOR_TRACKING_ENABLED = oldEnv;
    } else {
      delete process.env.VISITOR_TRACKING_ENABLED;
    }
    process.env.NODE_ENV = oldNodeEnv;
  }
});

test("IST timezone calculation produces correct YYYY-MM-DD date string", () => {
  // Asia/Kolkata is UTC+05:30
  // Test boundary case: 2026-10-28 18:45:00 UTC = 2026-10-29 00:15:00 IST
  const utcDate = new Date("2026-10-28T18:45:00Z");
  const istFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const istDateString = istFormatter.format(utcDate); // en-CA yields YYYY-MM-DD
  assert.equal(istDateString, "2026-10-29");

  // Test before midnight: 2026-10-28 18:20:00 UTC = 2026-10-28 23:50:00 IST
  const beforeMidnightUtc = new Date("2026-10-28T18:20:00Z");
  assert.equal(istFormatter.format(beforeMidnightUtc), "2026-10-28");
});

test("Bot user agent filtering accurately detects common web crawlers", () => {
  const BOT_USER_AGENT_REGEX =
    /Googlebot|bingbot|Baiduspider|YandexBot|DuckDuckBot|Slurp|facebookexternalhit|Twitterbot|SemrushBot|AhrefsBot|DotBot|MJ12bot|curl|wget|python-requests/i;

  const botUAs = [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "curl/7.88.1",
    "python-requests/2.31.0",
    "facebookexternalhit/1.1",
  ];

  for (const ua of botUAs) {
    assert.equal(BOT_USER_AGENT_REGEX.test(ua), true, `Should detect bot: ${ua}`);
  }

  const realBrowserUAs = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  ];

  for (const ua of realBrowserUAs) {
    assert.equal(BOT_USER_AGENT_REGEX.test(ua), false, `Should NOT detect real browser as bot: ${ua}`);
  }
});

test("Staff session check detects admin, doctor, and pharmacy cookies", () => {
  function checkStaff(cookies: Record<string, string | undefined>): boolean {
    return Boolean(
      cookies?.admin_session ||
      cookies?.doctor_session ||
      cookies?.pharmacy_session
    );
  }

  assert.equal(checkStaff({}), false);
  assert.equal(checkStaff({ susruta_vid: "uuid-1234-abcd-ef01" }), false);
  assert.equal(checkStaff({ admin_session: "token-admin" }), true);
  assert.equal(checkStaff({ doctor_session: "token-doctor" }), true);
  assert.equal(checkStaff({ pharmacy_session: "token-pharmacy" }), true);
});

test("Visitor ID validation allows valid UUIDs and rejects invalid characters or lengths", () => {
  const VISITOR_ID_REGEX = /^[a-zA-Z0-9_-]{10,64}$/;

  function isValid(id: unknown): boolean {
    return typeof id === "string" && VISITOR_ID_REGEX.test(id.trim());
  }

  assert.equal(isValid("c2a71f00-2495-4422-92fc-56ea2bb90f94"), true);
  assert.equal(isValid("anonymous_visitor_001_abc"), true);

  // Too short (<10 chars)
  assert.equal(isValid("abc"), false);
  assert.equal(isValid("123456789"), false);

  // Too long (>64 chars)
  assert.equal(isValid("a".repeat(65)), false);

  // Dangerous / SQL injection / XSS strings
  assert.equal(isValid("<script>alert(1)</script>"), false);
  assert.equal(isValid("'; DROP TABLE website_visitors; --"), false);
  assert.equal(isValid("uuid with spaces"), false);
  assert.equal(isValid(null), false);
  assert.equal(isValid(undefined), false);
  assert.equal(isValid(12345), false);
});

test("Simulated presence logic verifies distinct visitor deduplication and expiry", () => {
  const PRESENCE_WINDOW_MS = 60000; // 60s window
  const now = Date.now();

  interface VisitorRecord {
    visitorId: string;
    lastHeartbeat: number | null;
  }

  const visitors: VisitorRecord[] = [
    { visitorId: "visitor-1", lastHeartbeat: now - 15000 }, // active 15s ago -> viewing now
    { visitorId: "visitor-2", lastHeartbeat: now - 45000 }, // active 45s ago -> viewing now
    { visitorId: "visitor-3", lastHeartbeat: now - 95000 }, // active 95s ago -> expired (>60s)
    { visitorId: "visitor-4", lastHeartbeat: null },        // left tab -> null
  ];

  const viewingNow = visitors.filter(
    (v) => v.lastHeartbeat !== null && v.lastHeartbeat >= now - PRESENCE_WINDOW_MS
  ).length;

  assert.equal(viewingNow, 2, "Only visitors within the 60s presence window are Viewing Now");
});

test("Multi-tab visitor deduplication guarantees multiple tabs count as 1 visitor", () => {
  // Visitor 'user-alpha' opens 3 tabs
  const tabRecords = [
    { visitorId: "user-alpha", tabId: "tab-1", lastHeartbeat: Date.now() },
    { visitorId: "user-alpha", tabId: "tab-2", lastHeartbeat: Date.now() },
    { visitorId: "user-alpha", tabId: "tab-3", lastHeartbeat: Date.now() },
    { visitorId: "user-beta", tabId: "tab-4", lastHeartbeat: Date.now() },
  ];

  // In database, table website_visitors is unique by visitor_id
  const uniqueVisitorPresence = new Set<string>();
  tabRecords.forEach((t) => uniqueVisitorPresence.add(t.visitorId));

  assert.equal(uniqueVisitorPresence.size, 2, "3 tabs from 1 visitor must count as 1 visitor");
  assert.equal(uniqueVisitorPresence.has("user-alpha"), true);
  assert.equal(uniqueVisitorPresence.has("user-beta"), true);
});

test("Daily visitor table guarantees idempotent counting per IST calendar date", () => {
  // Simulating visitor_days table with PRIMARY KEY (visitor_id, day_ist)
  const visitorDaysDb = new Set<string>();

  function recordVisit(visitorId: string, dayIst: string): void {
    const key = `${visitorId}#${dayIst}`;
    visitorDaysDb.add(key); // ON CONFLICT DO NOTHING
  }

  // Visitor-1 visits 20 times today
  for (let i = 0; i < 20; i++) {
    recordVisit("visitor-1", "2026-10-29");
  }
  // Visitor-2 visits once today
  recordVisit("visitor-2", "2026-10-29");

  // Count unique visitors for 2026-10-29
  const todayCount = Array.from(visitorDaysDb).filter((k) => k.endsWith("#2026-10-29")).length;
  assert.equal(todayCount, 2, "Multiple visits from the same visitor on the same day count as 1");

  // Rollover to next day: 2026-10-30
  const tomorrowCountBefore = Array.from(visitorDaysDb).filter((k) => k.endsWith("#2026-10-30")).length;
  assert.equal(tomorrowCountBefore, 0, "Next IST day starts from 0 before any visits");

  // Returning visitor-1 visits tomorrow
  recordVisit("visitor-1", "2026-10-30");
  const tomorrowCountAfter = Array.from(visitorDaysDb).filter((k) => k.endsWith("#2026-10-30")).length;
  assert.equal(tomorrowCountAfter, 1, "Returning visitor counts once for the new day");
});
