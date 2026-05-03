import React, { useState, useEffect, useRef, useCallback } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminToastContainer } from "@/components/admin/AdminToast";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, XCircle, Clock, Banknote, Smartphone,
  Calendar, RefreshCw, Bell, BellOff, UserCheck, ChevronDown, ChevronUp, X,
  Video, Loader2, Camera, Upload, ImageIcon, Play, Square,
  AlertCircle, FileText, MapPin, User, Mic, Eye, RotateCcw, Trash2, Users
} from "lucide-react";

import { AdminVideoRoom } from "@/components/VideoCall";
import { cn } from "@/lib/utils";
import { todayIST, fmtTimestamp, fmtTimeIST } from "@/lib/ist";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

type ParticipantPerm = {
  name: string;
  role: "patient" | "guest";
  camera: boolean | null;
  mic: boolean | null;
  updatedAt: number;
};

function PermBadge({ icon, granted }: { icon: "cam" | "mic"; granted: boolean | null }) {
  const Icon = icon === "cam" ? Camera : Mic;
  if (granted === true) return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
      <Icon size={9} /> ✓
    </span>
  );
  if (granted === false) return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-500 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
      <Icon size={9} /> ✗
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-gray-400 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">
      <Icon size={9} /> ?
    </span>
  );
}

function GuestCountBadge({ apptId }: { apptId: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const r = await fetch(`${BASE}/api/guest/status/${apptId}`);
        if (!r.ok || !alive) return;
        const { waitingCount } = await r.json();
        if (alive) setCount(waitingCount ?? 0);
      } catch {}
    }
    poll();
    const iv = setInterval(poll, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, [apptId]);
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
      <Users size={9} /> {count} guest{count !== 1 ? "s" : ""} waiting
    </span>
  );
}

function apiFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${API}${path}`, { credentials: "include", headers: { "Content-Type": "application/json", ...opts.headers }, ...opts })
    .then((r) => r.json());
}

// ── Audio chime ─────────────────────────────────────────────────
function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.22);
      gain.gain.linearRampToValueAtTime(0.6, ctx.currentTime + i * 0.22 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.22 + 1.2);
      osc.start(ctx.currentTime + i * 0.22);
      osc.stop(ctx.currentTime + i * 0.22 + 1.2);
    });
  } catch {}
}

// ── Types ────────────────────────────────────────────────────────
type Appt = {
  id: number; patientName: string; patientPhone: string; patientEmail?: string;
  date: string; timeSlot: string; reason?: string; status: string; notes?: string;
  arrivedAt?: string; paymentStatus: string; paymentMode?: string;
  rescheduleDates?: string; rescheduleChosen?: string; followUpDate?: string;
  followUpConfirmed: boolean; createdAt: string;
};
type DocFile = { name: string; objectPath: string; contentType: string; size: number };
type Prescription = { photoObjectPath: string | null; notes: string | null; updatedAt: string };
type OnlineAppt = {
  id: number; status: string; reason: string | null;
  documents: DocFile[]; joinEnabled: boolean; joinEnabledAt: string | null;
  patientJoinedAt: string | null; createdAt: string;
  slot: { id: number; date: string; startTime: string; endTime: string };
  patient: { id: number; patientCode: string | null; name: string; email: string; phone: string | null };
  prescription: Prescription | null;
  permissions: ParticipantPerm[];
};

// ── Helpers ──────────────────────────────────────────────────────
const IST = "Asia/Kolkata";
function fmt(date: string) {
  return new Date(date + "T00:00:00+05:30").toLocaleDateString("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short" });
}
function fmtFull(date: string) {
  return new Date(date + "T00:00:00+05:30").toLocaleDateString("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// ── In-Person Status configs ─────────────────────────────────────
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
const ONLINE_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  confirmed: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};

// ── Modals (In-Person) ───────────────────────────────────────────
function PayModal({ appt, onClose, onPaid }: { appt: Appt; onClose: () => void; onPaid: (a: Appt) => void }) {
  const [mode, setMode] = useState<"cash" | "upi">("cash");
  const [loading, setLoading] = useState(false);
  async function pay() {
    setLoading(true);
    const updated = await apiFetch(`/appointments/${appt.id}/pay`, { method: "PATCH", body: JSON.stringify({ mode }) });
    onPaid(updated); onClose(); setLoading(false);
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-serif font-bold text-lg mb-1">Record Payment</h3>
        <p className="text-muted-foreground text-sm mb-6">{appt.patientName} · {fmt(appt.date)} {appt.timeSlot}</p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {(["cash", "upi"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={cn("py-4 rounded-2xl border-2 font-semibold flex flex-col items-center gap-2 transition-all",
                mode === m ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/30")}>
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

function RescheduleModal({ appt, onClose, onProposed }: { appt: Appt; onClose: () => void; onProposed: (a: Appt) => void }) {
  const [dates, setDates] = useState<string[]>(["", "", ""]);
  const [loading, setLoading] = useState(false);
  const today = todayIST();
  async function propose() {
    const valid = dates.filter(Boolean);
    if (!valid.length) return;
    setLoading(true);
    const updated = await apiFetch(`/appointments/${appt.id}/reschedule`, { method: "PATCH", body: JSON.stringify({ dates: valid }) });
    onProposed(updated); onClose(); setLoading(false);
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-serif font-bold text-lg mb-1">Propose Reschedule</h3>
        <p className="text-muted-foreground text-sm mb-5">Offer up to 3 alternative dates for the patient to choose from.</p>
        <div className="space-y-3 mb-6">
          {dates.map((d, i) => (
            <div key={i}>
              <label className="text-xs text-muted-foreground mb-1 block">Option {i + 1}{i > 0 && " (optional)"}</label>
              <input type="date" min={today} value={d} onChange={(e) => setDates(prev => prev.map((x, j) => j === i ? e.target.value : x))}
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

function FollowUpModal({ appt, onClose, onSet }: { appt: Appt; onClose: () => void; onSet: (a: Appt) => void }) {
  const [date, setDate] = useState(appt.followUpDate || "");
  const [loading, setLoading] = useState(false);
  const today = todayIST();
  async function save() {
    if (!date) return;
    setLoading(true);
    const updated = await apiFetch(`/appointments/${appt.id}/followup`, { method: "PATCH", body: JSON.stringify({ followUpDate: date }) });
    onSet(updated); onClose(); setLoading(false);
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

// ── Prescription Upload (Online) ─────────────────────────────────
function PrescriptionUpload({ apptId, prescription, onUploaded }: {
  apptId: number; prescription: Prescription | null; onUploaded: (rx: Prescription) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [uploaded, setUploaded] = useState(false);

  function handleFile(file: File) { setErr(""); setUploaded(false); setPreview(URL.createObjectURL(file)); setPendingFile(file); }

  async function confirmUpload() {
    if (!pendingFile) return;
    setUploading(true); setErr("");
    try {
      const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pendingFile.name, contentType: pendingFile.type, size: pendingFile.size }),
      });
      if (!urlRes.ok) throw new Error("Upload URL failed");
      const { uploadURL, objectPath } = await urlRes.json();
      const upRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": pendingFile.type }, body: pendingFile });
      if (!upRes.ok) throw new Error("Upload failed");
      const saveRes = await fetch(`${BASE}/api/online-appointments/admin/${apptId}/prescription`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoObjectPath: objectPath }),
      });
      if (!saveRes.ok) throw new Error("Save failed");
      const rx = await saveRes.json();
      setUploaded(true);
      setTimeout(() => { setPreview(null); setPendingFile(null); setUploaded(false); onUploaded(rx); }, 800);
    } catch (e: any) { setErr(e.message || "Upload failed"); }
    finally { setUploading(false); }
  }

  const existingImg = prescription?.photoObjectPath
    ? `${BASE}/api/storage${prescription.photoObjectPath}`
    : null;

  return (
    <div className="space-y-3">
      {/* Preview selected file */}
      {preview ? (
        <div className="space-y-3">
          <div className="relative rounded-2xl overflow-hidden border-2 border-[#1a3d2b]/25 bg-gray-50 shadow-sm">
            <img src={preview} alt="Preview" className="w-full max-h-52 object-contain" />
            {!uploading && !uploaded && (
              <button
                onClick={() => { setPreview(null); setPendingFile(null); }}
                className="absolute top-2 right-2 w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
              >
                <X size={13} />
              </button>
            )}
          </div>
          {err && (
            <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 flex items-center gap-1.5">
              <AlertCircle size={11} />{err}
            </p>
          )}
          <button
            onClick={confirmUpload}
            disabled={uploading || uploaded}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all",
              uploaded
                ? "bg-emerald-500 text-white"
                : "bg-[#1a3d2b] text-white hover:bg-[#15322a] disabled:opacity-70"
            )}
          >
            {uploading
              ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
              : uploaded
                ? <><CheckCircle2 size={14} /> Saved!</>
                : <><Upload size={14} /> Save Prescription</>
            }
          </button>
        </div>
      ) : (
        /* Upload zone */
        <div className="space-y-2">
          {existingImg && (
            <div className="relative rounded-2xl overflow-hidden border border-border bg-gray-50 group">
              <img src={existingImg} alt="Prescription" className="w-full max-h-44 object-contain" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col items-center justify-center gap-2 py-4 bg-[#1a3d2b]/5 hover:bg-[#1a3d2b]/10 border border-[#1a3d2b]/20 hover:border-[#1a3d2b]/40 rounded-xl cursor-pointer transition-all group">
              <Camera size={20} className="text-[#1a3d2b]/70 group-hover:text-[#1a3d2b] transition-colors" />
              <span className="text-xs font-semibold text-[#1a3d2b]/70 group-hover:text-[#1a3d2b]">Take Photo</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </label>
            <label className="flex flex-col items-center justify-center gap-2 py-4 bg-muted/30 hover:bg-muted/60 border border-border hover:border-muted-foreground/30 rounded-xl cursor-pointer transition-all group">
              <Upload size={20} className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
              <span className="text-xs font-semibold text-muted-foreground/60 group-hover:text-muted-foreground">
                {existingImg ? "Replace File" : "Upload File"}
              </span>
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </label>
          </div>
          {existingImg && prescription?.updatedAt && (
            <p className="text-[10px] text-center text-muted-foreground">
              Last updated {new Date(prescription.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Admin Call Overlay + Online Appointment Card ─────────────────
function AdminCallOverlay({ apptId, patientName, onLeave }: { apptId: number; patientName: string; onLeave: () => void }) {
  const [creds, setCreds] = useState<{ token: string; roomName: string; serverUrl: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${BASE}/api/livekit/admin-token/${apptId}`, { credentials: "include" });
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.message || "Could not join"); }
        setCreds(await r.json());
      } catch (e: any) { setError(e.message || "Could not join the call"); }
      finally { setLoading(false); }
    })();
  }, [apptId]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#111]">
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 size={32} className="animate-spin text-emerald-400 mx-auto mb-3" />
            <p className="text-white/60 text-sm">Joining call…</p>
          </div>
        </div>
      )}
      {error && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
            <p className="text-white font-semibold mb-1">Could not join</p>
            <p className="text-white/40 text-sm">{error}</p>
            <button onClick={onLeave} className="mt-4 px-4 py-2 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition-colors">Close</button>
          </div>
        </div>
      )}
      {creds && (
        <div className="flex-1 min-h-0">
          <AdminVideoRoom token={creds.token} serverUrl={creds.serverUrl} onLeave={onLeave} />
        </div>
      )}
    </div>
  );
}

function OnlineApptCard({ appt, permissions, onJoinToggle, onRenotify, onPrescriptionUploaded, onJoinCall, onRequestPermissions, onReset, onMarkDone, onDelete }: {
  appt: OnlineAppt;
  permissions: ParticipantPerm[];
  onJoinToggle: (id: number, enable: boolean) => Promise<void>;
  onRenotify: (id: number) => Promise<void>;
  onPrescriptionUploaded: (id: number, rx: Prescription) => void;
  onJoinCall: (id: number, patientName: string) => void;
  onRequestPermissions: (id: number) => Promise<void>;
  onReset: (id: number) => Promise<void>;
  onMarkDone: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [renotifying, setRenotifying] = useState(false);
  const [requestingPerm, setRequestingPerm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [markingDone, setMarkingDone] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [permSent, setPermSent] = useState(false);
  const sc = ONLINE_STATUS_COLORS[appt.status] ?? ONLINE_STATUS_COLORS.confirmed;

  async function toggleJoin() {
    setToggling(true);
    await onJoinToggle(appt.id, !appt.joinEnabled);
    setToggling(false);
  }

  async function handleRenotify() {
    setRenotifying(true);
    await onRenotify(appt.id);
    setRenotifying(false);
  }

  async function handleRequestPermissions() {
    setRequestingPerm(true);
    setPermSent(false);
    await onRequestPermissions(appt.id);
    setRequestingPerm(false);
    setPermSent(true);
    setTimeout(() => setPermSent(false), 4000);
  }

  async function handleReset() {
    setResetting(true);
    await onReset(appt.id);
    setResetting(false);
  }

  async function handleMarkDone() {
    setMarkingDone(true);
    await onMarkDone(appt.id);
    setMarkingDone(false);
  }

  async function handleDelete() {
    setDeleting(true);
    await onDelete(appt.id);
    setDeleting(false);
    setConfirmDelete(false);
  }

  return (
    <div className={cn(
      "bg-white rounded-2xl border overflow-hidden shadow-sm transition-all",
      appt.joinEnabled && appt.patientJoinedAt ? "border-emerald-500 ring-2 ring-emerald-100"
        : appt.joinEnabled ? "border-amber-400 ring-2 ring-amber-100"
        : "border-border"
    )}>
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Patient ID */}
          <div className={cn(
            "w-14 h-14 rounded-xl flex items-center justify-center shrink-0 border-2",
            appt.patient.patientCode ? "bg-[#1a3d2b]/5 border-[#1a3d2b]/20" : "bg-blue-50 border-blue-100"
          )}>
            {appt.patient.patientCode
              ? <span className="font-black text-[#1a3d2b] text-sm font-mono">{appt.patient.patientCode}</span>
              : <User size={20} className="text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base">{appt.patient.name}</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {appt.joinEnabled && appt.patientJoinedAt
                ? <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-600 text-white animate-pulse">🟢 Live</span>
                : appt.joinEnabled
                  ? <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500 text-white animate-pulse">⏳ Not Joined Yet</span>
                  : <span className={cn("text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border", sc)}>{appt.status}</span>
              }
              <GuestCountBadge apptId={appt.id} />
            </div>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Calendar size={11} className="text-[#1a3d2b]" />{fmtFull(appt.slot.date)}</span>
              <span className="flex items-center gap-1"><Clock size={11} />{fmtTime(appt.slot.startTime)} – {fmtTime(appt.slot.endTime)}</span>
              {appt.patient.phone && <span>{appt.patient.phone}</span>}
            </div>
          </div>
          {/* Action buttons */}
          <div className="flex flex-col gap-2 shrink-0">
            {appt.joinEnabled && (
              <button
                onClick={e => { e.stopPropagation(); handleRenotify(); }}
                disabled={renotifying}
                title="Re-send chime + voice alert to patient"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-200 transition-all">
                {renotifying ? <Loader2 size={11} className="animate-spin" /> : <Bell size={11} />}
                Re-notify
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); toggleJoin(); }}
              disabled={toggling}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all",
                appt.joinEnabled
                  ? "bg-red-100 text-red-700 hover:bg-red-200 border border-red-200"
                  : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
              )}>
              {toggling ? <Loader2 size={12} className="animate-spin" /> : appt.joinEnabled ? <Square size={12} /> : <Play size={12} />}
              {appt.joinEnabled ? "End Session" : "Enable Join"}
            </button>
          </div>
        </div>

        {appt.reason && (
          <p className="mt-3 text-xs text-muted-foreground bg-muted/30 rounded-xl px-3 py-2">
            <span className="font-semibold text-foreground">Reason: </span>{appt.reason}
          </p>
        )}
        {appt.documents.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {appt.documents.map((d, i) => (
              <a key={i} href={`${BASE}/api/storage${d.objectPath}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] bg-blue-50 border border-blue-100 text-blue-700 px-2.5 py-1 rounded-lg font-medium hover:bg-blue-100 transition-colors">
                <FileText size={10} /> {d.name}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Live session controls — only shown during active calls */}
      {appt.joinEnabled && (
        <div className="mx-4 mb-3 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-3">
          <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Session Controls
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={() => onJoinCall(appt.id, appt.patient.name)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#1a3d2b] text-white hover:bg-[#15322a] transition-colors shadow-sm"
            >
              <Eye size={12} /> Monitor Call
            </button>
          </div>

          {/* Device permission status grid */}
          <div className="rounded-xl border border-emerald-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-emerald-100 bg-emerald-50/40">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Device Status</span>
              <button
                onClick={handleRequestPermissions}
                disabled={requestingPerm}
                className="text-[10px] text-emerald-600 hover:text-emerald-900 underline disabled:opacity-50 transition-colors"
              >
                {requestingPerm ? "Sending…" : permSent ? "✓ Sent" : "Re-check"}
              </button>
            </div>
            {permissions.length === 0 ? (
              <p className="px-3 py-2.5 text-[11px] text-gray-400 italic">
                No status reported yet — click Re-check to prompt the patient
              </p>
            ) : (
              permissions.map((p, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 border-b border-gray-50 last:border-0">
                  <User size={10} className="text-gray-400 shrink-0" />
                  <span className="text-[11px] font-medium text-gray-800 flex-1 truncate min-w-0">
                    {p.name}{" "}
                    <span className="text-gray-400 font-normal text-[10px]">({p.role})</span>
                  </span>
                  <PermBadge icon="cam" granted={p.camera} />
                  <PermBadge icon="mic" granted={p.mic} />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Admin actions — Reset to Pending / Mark as Done / Delete */}
      <div className="mx-4 mb-3 flex flex-wrap items-center gap-2">
        {["completed", "cancelled"].includes(appt.status) && !appt.joinEnabled && (
          <button
            onClick={handleReset}
            disabled={resetting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
          >
            {resetting ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
            Reset to Pending
          </button>
        )}
        {["pending", "confirmed"].includes(appt.status) && !appt.joinEnabled && (
          <button
            onClick={handleMarkDone}
            disabled={markingDone}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
          >
            {markingDone ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
            Mark as Done
          </button>
        )}
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors ml-auto"
          >
            <Trash2 size={11} /> Delete
          </button>
        ) : (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[11px] text-red-600 font-semibold">Permanently delete this appointment?</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              {deleting ? <Loader2 size={10} className="animate-spin" /> : null}
              Yes, Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Prescription toggle */}
      <button onClick={() => setOpen(v => !v)}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold border-t border-border transition-colors",
          open ? "bg-muted/20 text-muted-foreground" : appt.prescription?.photoObjectPath
            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "bg-muted/10 text-muted-foreground hover:bg-muted/20"
        )}>
        <ImageIcon size={11} />
        {open ? "Hide Prescription" : appt.prescription?.photoObjectPath ? "View / Update Prescription" : "Upload Prescription"}
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {open && (
        <div className="border-t border-border px-4 py-4">
          <PrescriptionUpload apptId={appt.id} prescription={appt.prescription}
            onUploaded={rx => onPrescriptionUploaded(appt.id, rx)} />
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────
export default function AdminAppointments() {
  // In-person state
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

  // Online state
  const [mainTab, setMainTab] = useState<"inperson" | "online">("inperson");
  const [onlineSubTab, setOnlineSubTab] = useState<"pending" | "completed">("pending");
  const [onlineAppts, setOnlineAppts] = useState<OnlineAppt[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [onlineErr, setOnlineErr] = useState("");
  const onlineIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevOnlineCountRef = useRef<number | null>(null);
  const [adminCall, setAdminCall] = useState<{ apptId: number; patientName: string } | null>(null);
  const [allPermissions, setAllPermissions] = useState<Record<number, ParticipantPerm[]>>({});

  // ── Load online appointments ──
  const loadOnline = useCallback(async (silent = false) => {
    if (!silent) setOnlineLoading(true);
    setOnlineErr("");
    try {
      const [list, settings] = await Promise.all([
        fetch(`${BASE}/api/online-appointments/admin`, { credentials: "include" }).then(r => r.json()),
        fetch(`${BASE}/api/admin/settings`, { credentials: "include" }).then(r => r.json()),
      ]);
      const appts: OnlineAppt[] = Array.isArray(list) ? list : [];
      // Play chime when new appointments arrive
      if (prevOnlineCountRef.current !== null && appts.length > prevOnlineCountRef.current) {
        playChime();
        notifyRef.current("New Online Appointment", `${appts.length - prevOnlineCountRef.current} new online booking(s)`);
      }
      prevOnlineCountRef.current = appts.length;
      setOnlineAppts(appts);
      setLastRefresh(new Date());
    } catch { if (!silent) setOnlineErr("Failed to load online appointments"); }
    finally { if (!silent) setOnlineLoading(false); }
  }, []);

  useEffect(() => {
    if (mainTab !== "online") return;
    loadOnline();
    onlineIntervalRef.current = setInterval(() => loadOnline(true), 5_000);
    return () => { if (onlineIntervalRef.current) clearInterval(onlineIntervalRef.current); };
  }, [mainTab, loadOnline]);

  // Real-time SSE for permission updates
  useEffect(() => {
    if (mainTab !== "online") return;
    const es = new EventSource(`${BASE}/api/online-appointments/admin/stream`, { withCredentials: true });
    es.addEventListener("appointment_updated", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setOnlineAppts(prev => prev.map(a => a.id === data.id ? { ...a, ...data } : a));
    });
    es.addEventListener("permission_update", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setAllPermissions(prev => ({ ...prev, [data.apptId]: data.participants }));
    });
    return () => es.close();
  }, [mainTab]);

  async function toggleJoin(id: number, enable: boolean) {
    try {
      await fetch(`${BASE}/api/online-appointments/admin/${id}/${enable ? "enable-join" : "disable-join"}`, {
        method: "POST", credentials: "include",
      });
      setOnlineAppts(prev => prev.map(a => a.id === id
        ? { ...a, joinEnabled: enable, patientJoinedAt: enable ? null : a.patientJoinedAt, status: enable ? "confirmed" : "completed" }
        : enable ? { ...a, joinEnabled: false } : a
      ));
      if (enable) playChime();
    } catch { setOnlineErr("Action failed. Please try again."); }
  }

  async function renotify(id: number) {
    try {
      // Re-fires the SSE event to the patient — chime + voice will replay on their device
      await fetch(`${BASE}/api/online-appointments/admin/${id}/enable-join`, {
        method: "POST", credentials: "include",
      });
    } catch { setOnlineErr("Re-notify failed. Please try again."); }
  }

  async function requestPermissions(id: number) {
    try {
      await fetch(`${BASE}/api/online-appointments/admin/${id}/request-permissions`, {
        method: "POST", credentials: "include",
      });
    } catch { setOnlineErr("Could not send the permission request. Please try again."); }
  }

  async function resetAppt(id: number) {
    try {
      await fetch(`${BASE}/api/online-appointments/admin/${id}/reset-pending`, {
        method: "POST", credentials: "include",
      });
      await loadOnline(true);
    } catch { setOnlineErr("Reset failed. Please try again."); }
  }

  async function markDone(id: number) {
    try {
      await fetch(`${BASE}/api/online-appointments/admin/${id}/complete`, {
        method: "PATCH", credentials: "include",
      });
      setOnlineAppts(prev => prev.map(a => a.id === id ? { ...a, joinEnabled: false, status: "completed" } : a));
    } catch { setOnlineErr("Could not mark as done. Please try again."); }
  }

  async function deleteAppt(id: number) {
    try {
      await fetch(`${BASE}/api/online-appointments/admin/${id}`, {
        method: "DELETE", credentials: "include",
      });
      setOnlineAppts(prev => prev.filter(a => a.id !== id));
    } catch { setOnlineErr("Delete failed. Please try again."); }
  }

  // ── Load in-person appointments ──
  async function fetchAppts() {
    setLoading(true);
    const url = filter !== "all" ? `/appointments?status=${filter}` : "/appointments";
    const data = await apiFetch(url);
    setAppts(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { fetchAppts(); }, [filter]);

  // SSE for in-person new appointments
  useEffect(() => {
    const es = new EventSource(`${API}/appointments/notifications`, { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "new_appointment") {
          const a: Appt = msg.appointment;
          setAppts(prev => [a, ...prev.filter(x => x.id !== a.id)]);
          notifyRef.current("New Appointment", `${a.patientName} — ${fmt(a.date)} ${a.timeSlot}`);
        }
      } catch {}
    };
    const poll = setInterval(() => fetchAppts(), 30000);
    return () => { es.close(); clearInterval(poll); };
  }, []);

  function mutate(updated: Appt) { setAppts(prev => prev.map(a => a.id === updated.id ? updated : a)); }
  async function approve(id: number) { mutate(await apiFetch(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status: "confirmed" }) })); }
  async function cancel(id: number) { if (!confirm("Cancel this appointment?")) return; mutate(await apiFetch(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) })); }
  async function arrive(id: number) { mutate(await apiFetch(`/appointments/${id}/arrive`, { method: "PATCH" })); }

  const today = todayIST();
  const pendingCount = appts.filter(a => a.status === "pending").length;
  const onlinePendingCount = onlineAppts.filter(a => ["pending", "confirmed"].includes(a.status) || a.joinEnabled).length;
  const onlineCompletedCount = onlineAppts.filter(a => ["completed", "cancelled"].includes(a.status) && !a.joinEnabled).length;
  const onlineLiveCount = onlineAppts.filter(a => a.joinEnabled).length;
  const todayAppts = appts.filter(a => a.date === today);
  const shown = filter === "all" ? appts : appts.filter(a => a.status === filter);

  // Online sub-tab filtering + sorting
  const onlinePendingList = [...onlineAppts]
    .filter(a => a.joinEnabled || ["pending", "confirmed"].includes(a.status))
    .sort((a, b) => {
      if (a.joinEnabled && !b.joinEnabled) return -1;
      if (!a.joinEnabled && b.joinEnabled) return 1;
      return a.slot.date.localeCompare(b.slot.date); // earliest first
    });
  const onlineCompletedList = [...onlineAppts]
    .filter(a => !a.joinEnabled && ["completed", "cancelled"].includes(a.status))
    .sort((a, b) => b.slot.date.localeCompare(a.slot.date)); // most recent first

  // Prescription pending alert: completed with no prescription
  const prescriptionPending = onlineAppts.filter(
    a => a.status === "completed" && !a.joinEnabled && !a.prescription?.photoObjectPath
  );

  return (
    <AdminLayout>
      {adminCall && (
        <AdminCallOverlay
          apptId={adminCall.apptId}
          patientName={adminCall.patientName}
          onLeave={() => setAdminCall(null)}
        />
      )}
      {payModal && <PayModal appt={payModal} onClose={() => setPayModal(null)} onPaid={a => { mutate(a); setPayModal(null); }} />}
      {rescheduleModal && <RescheduleModal appt={rescheduleModal} onClose={() => setRescheduleModal(null)} onProposed={a => { mutate(a); }} />}
      {followUpModal && <FollowUpModal appt={followUpModal} onClose={() => setFollowUpModal(null)} onSet={a => { mutate(a); }} />}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Appointments</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 font-medium bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-200">
                <Clock size={11} /> {pendingCount} in-person pending
              </span>
            )}
            {onlinePendingCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-blue-700 font-medium bg-blue-100 px-2.5 py-0.5 rounded-full border border-blue-200">
                <Video size={11} /> {onlinePendingCount} online pending
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mainTab === "inperson" && (
            <button onClick={requestPermission}
              className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors",
                permission === "granted" ? "bg-green-50 text-green-700 border-green-200" : "bg-muted text-muted-foreground border-border hover:border-primary/40")}>
              {permission === "granted" ? <Bell size={14} /> : <BellOff size={14} />}
              {permission === "granted" ? "Notifs On" : "Enable Notifs"}
            </button>
          )}
          <button onClick={() => mainTab === "inperson" ? fetchAppts() : loadOnline()}
            className="p-2 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors" title="Refresh">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Main type tabs */}
      <div className="flex gap-2 mb-6 bg-muted/40 rounded-2xl p-1 border border-border">
        <button onClick={() => setMainTab("inperson")}
          className={cn("flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2",
            mainTab === "inperson" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
          <MapPin size={14} /> In-Person
          {pendingCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{pendingCount}</span>
          )}
        </button>
        <button onClick={() => setMainTab("online")}
          className={cn("flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2",
            mainTab === "online" ? "bg-white shadow-sm text-blue-700" : "text-muted-foreground hover:text-foreground")}>
          <Video size={14} /> Online
          {onlinePendingCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">{onlinePendingCount} new</span>
          )}
          {onlineLiveCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </button>
      </div>

      {/* ── ONLINE TAB ───────────────────────────────────────────── */}
      {mainTab === "online" && (
        <div className="space-y-4">
          {/* Auto-refresh bar */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Auto-refreshes every 20s</span>
            <span>Last: {lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
          </div>

          {/* Prescription pending alert */}
          {prescriptionPending.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl px-4 py-3 flex items-start gap-3">
              <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-800">
                  {prescriptionPending.length === 1
                    ? "1 completed appointment has no prescription uploaded yet"
                    : `${prescriptionPending.length} completed appointments have no prescription uploaded yet`}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {prescriptionPending.map(a => a.patient.name).join(", ")} — please upload the prescription photo in the Completed tab.
                </p>
              </div>
            </div>
          )}

          {/* Live session badge */}
          {onlineLiveCount > 0 && (
            <div className="bg-emerald-600 text-white rounded-2xl px-4 py-3 flex items-center gap-3">
              <Video size={16} className="animate-pulse shrink-0" />
              <div>
                <p className="font-bold text-sm">{onlineLiveCount === 1 ? "1 Session Live Now" : `${onlineLiveCount} Sessions Live Now`}</p>
                <p className="text-white/70 text-xs">{onlinePendingList.filter(a => a.joinEnabled).map(a => a.patient.name).join(", ")}</p>
              </div>
            </div>
          )}

          {onlineErr && (
            <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-red-700">
              <AlertCircle size={14} /> {onlineErr}
            </div>
          )}

          {/* ── Sub-tabs: Pending / Completed ── */}
          <div className="flex gap-2 bg-muted/40 rounded-xl p-1 border border-border">
            <button onClick={() => setOnlineSubTab("pending")}
              className={cn(
                "flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2",
                onlineSubTab === "pending" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}>
              <Clock size={13} /> Pending
              {onlinePendingCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {onlinePendingCount}
                </span>
              )}
              {onlineLiveCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>
            <button onClick={() => setOnlineSubTab("completed")}
              className={cn(
                "flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2",
                onlineSubTab === "completed" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}>
              <CheckCircle2 size={13} /> Completed
              {onlineCompletedCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {onlineCompletedCount}
                </span>
              )}
              {prescriptionPending.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {prescriptionPending.length} Rx pending
                </span>
              )}
            </button>
          </div>

          {onlineLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : onlineSubTab === "pending" ? (
            onlinePendingList.length === 0 ? (
              <div className="bg-white rounded-2xl border border-border p-12 text-center">
                <CheckCircle2 size={40} className="text-emerald-200 mx-auto mb-3" />
                <p className="font-semibold text-muted-foreground">No pending appointments</p>
                <p className="text-xs text-muted-foreground mt-1">All online appointments are completed</p>
              </div>
            ) : (
              <div className="space-y-3">
                {onlinePendingList.map(appt => (
                  <OnlineApptCard
                    key={appt.id} appt={appt}
                    permissions={allPermissions[appt.id] ?? appt.permissions ?? []}
                    onJoinToggle={toggleJoin}
                    onRenotify={renotify}
                    onPrescriptionUploaded={(id, rx) => setOnlineAppts(prev => prev.map(a => a.id === id ? { ...a, prescription: rx } : a))}
                    onJoinCall={(id, name) => setAdminCall({ apptId: id, patientName: name })}
                    onRequestPermissions={requestPermissions}
                    onReset={resetAppt}
                    onMarkDone={markDone}
                    onDelete={deleteAppt}
                  />
                ))}
              </div>
            )
          ) : (
            onlineCompletedList.length === 0 ? (
              <div className="bg-white rounded-2xl border border-border p-12 text-center">
                <Video size={40} className="text-muted-foreground/20 mx-auto mb-3" />
                <p className="font-semibold text-muted-foreground">No completed appointments yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {onlineCompletedList.map(appt => (
                  <OnlineApptCard
                    key={appt.id} appt={appt}
                    permissions={allPermissions[appt.id] ?? appt.permissions ?? []}
                    onJoinToggle={toggleJoin}
                    onRenotify={renotify}
                    onPrescriptionUploaded={(id, rx) => setOnlineAppts(prev => prev.map(a => a.id === id ? { ...a, prescription: rx } : a))}
                    onJoinCall={(id, name) => setAdminCall({ apptId: id, patientName: name })}
                    onRequestPermissions={requestPermissions}
                    onReset={resetAppt}
                    onMarkDone={markDone}
                    onDelete={deleteAppt}
                  />
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* ── IN-PERSON TAB ────────────────────────────────────────── */}
      {mainTab === "inperson" && (
        <div className="space-y-5">
          {/* Today summary */}
          {todayAppts.length > 0 && (
            <div className="bg-[#1a3d2b]/5 border border-[#1a3d2b]/15 rounded-2xl p-4">
              <p className="text-[#1a3d2b] font-semibold text-sm flex items-center gap-2 mb-2">
                <Calendar size={14} /> Today — {todayAppts.length} appointment{todayAppts.length !== 1 && "s"}
              </p>
              <div className="flex flex-wrap gap-2">
                {todayAppts.map(a => (
                  <span key={a.id} className={cn("text-xs px-3 py-1 rounded-full border font-medium", STATUS_COLORS[a.status] || STATUS_COLORS.pending)}>
                    {a.timeSlot} · {a.patientName}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-2">
            {["all", "pending", "confirmed", "arrived", "completed", "reschedule_proposed", "cancelled"].map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className={cn("px-3 py-1.5 rounded-xl text-sm font-medium transition-colors border capitalize",
                  filter === s ? "bg-foreground text-white border-foreground" : "bg-white border-border text-muted-foreground hover:border-primary/40")}>
                {STATUS_LABELS[s] || s}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="space-y-3">
            {loading ? (
              <div className="py-16 text-center text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" /> Loading…
              </div>
            ) : shown.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground bg-white rounded-2xl border border-border">
                No appointments found
              </div>
            ) : shown.map(a => {
              const isExpanded = expanded === a.id;
              const reschedDates: string[] = a.rescheduleDates ? JSON.parse(a.rescheduleDates) : [];
              return (
                <div key={a.id} className={cn("bg-white rounded-2xl border shadow-sm overflow-hidden transition-all",
                  a.status === "pending" ? "border-yellow-300 ring-1 ring-yellow-200" : "border-border")}>
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
                    <div className="flex items-center gap-2 flex-wrap">
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
                      {a.status === "arrived" && a.paymentStatus === "unpaid" && (
                        <button onClick={() => setPayModal(a)}
                          className="flex items-center gap-1.5 bg-primary text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-primary/90 transition-colors">
                          <Banknote size={13} /> Mark Paid
                        </button>
                      )}
                      {a.status === "completed" && (
                        <button onClick={() => setFollowUpModal(a)}
                          className="flex items-center gap-1.5 border border-border text-muted-foreground text-xs font-medium px-3 py-2 rounded-xl hover:bg-muted transition-colors">
                          <Calendar size={13} /> {a.followUpDate ? "Edit Follow-up" : "Set Follow-up"}
                        </button>
                      )}
                      {a.status === "reschedule_accepted" && (
                        <button onClick={() => approve(a.id)}
                          className="flex items-center gap-1.5 bg-purple-600 text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-purple-700 transition-colors">
                          <CheckCircle2 size={13} /> Confirm New Date
                        </button>
                      )}
                      <button onClick={() => setExpanded(isExpanded ? null : a.id)}
                        className="p-2 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-border bg-muted/30 p-4 space-y-2.5 text-sm">
                      {a.reason && <div><span className="font-medium">Reason: </span>{a.reason}</div>}
                      {a.patientEmail && <div><span className="font-medium">Email: </span>{a.patientEmail}</div>}
                      {a.arrivedAt && <div className="text-teal-700"><span className="font-medium">Arrived: </span>{fmtTimeIST(a.arrivedAt)}</div>}
                      {a.paymentStatus === "paid" && <div className="text-green-700"><span className="font-medium">Payment: </span>Paid via {a.paymentMode?.toUpperCase()}</div>}
                      {a.followUpDate && <div className="text-amber-700"><span className="font-medium">Follow-up: </span>{fmt(a.followUpDate)} {a.followUpConfirmed ? "✓ Patient confirmed" : "⏳ Awaiting"}</div>}
                      {reschedDates.length > 0 && (
                        <div><span className="font-medium">Proposed dates: </span>{reschedDates.map(fmt).join(", ")}
                          {a.rescheduleChosen && <span className="text-purple-700 ml-2">→ Chose: {fmt(a.rescheduleChosen)}</span>}
                        </div>
                      )}
                      {a.notes && <div><span className="font-medium">Notes: </span>{a.notes}</div>}
                      <div className="text-xs text-muted-foreground">Booked: {fmtTimestamp(a.createdAt)}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AdminToastContainer toasts={toasts} onDismiss={dismissToast} />
    </AdminLayout>
  );
}
