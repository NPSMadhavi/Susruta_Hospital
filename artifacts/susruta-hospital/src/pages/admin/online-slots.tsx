import React, { useState, useEffect, useRef } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";
import { AdminToastContainer } from "@/components/admin/AdminToast";
import {
  Video, Plus, Trash2, ChevronDown, ChevronUp, AlertCircle, CheckCircle2,
  Calendar, Clock, Loader2, Eye
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api/online-slots`;

function apiFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${API}${path}`, { credentials: "include", ...opts });
}

type SlotPreview = { startTime: string; endTime: string };
type Slot = { id: number; date: string; startTime: string; endTime: string; isBooked: boolean; bookingCount: number };
type Session = {
  id: number; date: string; startTime: string; endTime: string;
  intervalMinutes: number; maxBookings: number; slots: Slot[];
};

function fmtDate(d: string) {
  return new Date(d + "T00:00:00+05:30").toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function fmtTime(t: string) {
  if (!t || !t.includes(":")) return t;
  const parts = t.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}
function generatePreview(startTime: string, endTime: string, interval: number): SlotPreview[] {
  if (!startTime || !endTime || !interval) return [];
  if (!startTime.includes(":") || !endTime.includes(":")) return [];
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return [];
  const slots: SlotPreview[] = [];
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  let i = 0;
  while (startMins + (i + 1) * interval <= endMins) {
    const slotStartMins = i === 0 ? startMins : startMins + i * interval + 1;
    const slotEndMins = startMins + (i + 1) * interval;
    const s = `${String(Math.floor(slotStartMins / 60)).padStart(2, "0")}:${String(slotStartMins % 60).padStart(2, "0")}`;
    const e = `${String(Math.floor(slotEndMins / 60)).padStart(2, "0")}:${String(slotEndMins % 60).padStart(2, "0")}`;
    slots.push({ startTime: s, endTime: e });
    i++;
  }
  return slots;
}

function timeToMinutes(t: string): number {
  if (!t || !t.includes(":")) return 0;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getNowIST() {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(timeParts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(timeParts.find((p) => p.type === "minute")?.value || 0);
  return { dateStr, currentMinutes: hour * 60 + minute };
}

function isSlotPresentOrFuture(slotDate: string, slotEndTime: string, now: { dateStr: string; currentMinutes: number }): boolean {
  if (slotDate > now.dateStr) return true;
  if (slotDate < now.dateStr) return false;
  const endMinutes = timeToMinutes(slotEndTime);
  return endMinutes > now.currentMinutes;
}

const inputCls = "w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b] transition-all bg-white";
const timeInputCls = "w-full pl-3.5 pr-9 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b] transition-all bg-white";
const labelCls = "block text-sm font-medium text-foreground mb-1.5";

export default function AdminOnlineSlots() {
  const { notify, toasts, dismissToast } = useAdminNotifications();

  const [now, setNow] = useState(() => getNowIST());

  useEffect(() => {
    const interval = setInterval(() => setNow(getNowIST()), 30000);
    return () => clearInterval(interval);
  }, []);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null);
  const [extending, setExtending] = useState<number | null>(null);
  const [extensionSessionId, setExtensionSessionId] = useState<number | null>(null);
  const [extensionEndTime, setExtensionEndTime] = useState("");
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<SlotPreview[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [err, setErr] = useState("");

  const activeSessions = sessions.filter(sess => {
    const isPast = sess.date < now.dateStr || (sess.date === now.dateStr && timeToMinutes(sess.endTime) <= now.currentMinutes);
    return !isPast;
  });

  const startTimeRef = useRef<HTMLInputElement>(null);
  const endTimeRef = useRef<HTMLInputElement>(null);

  const today = now.dateStr;
  const [form, setForm] = useState({
    date: "",
    startTime: "10:00",
    endTime: "13:00",
    intervalMinutes: 15 as 15 | 30,
  });

  async function load() {
    try {
      const r = await apiFetch("/sessions");
      const data = await r.json();
      if (r.ok && Array.isArray(data)) setSessions(data);
    } catch {
      notify("Error", "Failed to load sessions — please refresh.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (form.startTime && form.endTime && form.intervalMinutes) {
      setPreview(generatePreview(form.startTime, form.endTime, form.intervalMinutes));
    }
  }, [form.startTime, form.endTime, form.intervalMinutes]);

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: k === "intervalMinutes" ? parseInt(e.target.value) : e.target.value }));
  }

  async function createSession(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!form.date) { setErr("Please select a date."); return; }
    if (preview.length === 0) { setErr("No slots generated. Check start/end time and interval."); return; }
    setCreating(true);
    try {
      const r = await apiFetch("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      let data: Record<string, unknown> = {};
      try { data = await r.json(); } catch { /* non-JSON body */ }
      if (!r.ok) {
        setErr((data?.message as string) || `Server error (${r.status}). Please try again.`);
        return;
      }
      notify("Session Created", `Created ${(data.slots as unknown[])?.length ?? 0} slots for ${fmtDate(form.date)}`);
      setForm(f => ({ ...f, date: "" }));
      setShowPreview(false);
      await load();
    } catch (err) {
      console.error("[online-slots] createSession error:", err);
      setErr(err instanceof Error ? `Error: ${err.message}` : "Network error. Please check your connection and try again.");
    } finally {
      setCreating(false);
    }
  }

  async function deleteSession(id: number) {
    setDeleting(id);
    try {
      await apiFetch(`/sessions/${id}`, { method: "DELETE" });
      setSessions(s => s.filter(x => x.id !== id));
      notify("Deleted", "Session and all its slots have been removed.");
      setSessionToDelete(null);
    } catch {
      notify("Error", "Failed to delete session. Please try again.");
    } finally {
      setDeleting(null);
    }
  }

  async function extendSession(e: React.FormEvent, session: Session) {
    e.preventDefault();
    setErr("");
    if (!extensionEndTime || extensionEndTime <= session.endTime) {
      setErr(`Choose an end time later than ${fmtTime(session.endTime)}.`);
      return;
    }

    setExtending(session.id);
    try {
      const r = await apiFetch(`/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endTime: extensionEndTime }),
      });
      let data: Record<string, unknown> = {};
      try { data = await r.json(); } catch { /* non-JSON body */ }
      if (!r.ok) {
        setErr((data?.message as string) || `Server error (${r.status}). Please try again.`);
        return;
      }
      notify("Session Extended", `Added ${(data.addedSlots as number) ?? 0} new slots to ${fmtDate(session.date)}.`);
      setExtensionSessionId(null);
      setExtensionEndTime("");
      await load();
    } catch (error) {
      setErr(error instanceof Error ? `Error: ${error.message}` : "Network error. Please try again.");
    } finally {
      setExtending(null);
    }
  }

  return (
    <AdminLayout>
      <AdminToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="w-full space-y-8">
        <div className="mb-6">
          <h1 className="text-3xl font-sans font-bold text-foreground flex items-center gap-2">
           Online Consultation Slots
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Create Sunday slot sessions for video consultations. Each session generates individual bookable slots.</p>
        </div>

        {/* ── Create Session Form ── */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-border bg-muted/30">
            <Plus size={16} className="text-[#1a3d2b]" />
            <h2 className="font-bold text-base text-foreground">Create New Slot Session</h2>
          </div>
          <form onSubmit={createSession} className="p-6 space-y-5">
            {err && (
              <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
                <AlertCircle size={14} /> {err}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Session Date *</label>
                <input type="date" min={today} value={form.date} onChange={set("date")} className={inputCls} required />
                <p className="text-xs text-muted-foreground mt-1">Typically a Sunday for weekly sessions</p>
              </div>
              <div>
                <label className={labelCls}>Slot Interval</label>
                <select value={form.intervalMinutes} onChange={set("intervalMinutes")} className={inputCls}>
                  <option value={15}>15 minutes (shorter consults)</option>
                  <option value={30}>30 minutes (standard consult)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Session Start Time</label>
                <div className="relative w-full">
                  <input ref={startTimeRef} type="time" value={form.startTime} onChange={set("startTime")} className={timeInputCls} />
                  <button type="button" tabIndex={-1}
                    onClick={() => { try { (startTimeRef.current as any)?.showPicker?.(); } catch { startTimeRef.current?.focus(); } }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#1a3d2b] transition-colors">
                    <Clock size={15} />
                  </button>
                </div>
              </div>
              <div>
                <label className={labelCls}>Session End Time</label>
                <div className="relative w-full">
                  <input ref={endTimeRef} type="time" value={form.endTime} onChange={set("endTime")} className={timeInputCls} />
                  <button type="button" tabIndex={-1}
                    onClick={() => { try { (endTimeRef.current as any)?.showPicker?.(); } catch { endTimeRef.current?.focus(); } }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#1a3d2b] transition-colors">
                    <Clock size={15} />
                  </button>
                </div>
              </div>
            </div>

            {form.date && sessions.some((session) => session.date === form.date) && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <Calendar size={15} className="mt-0.5 shrink-0" />
                <span>
                  This date already has {sessions.filter((session) => session.date === form.date).length} session(s).
                  You can add another one by choosing a time range that does not overlap the existing sessions.
                </span>
              </div>
            )}

            {/* Slot Count Preview */}
            <div className={cn(
              "flex items-center gap-3 rounded-xl px-4 py-3 text-sm",
              preview.length > 0
                ? "bg-green-50 border border-green-200 text-green-800"
                : "bg-muted/60 border border-border text-muted-foreground"
            )}>
              <Clock size={15} className="shrink-0" />
              {preview.length > 0
                ? <><strong>{preview.length} slots</strong> will be generated ({fmtTime(form.startTime)} – {fmtTime(form.endTime)}, every {form.intervalMinutes} min)</>
                : "Adjust start/end time and interval to see slot preview"
              }
              {preview.length > 0 && (
                <button type="button" onClick={() => setShowPreview(v => !v)}
                  className="ml-auto flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-900 transition-colors">
                  <Eye size={13} /> {showPreview ? "Hide" : "Preview"}
                </button>
              )}
            </div>

            {showPreview && preview.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                {preview.map((s, i) => (
                  <div key={i} className="bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-2 text-center">
                    <p className="text-xs font-bold text-blue-700">Slot {i + 1}</p>
                    <p className="text-[10px] text-blue-500">{fmtTime(s.startTime)} to {fmtTime(s.endTime)}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button type="submit" disabled={creating || preview.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#D95B2F] text-white rounded-xl font-bold text-sm hover:bg-[#c44e25] transition-colors disabled:opacity-60 shadow-sm">
                {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                {creating ? "Creating…" : `Create Session (${preview.length} slots)`}
              </button>
            </div>
          </form>
        </div>

        {/* ── Sessions List ── */}
        <div className="space-y-4">
          <h2 className="font-bold text-lg text-foreground">All Slot Sessions</h2>

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
              <Loader2 size={16} className="animate-spin" /> Loading sessions…
            </div>
          ) : activeSessions.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-border">
              <Video size={40} className="mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">No active or upcoming slot sessions.</p>
              <p className="text-muted-foreground text-xs mt-1">Create a session above to get started.</p>
            </div>
          ) : (
            activeSessions.map(sess => {
              const bookedCount = sess.slots.filter(s => s.isBooked || s.bookingCount > 0).length;
              const totalCount = sess.slots.length;
              const isExpanded = expanded === sess.id;
              const sortedAllSlots = [...sess.slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
              const visibleSlots = sortedAllSlots;

              return (
                <div key={sess.id} className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
                  <div className="flex items-center gap-4 p-5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-foreground">{fmtDate(sess.date)}</p>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {fmtTime(sess.startTime)} – {fmtTime(sess.endTime)} · {sess.intervalMinutes} min intervals
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Booking progress */}
                      <div className="text-right">
                        <p className="text-sm font-bold text-foreground">{bookedCount}/{totalCount}</p>
                        <p className="text-[10px] text-muted-foreground">booked</p>
                      </div>
                      <div className="w-16 bg-muted rounded-full h-2">
                        <div className="bg-[#D95B2F] h-2 rounded-full transition-all"
                          style={{ width: `${totalCount ? (bookedCount / totalCount) * 100 : 0}%` }} />
                      </div>

                      <button onClick={() => setExpanded(isExpanded ? null : sess.id)}
                        type="button"
                        className="p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                      <button
                        type="button"
                        title="Extend this session"
                        aria-label={`Extend session ending ${fmtTime(sess.endTime)}`}
                        onClick={() => {
                          setExpanded(sess.id);
                          setExtensionSessionId(sess.id);
                          setExtensionEndTime(sess.endTime);
                          setErr("");
                        }}
                        className="p-2 rounded-xl text-[#1a3d2b] hover:bg-green-50 transition-colors"
                      >
                        <Plus size={18} />
                      </button>
                      <button type="button" onClick={() => setSessionToDelete(sess)} disabled={deleting === sess.id}
                        className="p-2 rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40 cursor-pointer"
                        title="Delete this session"
                      >
                        {deleting === sess.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border px-5 pb-5 pt-4">
                      {extensionSessionId === sess.id && (
                        <form onSubmit={(e) => extendSession(e, sess)} className="mb-5 rounded-xl border border-green-200 bg-green-50/70 p-4">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                              <p className="text-sm font-bold text-green-900">Extend this session</p>
                              <p className="text-xs text-green-700 mt-0.5">
                                Existing slots stay unchanged. New {sess.intervalMinutes}-minute slots will be added after {fmtTime(sess.endTime)}.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setExtensionSessionId(null)}
                              className="text-xs font-semibold text-green-700 hover:text-green-950"
                            >
                              Cancel
                            </button>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                            <label className="text-xs font-semibold text-green-900">
                              New session end time
                              <input
                                type="time"
                                min={sess.endTime}
                                value={extensionEndTime}
                                onChange={(e) => setExtensionEndTime(e.target.value)}
                                className={`${inputCls} mt-1 min-w-0 sm:w-[180px]`}
                                required
                              />
                            </label>
                            <button
                              type="submit"
                              disabled={extending === sess.id}
                              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#D95B2F] text-white rounded-xl font-bold text-sm hover:bg-[#c44e25] transition-colors disabled:opacity-60 shadow-sm"
                            >
                              {extending === sess.id ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                              {extending === sess.id ? "Adding slots…" : "Add slots"}
                            </button>
                          </div>
                        </form>
                      )}
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Individual Slots</p>
                      {visibleSlots.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-2">
                          No present or future slots available.
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
                          {visibleSlots.map(sl => {
                            const booked = sl.isBooked || sl.bookingCount > 0;
                            const slotNumber = sortedAllSlots.findIndex(s => s.id === sl.id) + 1;
                            return (
                              <div
                                key={sl.id}
                                title={`${fmtTime(sl.startTime)} – ${fmtTime(sl.endTime)}`}
                                className={cn(
                                  "rounded-xl border px-3 py-2.5",
                                  booked
                                    ? "bg-green-50 border-green-200"
                                    : "bg-muted/40 border-border"
                                )}
                              >
                                <p className={cn("text-xs font-bold", booked ? "text-green-700" : "text-foreground")}>
                                  Slot {slotNumber}
                                </p>
                                <p className={cn("text-[10px] font-semibold mt-0.5", booked ? "text-green-700/80" : "text-muted-foreground")}>
                                  {fmtTime(sl.startTime)} to {fmtTime(sl.endTime)}
                                </p>
                                <p className={cn("text-[10px] font-semibold mt-1", booked ? "text-green-600" : "text-muted-foreground/50")}>
                                  {booked ? "● Booked" : "○ Available"}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <ConfirmDeleteDialog
        isOpen={!!sessionToDelete}
        title="Delete Slot Session?"
        description={
          sessionToDelete ? (
            <p>
              Are you sure you want to delete the consultation session on{" "}
              <strong className="text-gray-900">{fmtDate(sessionToDelete.date)}</strong> ({fmtTime(sessionToDelete.startTime)} – {fmtTime(sessionToDelete.endTime)}) and all its{" "}
              <strong className="text-gray-900">{sessionToDelete.slots?.length ?? 0} consultation slots</strong>?
            </p>
          ) : null
        }
        warningText="This will permanently delete this session and all its slots. This action cannot be undone."
        isLoading={deleting !== null}
        onConfirm={() => {
          if (sessionToDelete) deleteSession(sessionToDelete.id);
        }}
        onClose={() => {
          if (!deleting) setSessionToDelete(null);
        }}
      />
    </AdminLayout>
  );
}
