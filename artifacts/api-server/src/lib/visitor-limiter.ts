import type { Request } from "express";

/**
 * In-memory rate limiting and protection utilities for public visitor analytics endpoints.
 */

interface RateBucket {
  count: number;
  resetAt: number;
}

// Map IP -> rate bucket for overall visitor tracking requests
const ipRequestBuckets = new Map<string, RateBucket>();

// Map IP -> rate bucket for newly created visitor registrations
const ipNewVisitorBuckets = new Map<string, RateBucket>();

const MAX_REQUESTS_PER_MINUTE = 60;
const MAX_NEW_VISITORS_PER_HOUR = 20;

const ONE_MINUTE_MS = 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Extracts a normalized client IP from Express request, respecting trust proxy.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "127.0.0.1";
}

/**
 * Rate limit general analytics requests (track, heartbeat, leave) per IP.
 * Returns true if request is allowed, false if limit exceeded.
 */
export function isIpRateLimited(ip: string): boolean {
  const now = Date.now();
  let bucket = ipRequestBuckets.get(ip);

  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 1, resetAt: now + ONE_MINUTE_MS };
    ipRequestBuckets.set(ip, bucket);
    return false;
  }

  bucket.count++;
  return bucket.count > MAX_REQUESTS_PER_MINUTE;
}

/**
 * Checks if an IP has exceeded the allowed number of NEW visitor IDs created per hour.
 * Prevents malicious inflation of Total Unique Visitors.
 * Returns true if limit exceeded, false if allowed.
 */
export function isNewVisitorLimitExceeded(ip: string): boolean {
  const now = Date.now();
  const bucket = ipNewVisitorBuckets.get(ip);

  if (!bucket || now > bucket.resetAt) {
    return false;
  }

  return bucket.count >= MAX_NEW_VISITORS_PER_HOUR;
}

/**
 * Records that a new visitor ID was successfully registered from this IP.
 */
export function recordNewVisitor(ip: string): void {
  const now = Date.now();
  let bucket = ipNewVisitorBuckets.get(ip);

  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 1, resetAt: now + ONE_HOUR_MS };
    ipNewVisitorBuckets.set(ip, bucket);
    return;
  }

  bucket.count++;
}

/**
 * Periodic cleanup of stale rate-limit buckets to avoid memory leaks.
 */
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of ipRequestBuckets.entries()) {
    if (now > bucket.resetAt) {
      ipRequestBuckets.delete(ip);
    }
  }
  for (const [ip, bucket] of ipNewVisitorBuckets.entries()) {
    if (now > bucket.resetAt) {
      ipNewVisitorBuckets.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

/**
 * Validates request Origin header to ensure tracking requests only originate
 * from legitimate application origins or same-origin requests.
 */
export function isOriginAllowed(originHeader: string | undefined): boolean {
  // Requests without Origin (e.g. same-origin GET, sendBeacon on same-origin, curl) are allowed
  if (!originHeader) return true;

  const appUrl = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, "") : "";
  const allowedOrigins = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
  ]);

  if (appUrl) {
    allowedOrigins.add(appUrl);
  }

  try {
    const parsed = new URL(originHeader);
    const originBase = `${parsed.protocol}//${parsed.host}`;
    if (allowedOrigins.has(originBase) || allowedOrigins.has(originHeader)) {
      return true;
    }
    // Also allow subdomains or same hostname as APP_URL if specified
    if (appUrl) {
      const appHost = new URL(appUrl).host;
      if (parsed.host === appHost) return true;
    }
  } catch {
    return false;
  }

  return false;
}
