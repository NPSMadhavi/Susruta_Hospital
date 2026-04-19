import React, { useState, useEffect, useRef } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
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
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
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
  let current = sh * 60 + sm;
  const end = eh * 60 + em;
  while (current + interval <= end) {
    const s = `${String(Math.floor(current / 60)).padStart(2, "0")}:${String(current % 60).padStart(2, "0")}`;
    current += interval;
    const e = `${String(Math.floor(current / 60)).padStart(2, "0")}:${String(current % 60).padStart(2, "0")}`;
    slots.push({ startTime: s, endTime: e });
  }
  return slots;
}

const inputCls = "w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b] transition-all bg-white";
const timeInputCls = "w-full pl-3.5 pr-10 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b] transition-all bg-white";
const labelCls = "block text-sm font-medium text-foreground mb-1.5";

export default function AdminOnlineSlots() {
  const { notify, toasts, dismissToast } = useAdminNotifications();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<SlotPreview[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [err, setErr] = useState("");

  const startTimeRef = useRef<HTMLInputElement>(null);
  const endTimeRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    date: "",
    startTime: "09:00",
    endTime: "13:00",
    intervalMinutes: 30 as 15 | 30,
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
    if (!confirm("Delete this session and all its slots? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await apiFetch(`/sessions/${id}`, { method: "DELETE" });
      setSessions(s => s.filter(x => x.id !== id));
      notify("Deleted", "Session and all its slots have been removed.");
    } catch {
      notify("Error", "Failed to delete session. Please try again.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <AdminLayout>
      <AdminToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground flex items-center gap-2">
            <Video size={22} className="text-[#1a3d2b]" /> Online Consultation Slots
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="relative">
                  <input ref={startTimeRef} type="time" value={form.startTime} onChange={set("startTime")} className={timeInputCls} />
                  <button type="button" tabIndex={-1}
                    onClick={() => (startTimeRef.current as any)?.showPicker?.()}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#1a3d2b] transition-colors">
                    <Clock size={15} />
                  </button>
                </div>
              </div>
              <div>
                <label className={labelCls}>Session End Time</label>
                <div className="relative">
                  <input ref={endTimeRef} type="time" value={form.endTime} onChange={set("endTime")} className={timeInputCls} />
                  <button type="button" tabIndex={-1}
                    onClick={() => (endTimeRef.current as any)?.showPicker?.()}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#1a3d2b] transition-colors">
                    <Clock size={15} />
                  </button>
                </div>
              </div>
            </div>

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
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {preview.map((s, i) => (
                  <div key={i} className="bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-2 text-center">
                    <p className="text-xs font-bold text-blue-700">{fmtTime(s.startTime)}</p>
                    <p className="text-[10px] text-blue-500">to {fmtTime(s.endTime)}</p>
                  </div>
                ))}
              </div>
            )}

            <button type="submit" disabled={creating || preview.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#1a3d2b] text-white rounded-xl font-bold text-sm hover:bg-[#1a3d2b]/90 transition-colors disabled:opacity-60">
              {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              {creating ? "Creating…" : `Create Session (${preview.length} slots)`}
            </button>
          </form>
        </div>

        {/* ── Sessions List ── */}
        <div className="space-y-4">
          <h2 className="font-bold text-lg text-foreground">All Slot Sessions</h2>

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
              <Loader2 size={16} className="animate-spin" /> Loading sessions…
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-border">
              <Video size={40} className="mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">No slot sessions created yet.</p>
              <p className="text-muted-foreground text-xs mt-1">Create your first session above to get started.</p>
            </div>
          ) : (
            sessions.map(sess => {
              const bookedCount = sess.slots.filter(s => s.isBooked || s.bookingCount > 0).length;
              const totalCount = sess.slots.length;
              const isExpanded = expanded === sess.id;
              const isPast = sess.date < today;

              return (
                <div key={sess.id} className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
                  <div className="flex items-center gap-4 p-5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-foreground">{fmtDate(sess.date)}</p>
                        {isPast && (
                          <span className="text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Past</span>
                        )}
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
                        <div className="bg-[#1a3d2b] h-2 rounded-full transition-all"
                          style={{ width: `${totalCount ? (bookedCount / totalCount) * 100 : 0}%` }} />
                      </div>

                      <button onClick={() => setExpanded(isExpanded ? null : sess.id)}
                        className="p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                      <button onClick={() => deleteSession(sess.id)} disabled={deleting === sess.id}
                        className="p-2 rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40">
                        {deleting === sess.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border px-5 pb-5 pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Individual Slots</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {sess.slots.map(sl => {
                          const booked = sl.isBooked || sl.bookingCount > 0;
                          return (
                            <div key={sl.id} className={cn(
                              "rounded-xl border px-3 py-2.5",
                              booked
                                ? "bg-green-50 border-green-200"
                                : "bg-muted/40 border-border"
                            )}>
                              <p className={cn("text-xs font-bold", booked ? "text-green-700" : "text-foreground")}>
                                {fmtTime(sl.startTime)}
                              </p>
                              <p className={cn("text-[10px]", booked ? "text-green-500" : "text-muted-foreground")}>
                                to {fmtTime(sl.endTime)}
                              </p>
                              <p className={cn("text-[10px] font-semibold mt-1", booked ? "text-green-600" : "text-muted-foreground/50")}>
                                {booked ? "● Booked" : "○ Available"}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
