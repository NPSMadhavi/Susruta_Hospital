import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

const COOKIE_NAME = "susruta_vid";
const COOKIE_MAX_AGE_DAYS = 365;
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Generate a cryptographically strong UUID v4, with a reliable fallback
 */
function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Reads a cookie value by name
 */
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^|;\\s*)(${name})=([^;]*)`));
  return match ? decodeURIComponent(match[3]) : null;
}

/**
 * Sets a first-party cookie with 1-year persistence and SameSite=Lax
 */
function setCookie(name: string, value: string, days: number = COOKIE_MAX_AGE_DAYS): void {
  if (typeof document === "undefined") return;
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/**
 * In-memory cache for the visitor ID within the current page runtime
 */
let cachedVisitorId: string | null = null;

/**
 * Gets the existing anonymous visitor ID or generates and persists a new one.
 */
export function getOrCreateVisitorId(): string {
  if (cachedVisitorId) return cachedVisitorId;

  let vid = getCookie(COOKIE_NAME);
  if (!vid || vid.length < 10) {
    vid = generateUUID();
    setCookie(COOKIE_NAME, vid);
  }
  cachedVisitorId = vid;
  return vid;
}

/**
 * Sends a non-blocking page track request to the backend.
 */
export async function trackPageView(page: string): Promise<void> {
  try {
    const visitorId = getOrCreateVisitorId();
    await fetch(`${BASE}/api/visitors/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId, page }),
      credentials: "include",
    });
  } catch {
    // Fail silently — visitor tracking must never break the website
  }
}

/**
 * Sends a non-blocking heartbeat request to keep last_seen updated.
 */
export async function sendHeartbeat(page: string): Promise<void> {
  try {
    const visitorId = getOrCreateVisitorId();
    await fetch(`${BASE}/api/visitors/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId, page }),
      credentials: "include",
    });
  } catch {
    // Fail silently
  }
}

/**
 * Fetches public aggregate statistics for the footer counter.
 */
export async function fetchPublicVisitorStats(): Promise<{
  totalUniqueVisitors: number;
  todayVisitors: number;
}> {
  try {
    const res = await fetch(`${BASE}/api/visitors/public-stats`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to load public stats");
    return await res.json();
  } catch {
    return { totalUniqueVisitors: 0, todayVisitors: 0 };
  }
}

/**
 * React hook to automatically track visitors on public pages.
 * Handles route changes, sets up single 30s heartbeat, and is React StrictMode safe.
 */
export function useVisitorTracking() {
  const [location] = useLocation();
  const lastTrackedPageRef = useRef<string | null>(null);
  const locationRef = useRef<string>(location);

  locationRef.current = location;

  useEffect(() => {
    // Only track public pages; ignore admin, doctor, and patient portal routes
    const isInternal =
      location.startsWith("/admin") ||
      location.startsWith("/doctor") ||
      location.startsWith("/portal");

    if (isInternal) {
      return;
    }

    // Guard against React 19 StrictMode duplicate execution for the same page
    if (lastTrackedPageRef.current !== location) {
      lastTrackedPageRef.current = location;
      trackPageView(location);
    }

    // Set up heartbeat every 30 seconds while on public pages
    const interval = setInterval(() => {
      sendHeartbeat(locationRef.current);
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [location]);
}
