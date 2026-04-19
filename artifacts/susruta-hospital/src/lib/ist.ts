const TZ = "Asia/Kolkata";

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
