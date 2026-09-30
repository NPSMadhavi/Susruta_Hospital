const TZ = "Asia/Kolkata";

/** User's local IANA timezone from the browser */
export function localTZ(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Given a date (YYYY-MM-DD) and HH:MM time (both in IST),
 * returns { ist: "8:00 AM", local: "2:30 AM" | null }.
 * `local` is null when the browser timezone matches IST or produces the same display string.
 */
export function dualSlotTime(date: string, hhmm: string): { ist: string; local: string | null } {
  const dt = new Date(`${date}T${hhmm}:00+05:30`);
  const istStr = dt.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
  const ltz = localTZ();
  if (ltz === TZ) return { ist: istStr, local: null };
  const localStr = dt.toLocaleTimeString("en-US", { timeZone: ltz, hour: "numeric", minute: "2-digit", hour12: true });
  if (localStr === istStr) return { ist: istStr, local: null };
  return { ist: istStr, local: localStr };
}

/**
 * Parse an offline time-slot string (e.g. "10:00 AM - 10:15 AM") and return
 * { display: original string, local: local-time range | null }.
 * `local` is null when the user is in IST or the display would be the same.
 */
export function dualOfflineTime(date: string, timeSlotStr: string): { display: string; local: string | null } {
  const ltz = localTZ();
  if (ltz === TZ) return { display: timeSlotStr, local: null };
  const re = /(\d{1,2}):(\d{2})\s*([AaPp][Mm])/g;
  const matches = [...timeSlotStr.matchAll(re)];
  if (!matches.length) return { display: timeSlotStr, local: null };
  function to24(h: string, m: string, ampm: string): string {
    let hh = parseInt(h);
    if (ampm.toLowerCase() === "pm" && hh !== 12) hh += 12;
    if (ampm.toLowerCase() === "am" && hh === 12) hh = 0;
    return `${hh.toString().padStart(2, "0")}:${m}`;
  }
  const localTimes = matches.map(m => {
    const dt = new Date(`${date}T${to24(m[1], m[2], m[3])}:00+05:30`);
    return dt.toLocaleTimeString("en-US", { timeZone: ltz, hour: "numeric", minute: "2-digit", hour12: true });
  });
  const localDisplay = localTimes.length === 2 ? `${localTimes[0]} – ${localTimes[1]}` : localTimes[0];
  return { display: timeSlotStr, local: localDisplay };
}

/** Today's date in IST as YYYY-MM-DD */
export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Format a date-only string (YYYY-MM-DD) for display in IST locale */
export function fmtDate(
  d: string,
  opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" }
): string {
  return new Date(d + "T00:00:00+05:30").toLocaleDateString("en-IN", { timeZone: TZ, ...opts });
}

/** Format a UTC timestamp for IST display (date + time) */
export function fmtTimestamp(
  ts: string | Date,
  opts: Intl.DateTimeFormatOptions = {}
): string {
  return new Date(ts).toLocaleString("en-IN", { timeZone: TZ, ...opts });
}

/** Format a UTC timestamp — time only — in IST */
export function fmtTimeIST(
  ts: string | Date,
  opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", second: "2-digit" }
): string {
  return new Date(ts).toLocaleTimeString("en-IN", { timeZone: TZ, ...opts }) + " IST";
}

/** Format a UTC timestamp — date only — in IST */
export function fmtDateFromTs(
  ts: string | Date,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }
): string {
  return new Date(ts).toLocaleDateString("en-IN", { timeZone: TZ, ...opts });
}

/** Current time in IST in minutes from midnight (0 - 1439) */
export function nowISTMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
  return hour * 60 + minute;
}

/**
 * Check whether an online slot has exceeded (passed) in IST.
 * @param date - YYYY-MM-DD
 * @param startTime - "HH:MM" (e.g. "10:00")
 */
export function isSlotExceeded(date: string, startTime: string): boolean {
  const today = todayIST();
  if (date < today) return true;
  if (date > today) return false;
  const [h, m] = startTime.split(":").map(Number);
  const slotMinutes = (h || 0) * 60 + (m || 0);
  return slotMinutes <= nowISTMinutes();
}

/**
 * Check whether an offline session has exceeded (passed) in IST.
 * Morning session: 10 AM - 1 PM (ends at 13:00 / 780 mins).
 * Evening session: 6 PM - 10 PM (ends at 22:00 / 1320 mins).
 */
export function isOfflineSessionExceeded(date: string, session: "morning" | "evening"): boolean {
  const today = todayIST();
  if (date < today) return true;
  const isSunday = new Date(date + "T12:00:00+05:30").getDay() === 0;
  if (isSunday && session === "evening") return true;
  if (date > today) return false;
  const currentMins = nowISTMinutes();
  if (session === "morning") {
    // 13:00 (1:00 PM) cutoff
    return currentMins >= 13 * 60;
  } else {
    // 22:00 (10:00 PM) cutoff
    return currentMins >= 22 * 60;
  }
}

