import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

const COOKIE_NAME = "susruta_vid";
const LOCAL_STORAGE_KEY = "susruta_vid";
const ACTIVE_TABS_KEY = "susruta_active_tabs";
const COOKIE_MAX_AGE_DAYS = 365;
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
const REQUEST_TIMEOUT_MS = 5000; // 5-second timeout safeguard

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Unique identifier for the current browser tab / window.
 */
const currentTabId = Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Generate a cryptographically strong UUID v4, with a reliable fallback.
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
 * Reads a cookie value by name.
 */
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^|;\\s*)(${name})=([^;]*)`));
  return match ? decodeURIComponent(match[3]) : null;
}

/**
 * Sets a client-side first-party cookie with 1-year persistence and SameSite=Lax.
 */
function setCookie(name: string, value: string, days: number = COOKIE_MAX_AGE_DAYS): void {
  if (typeof document === "undefined") return;
  const maxAge = days * 24 * 60 * 60;
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax${isSecure ? "; Secure" : ""}`;
}

/**
 * In-memory cache for the visitor ID within the current window/worker.
 */
let cachedVisitorId: string | null = null;

/**
 * Gets the existing anonymous visitor ID or generates and persists a new one.
 * Falls back gracefully across Cookies -> localStorage -> In-memory to handle
 * strict privacy settings without generating random IDs on every click.
 */
export function getOrCreateVisitorId(): string {
  if (cachedVisitorId) return cachedVisitorId;

  // 1. Try first-party cookie
  let vid = getCookie(COOKIE_NAME);

  // 2. Try localStorage fallback
  if (!vid && typeof localStorage !== "undefined") {
    try {
      vid = localStorage.getItem(LOCAL_STORAGE_KEY);
    } catch {
      // localStorage may be disabled
    }
  }

  // 3. Generate new ID if absent or corrupted
  if (!vid || vid.length < 10) {
    vid = generateUUID();
  }

  // 4. Persist across both cookie and localStorage
  setCookie(COOKIE_NAME, vid);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, vid);
    } catch {
      // Ignore storage errors
    }
  }

  cachedVisitorId = vid;
  return vid;
}

/**
 * Updates the cached visitor ID if the server issues a canonical ID.
 */
export function setCachedVisitorId(vid: string): void {
  if (vid && vid.length >= 10) {
    cachedVisitorId = vid;
    setCookie(COOKIE_NAME, vid);
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, vid);
      } catch {
        // Ignore
      }
    }
  }
}

/**
 * Multi-tab presence coordinator using localStorage.
 * Ensures closing one tab doesn't mark the visitor as left if another tab is visible.
 */
function updateTabPresence(isVisible: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(ACTIVE_TABS_KEY);
    const tabs: Record<string, { lastSeen: number; isVisible: boolean }> = raw ? JSON.parse(raw) : {};

    const now = Date.now();
    // Prune entries older than 2 minutes
    for (const [id, info] of Object.entries(tabs)) {
      if (now - info.lastSeen > 120000) {
        delete tabs[id];
      }
    }

    tabs[currentTabId] = { lastSeen: now, isVisible };
    localStorage.setItem(ACTIVE_TABS_KEY, JSON.stringify(tabs));
  } catch {
    // Fail silently
  }
}

function removeTabPresence(): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(ACTIVE_TABS_KEY);
    if (!raw) return;
    const tabs = JSON.parse(raw);
    delete tabs[currentTabId];
    localStorage.setItem(ACTIVE_TABS_KEY, JSON.stringify(tabs));
  } catch {
    // Fail silently
  }
}

/**
 * Returns true if another tab of this website is currently open and visible.
 */
function isAnotherTabVisible(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(ACTIVE_TABS_KEY);
    if (!raw) return false;
    const tabs: Record<string, { lastSeen: number; isVisible: boolean }> = JSON.parse(raw);
    const now = Date.now();

    for (const [id, info] of Object.entries(tabs)) {
      if (id !== currentTabId && info.isVisible && now - info.lastSeen < 60000) {
        return true;
      }
    }
  } catch {
    // Fail silently
  }
  return false;
}

/**
 * Checks if tracking is globally disabled via client environment variable.
 */
function isTrackingDisabled(): boolean {
  return import.meta.env.VITE_VISITOR_TRACKING_ENABLED === "false";
}

/**
 * Sends a non-blocking page track request to the backend with timeout safeguard.
 */
export async function trackPageView(page: string): Promise<void> {
  if (isTrackingDisabled()) return;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const visitorId = getOrCreateVisitorId();
    const res = await fetch(`${BASE}/api/visitors/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId, page }),
      credentials: "include",
      signal: controller.signal,
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.visitorId) {
        setCachedVisitorId(data.visitorId);
      }
    }
  } catch {
    // Fail silently — visitor tracking must never break the website
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Sends a non-blocking heartbeat request to keep last_heartbeat updated.
 */
export async function sendHeartbeat(page: string): Promise<void> {
  if (isTrackingDisabled()) return;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const visitorId = getOrCreateVisitorId();
    await fetch(`${BASE}/api/visitors/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId, page }),
      credentials: "include",
      signal: controller.signal,
    });
  } catch {
    // Fail silently
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Sends a leave beacon when the visitor closes or hides the last visible tab.
 */
export function sendLeaveSignal(page: string): void {
  if (isTrackingDisabled()) return;

  // If another tab is currently active and visible, do not clear presence
  if (isAnotherTabVisible()) return;

  const visitorId = getOrCreateVisitorId();
  const url = `${BASE}/api/visitors/leave`;
  const payload = JSON.stringify({ visitorId, page });

  let sent = false;
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([payload], { type: "application/json" });
      sent = navigator.sendBeacon(url, blob);
    } catch {
      sent = false;
    }
  }

  // Fallback to fetch with keepalive if sendBeacon is unsupported or failed
  if (!sent && typeof fetch !== "undefined") {
    try {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        credentials: "include",
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Fail silently
    }
  }
}

/**
 * Fetches public aggregate statistics for the footer counter.
 */
export async function fetchPublicVisitorStats(): Promise<{
  totalUniqueVisitors: number;
  todayVisitors: number;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE}/api/visitors/public-stats`, {
      credentials: "include",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("Failed to load public stats");
    return await res.json();
  } catch {
    return { totalUniqueVisitors: 0, todayVisitors: 0 };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * React hook to automatically track visitors on public pages.
 * Handles route changes, visibility state changes, multi-tab coordination,
 * and page lifecycle leave signals.
 */
export function useVisitorTracking() {
  const [location] = useLocation();
  const lastTrackedPageRef = useRef<string | null>(null);
  const locationRef = useRef<string>(location);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isHeartbeatSendingRef = useRef<boolean>(false);

  locationRef.current = location;

  useEffect(() => {
    // Only track public pages; ignore admin, doctor, and patient portal routes
    const isInternal =
      location.startsWith("/admin") ||
      location.startsWith("/doctor") ||
      location.startsWith("/portal");

    if (isInternal) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // 1. Initial page tracking on navigation
    if (lastTrackedPageRef.current !== location) {
      lastTrackedPageRef.current = location;
      trackPageView(location);
    }

    // Function to execute a single heartbeat safely without overlapping
    const triggerHeartbeat = async () => {
      if (document.visibilityState !== "visible") return;
      if (isHeartbeatSendingRef.current) return;

      isHeartbeatSendingRef.current = true;
      updateTabPresence(true);
      try {
        await sendHeartbeat(locationRef.current);
      } finally {
        isHeartbeatSendingRef.current = false;
      }
    };

    // Helper to start the periodic heartbeat interval
    const startHeartbeat = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(triggerHeartbeat, HEARTBEAT_INTERVAL_MS);
    };

    // Helper to stop the heartbeat interval
    const stopHeartbeat = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    // 2. Visibility change handling
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        updateTabPresence(true);
        triggerHeartbeat();
        startHeartbeat();
      } else {
        updateTabPresence(false);
        stopHeartbeat();
        sendLeaveSignal(locationRef.current);
      }
    };

    // 3. Page unload / leave handling
    const handlePageHide = () => {
      removeTabPresence();
      stopHeartbeat();
      sendLeaveSignal(locationRef.current);
    };

    // Start heartbeat only if document is currently visible
    if (document.visibilityState === "visible") {
      updateTabPresence(true);
      startHeartbeat();
    } else {
      updateTabPresence(false);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      stopHeartbeat();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [location]);
}
