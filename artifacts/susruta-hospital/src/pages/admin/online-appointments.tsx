import React, { useState, useEffect, useCallback, useRef } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Video, User, Calendar, Clock, RefreshCw, CheckCircle2, AlertCircle,
  Loader2, FileText, ChevronDown, ChevronUp, ImageIcon, Upload, Camera,
  ExternalLink, X, Play, Square, Link, Edit2, Save
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function adminFetch(path: string, opts: RequestInit = {}) {
  const r = await fetch(`${BASE}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw data;
  return data;
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
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

type DocFile = { name: string; objectPath: string; contentType: string; size: number };
type Prescription = { photoObjectPath: string | null; notes: string | null; updatedAt: string };
type OnlineAppt = {
  id: number; status: string; reason: string | null;
  documents: DocFile[]; joinEnabled: boolean; joinEnabledAt: string | null; createdAt: string;
  slot: { id: number; date: string; startTime: string; endTime: string };
  patient: { id: number; patientCode: string | null; name: string; email: string; phone: string | null };
  prescription: Prescription | null;
};

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-700 border-amber-200",
  confirmed: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};

// ── Prescription Upload ─────────────────────────────────────────
function PrescriptionUpload({ apptId, prescription, onUploaded }: {
  apptId: number; prescription: Prescription | null; onUploaded: (rx: Prescription) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [err, setErr] = useState("");

  function handleFile(file: File) { setErr(""); setPreview(URL.createObjectURL(file)); setPendingFile(file); }

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
      const saveRes = await adminFetch(`/online-appointments/admin/${apptId}/prescription`, {
        method: "PUT", body: JSON.stringify({ photoObjectPath: objectPath }),
      });
      setPreview(null); setPendingFile(null);
      onUploaded(saveRes);
    } catch (e: any) {
      setErr(e.message || "Upload failed");
    } finally { setUploading(false); }
  }

  return (
    <div className="space-y-3">
      {prescription?.photoObjectPath && !preview && (
        <div className="bg-gray-50 rounded-xl overflow-hidden border border-border">
          <img src={`${BASE}/api/storage${prescription.photoObjectPath}`} alt="Rx" className="w-full max-h-40 object-contain" />
        </div>
      )}
      {preview && (
        <div className="space-y-2">
          <div className="bg-gray-50 rounded-xl overflow-hidden border-2 border-[#1a3d2b]/30">
            <img src={preview} alt="Preview" className="w-full max-h-48 object-contain" />
          </div>
          <div className="flex gap-2">
            <button onClick={confirmUpload} disabled={uploading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#1a3d2b] text-white font-bold rounded-xl text-sm hover:bg-[#1a3d2b]/90 disabled:opacity-60 transition-colors">
              {uploading ? <><Loader2 size={13} className="animate-spin" /> Uploading…</> : <><CheckCircle2 size={13} /> Upload</>}
            </button>
            <button onClick={() => { setPreview(null); setPendingFile(null); }} disabled={uploading}
              className="px-3 py-2 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted/40 disabled:opacity-60 transition-colors">
              <X size={13} />
            </button>
          </div>
        </div>
      )}
      {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 flex items-center gap-1"><AlertCircle size={11} />{err}</p>}
      {!preview && (
        <div className="flex gap-2">
          <label className="flex-1 flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-[#1a3d2b]/30 rounded-xl text-xs text-[#1a3d2b] font-semibold cursor-pointer hover:bg-[#1a3d2b]/5 transition-colors">
            <Camera size={13} /> Camera
            <input type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
          <label className="flex-1 flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-border rounded-xl text-xs text-muted-foreground font-semibold cursor-pointer hover:bg-muted/30 transition-colors">
            <Upload size={13} /> {prescription?.photoObjectPath ? "Replace" : "Upload"}
            <input type="file" accept="image/*,application/pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
        </div>
      )}
    </div>
  );
}

// ── Appointment Card ────────────────────────────────────────────
function ApptCard({ appt, meetingLink, onJoinToggle, onPrescriptionUploaded }: {
  appt: OnlineAppt; meetingLink: string | null;
  onJoinToggle: (id: number, enable: boolean) => Promise<void>;
  onPrescriptionUploaded: (id: number, rx: Prescription) => void;
}) {
  const [open, setOpen] = useState(appt.joinEnabled);
  const [toggling, setToggling] = useState(false);
  const sc = STATUS_COLORS[appt.status] ?? STATUS_COLORS.confirmed;

  async function toggleJoin() {
    setToggling(true);
    await onJoinToggle(appt.id, !appt.joinEnabled);
    setToggling(false);
  }

  const noLink = !meetingLink && !appt.joinEnabled;

  return (
    <div className={cn(
      "bg-white rounded-2xl border overflow-hidden shadow-sm transition-all",
      appt.joinEnabled ? "border-emerald-400 ring-2 ring-emerald-100" : "border-border"
    )}>
      {/* Header row */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Patient ID badge */}
          <div className={cn(
            "w-14 h-14 rounded-xl flex items-center justify-center shrink-0 border-2",
            appt.patient.patientCode
              ? "bg-[#1a3d2b]/5 border-[#1a3d2b]/20"
              : appt.joinEnabled ? "bg-emerald-50 border-emerald-200" : "bg-blue-50 border-blue-100"
          )}>
            {appt.patient.patientCode ? (
              <span className="font-black text-[#1a3d2b] text-sm font-mono">{appt.patient.patientCode}</span>
            ) : (
              <User size={20} className="text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-bold text-base text-foreground">{appt.patient.name}</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {appt.joinEnabled ? (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-600 text-white animate-pulse">
                  🟢 Live — Session Active
                </span>
              ) : (
                <span className={cn("text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border", sc)}>
                  {appt.status}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Calendar size={11} className="text-[#1a3d2b]" />{fmtDate(appt.slot.date)}</span>
              <span className="flex items-center gap-1"><Clock size={11} />{fmtTime(appt.slot.startTime)} – {fmtTime(appt.slot.endTime)}</span>
              {appt.patient.phone && <span>{appt.patient.phone}</span>}
            </div>
          </div>

          <button
            onClick={e => { e.stopPropagation(); toggleJoin(); }}
            disabled={toggling || noLink}
            title={noLink ? "Set a meeting link above first" : appt.joinEnabled ? "End session for this patient" : "Enable join for this patient"}
            className={cn(
              "shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm",
              appt.joinEnabled
                ? "bg-red-100 text-red-700 hover:bg-red-200 border border-red-200"
                : noLink
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                  : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200"
            )}>
            {toggling ? <Loader2 size={12} className="animate-spin" /> : appt.joinEnabled ? <Square size={12} /> : <Play size={12} />}
            {appt.joinEnabled ? "End Session" : "Enable Join"}
          </button>
        </div>

        {/* Reason */}
        {appt.reason && (
          <p className="mt-3 text-xs text-muted-foreground bg-muted/30 rounded-xl px-3 py-2">
            <span className="font-semibold text-foreground">Reason: </span>{appt.reason}
          </p>
        )}

        {/* Documents */}
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

      {/* Prescription toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold border-t border-border transition-colors",
          open
            ? "bg-muted/20 text-muted-foreground hover:text-foreground"
            : appt.prescription?.photoObjectPath
              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "bg-muted/10 text-muted-foreground hover:bg-muted/20"
        )}
      >
        <ImageIcon size={11} />
        {open ? "Hide Prescription" : appt.prescription?.photoObjectPath ? "View / Update Prescription" : "Upload Prescription"}
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {/* Prescription upload */}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="border-t border-border px-4 py-4">
              <PrescriptionUpload
                apptId={appt.id}
                prescription={appt.prescription}
                onUploaded={rx => onPrescriptionUploaded(appt.id, rx)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Inline Meeting Link Editor ──────────────────────────────────
function MeetingLinkBar({ meetingLink, onSaved }: { meetingLink: string | null; onSaved: (link: string) => void }) {
  const [editing, setEditing] = useState(!meetingLink);
  const [value, setValue] = useState(meetingLink ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    const trimmed = value.trim();
    if (!trimmed) { setErr("Enter a valid meeting link"); return; }
    setSaving(true); setErr("");
    try {
      await adminFetch("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ meetingLink: trimmed }),
      });
      onSaved(trimmed);
      setEditing(false);
    } catch {
      setErr("Failed to save. Try again.");
    } finally { setSaving(false); }
  }

  if (editing) {
    return (
      <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2 flex items-center gap-1.5">
          <Link size={12} /> Default Meeting Link
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          Set your Google Meet or Zoom link once — it will be sent to patients automatically when you click "Enable Join".
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === "Enter" && save()}
            placeholder="https://meet.google.com/xxx-xxxx-xxx"
            className="flex-1 text-sm border border-border rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b]/50 bg-muted/20"
          />
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[#1a3d2b] text-white font-bold rounded-xl text-sm hover:bg-[#1a3d2b]/90 disabled:opacity-60 transition-colors shrink-0">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save
          </button>
          {meetingLink && (
            <button onClick={() => { setEditing(false); setValue(meetingLink); }}
              className="px-3 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted/40 transition-colors">
              <X size={13} />
            </button>
          )}
        </div>
        {err && <p className="text-xs text-red-600 mt-2 flex items-center gap-1"><AlertCircle size={11} />{err}</p>}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-blue-200 shadow-sm px-4 py-3.5 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
        <Link size={16} className="text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-0.5">Active Meeting Link</p>
        <a href={meetingLink!} target="_blank" rel="noopener noreferrer"
          className="text-sm text-blue-700 font-medium hover:underline truncate block flex items-center gap-1">
          {meetingLink} <ExternalLink size={11} className="inline shrink-0" />
        </a>
      </div>
      <button onClick={() => setEditing(true)}
        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-xl transition-colors shrink-0"
        title="Edit meeting link">
        <Edit2 size={14} />
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function AdminOnlineAppointments() {
  const [appts, setAppts] = useState<OnlineAppt[]>([]);
  const [meetingLink, setMeetingLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErr("");
    try {
      const [list, settings] = await Promise.all([
        adminFetch("/online-appointments/admin"),
        adminFetch("/admin/settings"),
      ]);
      setAppts(list);
      setMeetingLink(settings.meetingLink ?? null);
      setLastRefresh(new Date());
    } catch {
      if (!silent) setErr("Failed to load appointments");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh every 20 seconds
    intervalRef.current = setInterval(() => load(true), 20_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load]);

  async function toggleJoin(id: number, enable: boolean) {
    try {
      await adminFetch(`/online-appointments/admin/${id}/${enable ? "enable-join" : "disable-join"}`, { method: "POST" });
      setAppts(prev => prev.map(a => a.id === id
        ? { ...a, joinEnabled: enable, status: enable ? "confirmed" : "completed" }
        : enable ? { ...a, joinEnabled: false } : a
      ));
      if (enable) playChime();
    } catch {
      setErr("Action failed. Please try again.");
    }
  }

  function handlePrescriptionUploaded(id: number, rx: Prescription) {
    setAppts(prev => prev.map(a => a.id === id ? { ...a, prescription: rx } : a));
  }

  const sorted = [...appts].sort((a, b) => {
    if (a.joinEnabled && !b.joinEnabled) return -1;
    if (!a.joinEnabled && b.joinEnabled) return 1;
    return b.slot.date.localeCompare(a.slot.date);
  });

  const liveCount = appts.filter(a => a.joinEnabled).length;
  const pendingCount = appts.filter(a => a.status === "pending").length;

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-foreground">Online Consultations</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {appts.length} total · {liveCount > 0 ? `${liveCount} live` : "none live"} ·{" "}
              <span className="text-[11px] text-muted-foreground/70">
                refreshes every 20s · last at {lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </p>
          </div>
          <button onClick={() => load()} className="p-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted/40 transition-colors" title="Refresh now">
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Meeting link editor */}
        <MeetingLinkBar meetingLink={meetingLink} onSaved={link => setMeetingLink(link)} />

        {/* Live session indicator */}
        {liveCount > 0 && (
          <div className="bg-emerald-600 text-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-lg shadow-emerald-100">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Video size={18} className="animate-pulse" />
            </div>
            <div className="flex-1">
              <p className="font-extrabold text-sm">
                {liveCount === 1 ? "1 Session Active" : `${liveCount} Sessions Active`}
              </p>
              <p className="text-white/75 text-xs">
                {sorted.filter(a => a.joinEnabled).map(a => a.patient.name).join(", ")}
              </p>
            </div>
          </div>
        )}

        {/* Pending badge */}
        {pendingCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <AlertCircle size={18} className="text-amber-600 shrink-0" />
            <p className="text-sm text-amber-700 font-medium">
              <span className="font-bold">{pendingCount}</span> appointment{pendingCount > 1 ? "s" : ""} pending approval
            </p>
          </div>
        )}

        {err && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle size={14} /> {err}
          </div>
        )}

        {/* Appointments list */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-12 text-center">
            <Video size={40} className="text-muted-foreground/20 mx-auto mb-3" />
            <p className="font-semibold text-muted-foreground">No online appointments yet</p>
            <p className="text-xs text-muted-foreground mt-1">Patients can book through the patient portal</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map(appt => (
              <ApptCard
                key={appt.id}
                appt={appt}
                meetingLink={meetingLink}
                onJoinToggle={toggleJoin}
                onPrescriptionUploaded={handlePrescriptionUploaded}
              />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
