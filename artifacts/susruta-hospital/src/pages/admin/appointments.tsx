import React, { useState, useEffect, useRef } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminToastContainer } from "@/components/admin/AdminToast";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, XCircle, Clock, Banknote, Smartphone,
  Calendar, RefreshCw, Bell, BellOff, UserCheck, ChevronDown, ChevronUp, X
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

type Appt = {
  id: number; patientName: string; patientPhone: string; patientEmail?: string;
  date: string; timeSlot: string; reason?: string; status: string; notes?: string;
  arrivedAt?: string; paymentStatus: string; paymentMode?: string;
  rescheduleDates?: string; rescheduleChosen?: string; followUpDate?: string;
  followUpConfirmed: boolean; createdAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  confirmed: "bg-blue-100 text-blue-800 border-blue-300",
  reschedule_proposed: "bg-orange-100 text-orange-800 border-orange-300",
  reschedule_accepted: "bg-purple-100 text-purple-800 border-purple-300",
  arrived: "bg-teal-100 text-teal-800 border-teal-300",
  completed: "bg-green-100 text-green-800 border-green-300",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  missed: "bg-gray-100 text-gray-600 border-gray-200",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed", reschedule_proposed: "Reschedule Proposed",
  reschedule_accepted: "Reschedule Accepted", arrived: "Arrived", completed: "Completed",
  cancelled: "Cancelled", missed: "Missed",
};

function fmt(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function apiFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${API}${path}`, { credentials: "include", headers: { "Content-Type": "application/json", ...opts.headers }, ...opts })
    .then((r) => r.json());
}


// ── Pay Modal ─────────────────────────────────────────────────
function PayModal({ appt, onClose, onPaid }: { appt: Appt; onClose: () => void; onPaid: (a: Appt) => void }) {
  const [mode, setMode] = useState<"cash" | "upi">("cash");
  const [loading, setLoading] = useState(false);

  async function pay() {
    setLoading(true);
    const updated = await apiFetch(`/appointments/${appt.id}/pay`, { method: "PATCH", body: JSON.stringify({ mode }) });
    onPaid(updated);
    onClose();
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-serif font-bold text-lg mb-1">Record Payment</h3>
        <p className="text-muted-foreground text-sm mb-6">{appt.patientName} · {fmt(appt.date)} {appt.timeSlot}</p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {(["cash", "upi"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={cn("py-4 rounded-2xl border-2 font-semibold flex flex-col items-center gap-2 transition-all", mode === m ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/30")}>
              {m === "cash" ? <Banknote size={22} /> : <Smartphone size={22} />}
              <span className="text-sm">{m === "cash" ? "Cash" : "UPI"}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border border-border rounded-xl text-sm font-semibold text-muted-foreground">Cancel</button>
          <button onClick={pay} disabled={loading}
            className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-bold disabled:opacity-60">
            {loading ? "..." : "Confirm Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reschedule Modal ──────────────────────────────────────────
function RescheduleModal({ appt, onClose, onProposed }: { appt: Appt; onClose: () => void; onProposed: (a: Appt) => void }) {
  const [dates, setDates] = useState<string[]>(["", "", ""]);
  const [loading, setLoading] = useState(false);

  async function propose() {
    const valid = dates.filter(Boolean);
    if (!valid.length) return;
    setLoading(true);
    const updated = await apiFetch(`/appointments/${appt.id}/reschedule`, { method: "PATCH", body: JSON.stringify({ dates: valid }) });
    onProposed(updated);
    onClose();
    setLoading(false);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-serif font-bold text-lg mb-1">Propose Reschedule</h3>
        <p className="text-muted-foreground text-sm mb-5">Offer up to 3 alternative dates for the patient to choose from.</p>
        <div className="space-y-3 mb-6">
          {dates.map((d, i) => (
            <div key={i}>
              <label className="text-xs text-muted-foreground mb-1 block">Option {i + 1}{i > 0 && " (optional)"}</label>
              <input type="date" min={today} value={d} onChange={(e) => setDates((prev) => prev.map((x, j) => j === i ? e.target.value : x))}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border border-border rounded-xl text-sm font-semibold text-muted-foreground">Cancel</button>
          <button onClick={propose} disabled={loading || !dates.some(Boolean)}
            className="flex-1 py-3 bg-orange-600 text-white rounded-xl text-sm font-bold disabled:opacity-60">
            {loading ? "..." : "Send Proposal"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Follow-up Modal ────────────────────────────────────────────
function FollowUpModal({ appt, onClose, onSet }: { appt: Appt; onClose: () => void; onSet: (a: Appt) => void }) {
  const [date, setDate] = useState(appt.followUpDate || "");
  const [loading, setLoading] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  async function save() {
    if (!date) return;
    setLoading(true);
    const updated = await apiFetch(`/appointments/${appt.id}/followup`, { method: "PATCH", body: JSON.stringify({ followUpDate: date }) });
    onSet(updated);
    onClose();
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs p-6">
        <h3 className="font-serif font-bold text-lg mb-4">Set Follow-up Date</h3>
        <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)}
          className="w-full border border-border rounded-xl px-3 py-2.5 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-primary/20" />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border border-border rounded-xl text-sm font-semibold text-muted-foreground">Cancel</button>
          <button onClick={save} disabled={!date || loading}
            className="flex-1 py-3 bg-primary text-white rounded-xl text-sm font-bold disabled:opacity-60">
            {loading ? "..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function AdminAppointments() {
  const [appts, setAppts] = useState<Appt[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [payModal, setPayModal] = useState<Appt | null>(null);
  const [rescheduleModal, setRescheduleModal] = useState<Appt | null>(null);
  const [followUpModal, setFollowUpModal] = useState<Appt | null>(null);
  const { permission, requestPermission, notify, toasts, dismissToast } = useAdminNotifications();
  const notifyRef = useRef(notify);
  useEffect(() => { notifyRef.current = notify; }, [notify]);
  const queryClient = useQueryClient();

  async function fetchAppts() {
    setLoading(true);
    const url = filter !== "all" ? `/appointments?status=${filter}` : "/appointments";
    const data = await apiFetch(url);
    setAppts(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { fetchAppts(); }, [filter]);

  // SSE subscription — connect once, use notifyRef so we always call the latest notify
  useEffect(() => {
    const es = new EventSource(`${API}/appointments/notifications`, { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "new_appointment") {
          const a: Appt = msg.appointment;
          setAppts((prev) => [a, ...prev.filter((x) => x.id !== a.id)]);
          notifyRef.current("New Appointment Request", `${a.patientName} — ${fmt(a.date)} ${a.timeSlot}`);
        }
      } catch {}
    };
    // Polling fallback every 30s in case SSE drops or proxy buffers
    const poll = setInterval(() => fetchAppts(), 30000);
    return () => { es.close(); clearInterval(poll); };
  }, []);

  function mutate(updated: Appt) {
    setAppts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  async function approve(id: number) {
    const updated = await apiFetch(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status: "confirmed" }) });
    mutate(updated);
  }
  async function cancel(id: number) {
    if (!confirm("Cancel this appointment?")) return;
    const updated = await apiFetch(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) });
    mutate(updated);
  }
  async function arrive(id: number) {
    const updated = await apiFetch(`/appointments/${id}/arrive`, { method: "PATCH" });
    mutate(updated);
  }

  const today = new Date().toISOString().slice(0, 10);
  const pendingCount = appts.filter((a) => a.status === "pending").length;
  const todayAppts = appts.filter((a) => a.date === today);
  const shown = filter === "all" ? appts : appts.filter((a) => a.status === filter);

  return (
    <AdminLayout>
      {payModal && <PayModal appt={payModal} onClose={() => setPayModal(null)} onPaid={(a) => { mutate(a); setPayModal(null); }} />}
      {rescheduleModal && <RescheduleModal appt={rescheduleModal} onClose={() => setRescheduleModal(null)} onProposed={(a) => { mutate(a); }} />}
      {followUpModal && <FollowUpModal appt={followUpModal} onClose={() => setFollowUpModal(null)} onSet={(a) => { mutate(a); }} />}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Appointments</h1>
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 mt-1 text-sm text-yellow-700 font-medium bg-yellow-100 px-3 py-0.5 rounded-full border border-yellow-200">
              <Clock size={13} /> {pendingCount} pending approval
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Browser notification toggle */}
          <button onClick={requestPermission}
            className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors",
              permission === "granted" ? "bg-green-50 text-green-700 border-green-200" : "bg-muted text-muted-foreground border-border hover:border-primary/40")}>
            {permission === "granted" ? <Bell size={14} /> : <BellOff size={14} />}
            {permission === "granted" ? "Notifications On" : "Enable Notifications"}
          </button>
          <button onClick={fetchAppts} className="p-2 rounded-xl border border-border text-muted-foreground hover:bg-muted">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Today summary */}
      {todayAppts.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 mb-6">
          <p className="text-primary font-semibold text-sm flex items-center gap-2 mb-2">
            <Calendar size={14} /> Today's Schedule — {todayAppts.length} appointment{todayAppts.length !== 1 && "s"}
          </p>
          <div className="flex flex-wrap gap-2">
            {todayAppts.map((a) => (
              <span key={a.id} className={cn("text-xs px-3 py-1 rounded-full border font-medium", STATUS_COLORS[a.status] || STATUS_COLORS.pending)}>
                {a.timeSlot} · {a.patientName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {["all", "pending", "confirmed", "arrived", "completed", "reschedule_proposed", "cancelled"].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={cn("px-3 py-1.5 rounded-xl text-sm font-medium transition-colors border capitalize",
              filter === s ? "bg-foreground text-white border-foreground" : "bg-white border-border text-muted-foreground hover:border-primary/40")}>
            {STATUS_LABELS[s] || s}
          </button>
        ))}
      </div>

      {/* Appointment list */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-16 text-center text-muted-foreground">Loading...</div>
        ) : shown.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">No appointments found</div>
        ) : (
          shown.map((a) => {
            const isExpanded = expanded === a.id;
            const reschedDates: string[] = a.rescheduleDates ? JSON.parse(a.rescheduleDates) : [];
            return (
              <div key={a.id} className={cn("bg-white rounded-2xl border shadow-sm overflow-hidden transition-all",
                a.status === "pending" ? "border-yellow-300 ring-1 ring-yellow-200" : "border-border")}>
                {/* Main row */}
                <div className="p-4 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <span className="font-bold text-foreground truncate">{a.patientName}</span>
                      <span className={cn("text-xs px-2.5 py-0.5 rounded-full border font-medium", STATUS_COLORS[a.status] || "bg-gray-100 text-gray-600 border-gray-200")}>
                        {STATUS_LABELS[a.status] || a.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><Calendar size={11} /> {fmt(a.date)}</span>
                      <span className="flex items-center gap-1"><Clock size={11} /> {a.timeSlot}</span>
                      <span>{a.patientPhone}</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Approve */}
                    {a.status === "pending" && (
                      <>
                        <button onClick={() => approve(a.id)}
                          className="flex items-center gap-1.5 bg-green-600 text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-green-700 transition-colors">
                          <CheckCircle2 size={13} /> Approve
                        </button>
                        <button onClick={() => setRescheduleModal(a)}
                          className="flex items-center gap-1.5 bg-orange-500 text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-orange-600 transition-colors">
                          <RefreshCw size={13} /> Reschedule
                        </button>
                        <button onClick={() => cancel(a.id)}
                          className="flex items-center gap-1.5 bg-red-500 text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-red-600 transition-colors">
                          <XCircle size={13} /> Decline
                        </button>
                      </>
                    )}
                    {/* Arrived */}
                    {a.status === "confirmed" && (
                      <>
                        <button onClick={() => arrive(a.id)}
                          className="flex items-center gap-1.5 bg-teal-600 text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-teal-700 transition-colors">
                          <UserCheck size={13} /> Arrived
                        </button>
                        <button onClick={() => cancel(a.id)}
                          className="flex items-center gap-1.5 border border-red-300 text-red-600 text-xs font-medium px-3 py-2 rounded-xl hover:bg-red-50 transition-colors">
                          Cancel
                        </button>
                      </>
                    )}
                    {/* Pay */}
                    {a.status === "arrived" && a.paymentStatus === "unpaid" && (
                      <button onClick={() => setPayModal(a)}
                        className="flex items-center gap-1.5 bg-primary text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-primary/90 transition-colors">
                        <Banknote size={13} /> Mark Paid
                      </button>
                    )}
                    {/* Follow-up */}
                    {a.status === "completed" && (
                      <button onClick={() => setFollowUpModal(a)}
                        className="flex items-center gap-1.5 border border-border text-muted-foreground text-xs font-medium px-3 py-2 rounded-xl hover:bg-muted transition-colors">
                        <Calendar size={13} /> {a.followUpDate ? "Edit Follow-up" : "Set Follow-up"}
                      </button>
                    )}
                    {/* Reschedule for confirmed */}
                    {a.status === "reschedule_accepted" && (
                      <button onClick={() => approve(a.id)}
                        className="flex items-center gap-1.5 bg-purple-600 text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-purple-700 transition-colors">
                        <CheckCircle2 size={13} /> Confirm New Date
                      </button>
                    )}
                    {/* Expand */}
                    <button onClick={() => setExpanded(isExpanded ? null : a.id)}
                      className="p-2 rounded-xl border border-border text-muted-foreground hover:bg-muted">
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/30 p-4 space-y-3">
                    {a.reason && <div className="text-sm"><span className="font-medium">Reason: </span>{a.reason}</div>}
                    {a.patientEmail && <div className="text-sm"><span className="font-medium">Email: </span>{a.patientEmail}</div>}
                    {a.arrivedAt && <div className="text-sm text-teal-700"><span className="font-medium">Arrived at: </span>{new Date(a.arrivedAt).toLocaleTimeString("en-IN")}</div>}
                    {a.paymentStatus === "paid" && <div className="text-sm text-green-700"><span className="font-medium">Payment: </span>Paid via {a.paymentMode?.toUpperCase()}</div>}
                    {a.followUpDate && <div className="text-sm text-amber-700"><span className="font-medium">Follow-up: </span>{fmt(a.followUpDate)} {a.followUpConfirmed ? "✓ Patient confirmed" : "⏳ Awaiting patient confirmation"}</div>}
                    {reschedDates.length > 0 && (
                      <div className="text-sm"><span className="font-medium">Proposed dates: </span>{reschedDates.map(fmt).join(", ")}
                        {a.rescheduleChosen && <span className="text-purple-700 ml-2">→ Patient chose: {fmt(a.rescheduleChosen)}</span>}
                      </div>
                    )}
                    {a.notes && <div className="text-sm"><span className="font-medium">Notes: </span>{a.notes}</div>}
                    <div className="text-xs text-muted-foreground">Booked: {new Date(a.createdAt).toLocaleString("en-IN")}</div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <AdminToastContainer toasts={toasts} onDismiss={dismissToast} />
    </AdminLayout>
  );
}
