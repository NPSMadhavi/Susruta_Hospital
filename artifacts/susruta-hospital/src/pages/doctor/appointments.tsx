import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  LogOut, FileText, CheckCircle2, AlertCircle,
  Loader2, User, Calendar, Clock, RefreshCw, Video,
  Camera, Upload, X, Download, MapPin, Phone, Mail,
  ImageIcon, ChevronDown, ChevronUp
} from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function doctorFetch(path: string, opts: RequestInit = {}) {
  const r = await fetch(`${BASE}/api/doctor${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw data;
  return data;
}

type DocFile = { name: string; objectPath: string; contentType: string; size: number };
type Prescription = { id?: number; photoObjectPath: string | null; notes: string | null; updatedAt: string };
type PatientInfo = { id: number | null; patientCode: string | null; name: string; email: string | null; phone: string | null };

type OnlineAppt = {
  id: number; type: "online"; status: string; reason: string | null;
  documents: DocFile[]; joinEnabled: boolean; createdAt: string;
  date: string; timeLabel: string; slotId: number; patient: PatientInfo;
  prescription: Prescription | null;
};
type OfflineAppt = {
  id: number; type: "offline"; status: string; reason: string | null;
  date: string; timeLabel: string; patient: PatientInfo; prescription: null; notes: string | null;
};

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function fmtDateShort(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-700 border-blue-200",
  arrived:   "bg-teal-100 text-teal-700 border-teal-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pending:   "bg-amber-100 text-amber-700 border-amber-200",
  cancelled: "bg-gray-100 text-gray-400 border-gray-200",
};

// ── Prescription Upload ─────────────────────────────────────────
function PrescriptionUpload({ apptId, prescription, onUploaded }: {
  apptId: number; prescription: Prescription | null; onUploaded: (rx: Prescription) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setErr("");
    setPreview(URL.createObjectURL(file));
    setPendingFile(file);
  }

  async function confirmUpload() {
    if (!pendingFile) return;
    setUploading(true);
    setErr("");
    try {
      const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pendingFile.name, contentType: pendingFile.type, size: pendingFile.size }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();
      const upRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": pendingFile.type }, body: pendingFile });
      if (!upRes.ok) throw new Error("Upload failed");
      const saveRes = await fetch(`${BASE}/api/online-appointments/doctor/${apptId}/prescription`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoObjectPath: objectPath }),
      });
      if (!saveRes.ok) throw new Error("Failed to save prescription");
      const rx = await saveRes.json();
      setPreview(null); setPendingFile(null);
      onUploaded(rx);
    } catch (e: any) {
      setErr(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Existing prescription photo */}
      {prescription?.photoObjectPath && !preview && (
        <div>
          <div className="bg-gray-50 rounded-xl border border-border overflow-hidden">
            <img src={`${BASE}/api/storage${prescription.photoObjectPath}`} alt="Prescription" className="w-full max-h-56 object-contain" />
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-[11px] text-muted-foreground">
              Uploaded {new Date(prescription.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </p>
            <a href={`${BASE}/api/storage${prescription.photoObjectPath}`} download target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1">
              <Download size={10} /> Download
            </a>
          </div>
        </div>
      )}

      {/* Preview before confirm */}
      {preview && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preview — confirm before uploading</p>
          <div className="bg-gray-50 rounded-xl border-2 border-[#1a3d2b]/30 overflow-hidden">
            <img src={preview} alt="Preview" className="w-full max-h-64 object-contain" />
          </div>
          <div className="flex gap-2">
            <button onClick={confirmUpload} disabled={uploading}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#1a3d2b] text-white font-bold rounded-xl text-sm hover:bg-[#1a3d2b]/90 disabled:opacity-60 transition-colors">
              {uploading ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> : <><CheckCircle2 size={14} /> Confirm & Upload</>}
            </button>
            <button onClick={() => { setPreview(null); setPendingFile(null); if (fileRef.current) fileRef.current.value = ""; if (cameraRef.current) cameraRef.current.value = ""; }}
              disabled={uploading}
              className="px-4 py-3 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted/40 disabled:opacity-60 transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 flex items-center gap-1.5"><AlertCircle size={12} />{err}</p>}

      {!preview && (
        <div className="flex gap-2">
          <label className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1a3d2b]/30 rounded-xl text-sm text-[#1a3d2b] font-semibold cursor-pointer hover:bg-[#1a3d2b]/5 transition-colors">
            <Camera size={15} /> Take Photo
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
          <label className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground font-semibold cursor-pointer hover:bg-muted/30 transition-colors">
            <Upload size={15} /> {prescription?.photoObjectPath ? "Replace" : "Upload File"}
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
        </div>
      )}
    </div>
  );
}

// ── Online Appointment Card ─────────────────────────────────────
function OnlineCard({ appt, onPrescriptionUploaded }: {
  appt: OnlineAppt; onPrescriptionUploaded: (id: number, rx: Prescription) => void;
}) {
  const [open, setOpen] = useState(false);
  const sc = STATUS_STYLES[appt.status] ?? STATUS_STYLES.confirmed;

  return (
    <div className={cn(
      "bg-white rounded-2xl border overflow-hidden shadow-sm transition-all",
      appt.joinEnabled ? "border-emerald-400 ring-2 ring-emerald-100" : "border-border"
    )}>
      {/* Card header — always visible */}
      <div className="px-4 pt-4 pb-3">
        {/* Top row: patient ID + status badges */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Big patient ID badge */}
            <div className={cn(
              "w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0 border-2",
              appt.patient.patientCode
                ? "bg-[#1a3d2b]/5 border-[#1a3d2b]/20"
                : appt.joinEnabled ? "bg-emerald-50 border-emerald-200" : "bg-blue-50 border-blue-100"
            )}>
              {appt.patient.patientCode ? (
                <span className="font-black text-[#1a3d2b] text-sm leading-tight font-mono">{appt.patient.patientCode}</span>
              ) : (
                <User size={20} className="text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base text-foreground truncate">{appt.patient.name}</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                  Online
                </span>
                <span className={cn("text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border", sc)}>
                  {appt.status}
                </span>
                {appt.joinEnabled && (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-600 text-white animate-pulse">
                    🟢 Live
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={() => setOpen(v => !v)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded-xl transition-colors shrink-0">
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>

        {/* Date + contact row */}
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar size={11} className="text-[#1a3d2b]" /> {fmtDate(appt.date)}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={11} className="text-[#1a3d2b]" /> {appt.timeLabel}
          </span>
          {appt.patient.phone && (
            <span className="flex items-center gap-1">
              <Phone size={11} /> {appt.patient.phone}
            </span>
          )}
        </div>

        {/* Reason — always shown */}
        {appt.reason && (
          <p className="mt-2.5 text-xs text-muted-foreground bg-muted/30 rounded-xl px-3 py-2">
            <span className="font-semibold text-foreground">Reason: </span>{appt.reason}
          </p>
        )}

        {/* Docs pill row */}
        {appt.documents.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {appt.documents.map((d, i) => (
              <a key={i} href={`${BASE}/api/storage${d.objectPath}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] bg-blue-50 border border-blue-100 text-blue-700 px-2.5 py-1 rounded-lg font-medium hover:bg-blue-100 transition-colors">
                <FileText size={10} /> {d.name}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Prescription section — collapsible */}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="border-t border-border px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <ImageIcon size={11} /> Prescription
              </p>
              <PrescriptionUpload
                apptId={appt.id}
                prescription={appt.prescription}
                onUploaded={rx => onPrescriptionUploaded(appt.id, rx)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expand prescription toggle (always show at bottom) */}
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
    </div>
  );
}

// ── Physical Appointment Card ───────────────────────────────────
function OfflineCard({ appt }: { appt: OfflineAppt }) {
  const sc = STATUS_STYLES[appt.status] ?? STATUS_STYLES.pending;

  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm px-4 py-4">
      <div className="flex items-start gap-3">
        {/* Patient ID badge */}
        <div className={cn(
          "w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0 border-2",
          appt.patient.patientCode ? "bg-[#1a3d2b]/5 border-[#1a3d2b]/20" : "bg-gray-50 border-gray-200"
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
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">
              In-Person
            </span>
            <span className={cn("text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border", sc)}>
              {appt.status}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 mt-2.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Calendar size={11} className="text-green-600" />{fmtDate(appt.date)}</span>
            <span className="flex items-center gap-1"><Clock size={11} />{appt.timeLabel}</span>
            {appt.patient.phone && <span className="flex items-center gap-1"><Phone size={11} />{appt.patient.phone}</span>}
          </div>
          {appt.reason && (
            <p className="mt-2.5 text-xs text-muted-foreground bg-muted/30 rounded-xl px-3 py-2">
              <span className="font-semibold text-foreground">Reason: </span>{appt.reason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function DoctorAppointments() {
  const [, nav] = useLocation();
  const [online, setOnline] = useState<OnlineAppt[]>([]);
  const [offline, setOffline] = useState<OfflineAppt[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"online" | "offline">("online");
  const [err, setErr] = useState("");
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await doctorFetch("/all-appointments");
      setOnline(data.online ?? []);
      setOffline(data.offline ?? []);
      setLastRefresh(new Date());
      setErr("");
    } catch (e: any) {
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

  async function logout() {
    await doctorFetch("/logout", { method: "POST" });
    nav("/doctor");
  }

  function handlePrescriptionUploaded(apptId: number, rx: Prescription) {
    setOnline(prev => prev.map(a => a.id === apptId ? { ...a, prescription: rx } : a));
  }

  const liveAppts = online.filter(a => a.joinEnabled);
  const sortedOnline = [...online].sort((a, b) => {
    if (a.joinEnabled && !b.joinEnabled) return -1;
    if (!a.joinEnabled && b.joinEnabled) return 1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
  const sortedOffline = [...offline].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="min-h-screen bg-[#f4f7f5]">
      {/* Header */}
      <header className="bg-[#1a3d2b] shadow-lg sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src={logoImg} alt="" className="h-9 brightness-0 invert" />
          <div className="flex-1">
            <p className="text-white/60 text-[11px] font-medium uppercase tracking-wide leading-none">Doctor Portal</p>
            <p className="text-white font-bold text-sm">Dr. P. Murali Krishna</p>
          </div>
          <div className="flex items-center gap-1.5">
            <p className="text-white/40 text-[10px] hidden sm:block">
              Updated {lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <button onClick={() => load()} className="p-2 text-white/60 hover:text-white rounded-xl hover:bg-white/10 transition-colors" title="Refresh">
              <RefreshCw size={15} />
            </button>
            <button onClick={logout} className="p-2 text-white/60 hover:text-red-300 rounded-xl hover:bg-white/10 transition-colors" title="Logout">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {/* Live session alert */}
        {liveAppts.length > 0 && (
          <div className="bg-emerald-600 text-white rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Video size={18} className="animate-pulse" />
            </div>
            <div>
              <p className="font-bold text-sm">Session Active</p>
              <p className="text-white/75 text-xs">
                {liveAppts.map(a => a.patient.name).join(", ")} — consultation in progress
              </p>
            </div>
          </div>
        )}

        {err && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle size={14} /> {err}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1.5 bg-white rounded-2xl p-1.5 border border-border shadow-sm">
          {[
            { key: "online", label: "Online Consultations", count: online.length, icon: <Video size={14} /> },
            { key: "offline", label: "In-Person Visits", count: offline.length, icon: <MapPin size={14} /> },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
                tab === t.key ? "bg-[#1a3d2b] text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              )}>
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.key === "online" ? "Online" : "In-Person"}</span>
              <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-bold",
                tab === t.key ? "bg-white/20 text-white" : "bg-muted text-muted-foreground")}>
                {t.count}
              </span>
              {t.key === "online" && liveAppts.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-[#1a3d2b]/40" />
          </div>
        ) : tab === "online" ? (
          sortedOnline.length === 0 ? (
            <div className="bg-white rounded-2xl border border-border p-10 text-center">
              <Video size={36} className="text-muted-foreground/20 mx-auto mb-3" />
              <p className="font-semibold text-muted-foreground">No online consultations yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedOnline.map(appt => (
                <OnlineCard
                  key={appt.id}
                  appt={appt}
                  onPrescriptionUploaded={handlePrescriptionUploaded}
                />
              ))}
            </div>
          )
        ) : (
          sortedOffline.length === 0 ? (
            <div className="bg-white rounded-2xl border border-border p-10 text-center">
              <MapPin size={36} className="text-muted-foreground/20 mx-auto mb-3" />
              <p className="font-semibold text-muted-foreground">No in-person appointments yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedOffline.map(appt => (
                <OfflineCard key={appt.id} appt={appt} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
