import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Stethoscope, LogOut, FileText, CheckCircle2, AlertCircle,
  Loader2, User, Calendar, Clock, RefreshCw, Video,
  Camera, Upload, ImageIcon, X, ChevronDown, ChevronUp, ZoomIn, Download
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
  date: string; timeLabel: string; patient: PatientInfo; prescription: null;
  notes: string | null;
};

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-700 border-blue-200",
  arrived: "bg-teal-100 text-teal-700 border-teal-200",
  reschedule_accepted: "bg-purple-100 text-purple-700 border-purple-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};

// ── Prescription Upload Component ─────────────────────────────
function PrescriptionUpload({ apptId, prescription, isDoctor, onUploaded }: {
  apptId: number;
  prescription: Prescription | null;
  isDoctor: boolean;
  onUploaded: (rx: Prescription) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setErr("");
    setPreview(URL.createObjectURL(file));
    setPendingFile(file);
  }

  async function confirmUpload() {
    if (!pendingFile) return;
    setUploading(true);
    setErr("");
    try {
      // 1. Get pre-signed URL
      const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pendingFile.name, contentType: pendingFile.type, size: pendingFile.size }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

      // 2. Upload to storage
      const upRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": pendingFile.type },
        body: pendingFile,
      });
      if (!upRes.ok) throw new Error("Upload to storage failed");

      // 3. Save to prescription record
      const endpoint = isDoctor
        ? `/api/online-appointments/doctor/${apptId}/prescription`
        : `/api/online-appointments/admin/${apptId}/prescription`;
      const saveRes = await fetch(`${BASE}${endpoint}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoObjectPath: objectPath }),
      });
      if (!saveRes.ok) throw new Error("Failed to save prescription");
      const rx = await saveRes.json();
      setPreview(null);
      setPendingFile(null);
      onUploaded(rx);
    } catch (e: any) {
      setErr(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function cancelPreview() {
    setPreview(null);
    setPendingFile(null);
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  }

  return (
    <div className="space-y-3">
      {/* Existing prescription */}
      {prescription?.photoObjectPath && !preview && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <ImageIcon size={11} /> Current Prescription
            <span className="text-[10px] font-normal normal-case ml-1 text-muted-foreground">
              — {new Date(prescription.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </span>
          </p>
          <div className="bg-gray-50 rounded-xl overflow-hidden border border-border">
            <img
              src={`${BASE}/api/storage${prescription.photoObjectPath}`}
              alt="Prescription"
              className="w-full max-h-48 object-contain"
            />
          </div>
        </div>
      )}

      {/* Image preview before confirm */}
      {preview && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview — looks good?</p>
          <div className="bg-gray-50 rounded-xl overflow-hidden border-2 border-primary/30">
            <img src={preview} alt="Preview" className="w-full max-h-64 object-contain" />
          </div>
          <div className="flex gap-2">
            <button
              onClick={confirmUpload}
              disabled={uploading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#1a3d2b] text-white font-bold rounded-xl text-sm hover:bg-[#1a3d2b]/90 disabled:opacity-60"
            >
              {uploading ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> : <><CheckCircle2 size={14} /> Upload This Prescription</>}
            </button>
            <button onClick={cancelPreview} disabled={uploading}
              className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted/40 disabled:opacity-60">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {err && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle size={12} />{err}</p>}

      {/* Upload buttons */}
      {!preview && (
        <div className="flex gap-2">
          {/* Camera capture — shows on mobile */}
          <label className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-primary/30 rounded-xl text-sm text-primary font-semibold cursor-pointer hover:bg-primary/5 transition-colors",
          )}>
            <Camera size={15} />
            <span>Take Photo</span>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
          {/* File upload */}
          <label className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground font-semibold cursor-pointer hover:bg-muted/30 transition-colors",
          )}>
            <Upload size={15} />
            <span>{prescription?.photoObjectPath ? "Replace" : "Upload"}</span>
            <input ref={fileRef} type="file" accept="image/*,application/pdf"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
        </div>
      )}
    </div>
  );
}

// ── Appointment Card ───────────────────────────────────────────
function ApptCard({ appt, isDoctor, onPrescriptionUploaded }: {
  appt: OnlineAppt | OfflineAppt;
  isDoctor: boolean;
  onPrescriptionUploaded: (id: number, rx: Prescription) => void;
}) {
  const [open, setOpen] = useState(false);
  const sc = STATUS_COLORS[appt.status] ?? STATUS_COLORS.confirmed;
  const isOnline = appt.type === "online";
  const online = appt as OnlineAppt;

  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
      <button className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/20 transition-colors"
        onClick={() => setOpen(v => !v)}>
        {/* Patient ID Badge */}
        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-center",
          isOnline ? "bg-blue-50" : "bg-gray-50")}>
          {appt.patient.patientCode ? (
            <div>
              <p className="font-extrabold text-[#1a3d2b] text-xs leading-tight">{appt.patient.patientCode}</p>
            </div>
          ) : (
            <User size={18} className="text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {appt.patient.patientCode && (
              <span className="font-extrabold text-[#1a3d2b] text-sm">[{appt.patient.patientCode}]</span>
            )}
            <span className="font-bold text-sm text-foreground truncate">{appt.patient.name}</span>
            {isOnline && (
              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">Online</span>
            )}
            {online.joinEnabled && (
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-green-600 text-white">Live</span>
            )}
            <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${sc}`}>
              {appt.status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            <Calendar size={10} className="inline mr-1" />{fmtDate(appt.date)}
            <Clock size={10} className="inline ml-2 mr-1" />{appt.timeLabel}
          </p>
        </div>
        {open ? <ChevronUp size={15} className="text-muted-foreground shrink-0" /> : <ChevronDown size={15} className="text-muted-foreground shrink-0" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="border-t border-border px-4 pb-5 pt-4 space-y-4">
              {/* Patient Info */}
              <div className="bg-[#1a3d2b]/5 rounded-xl px-4 py-3">
                {appt.patient.patientCode && (
                  <p className="text-2xl font-extrabold text-[#1a3d2b] tracking-widest mb-0.5">{appt.patient.patientCode}</p>
                )}
                <p className="font-bold text-foreground">{appt.patient.name}</p>
                {appt.patient.phone && <p className="text-xs text-muted-foreground mt-0.5">{appt.patient.phone}</p>}
                {appt.patient.email && <p className="text-xs text-muted-foreground">{appt.patient.email}</p>}
              </div>

              {/* Reason */}
              {appt.reason && (
                <p className="text-sm text-muted-foreground bg-muted/30 rounded-xl px-3 py-2">
                  <span className="font-medium text-foreground">Reason:</span> {appt.reason}
                </p>
              )}

              {/* Documents (online only) */}
              {isOnline && online.documents.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <FileText size={11} /> Patient Documents ({online.documents.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {online.documents.map((d, i) => (
                      <a key={i} href={`${BASE}/api/storage${d.objectPath}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-1.5 font-medium hover:bg-blue-100 flex items-center gap-1.5">
                        <FileText size={11} /> {d.name}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Prescription upload (online only) */}
              {isOnline && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                    <ImageIcon size={11} /> Prescription
                  </p>
                  <PrescriptionUpload
                    apptId={appt.id}
                    prescription={online.prescription}
                    isDoctor={isDoctor}
                    onUploaded={(rx) => onPrescriptionUploaded(appt.id, rx)}
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await doctorFetch("/all-appointments");
      setOnline(data.online ?? []);
      setOffline(data.offline ?? []);
    } catch {
      setErr("Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function logout() {
    await doctorFetch("/logout", { method: "POST" });
    nav("/doctor");
  }

  function handlePrescriptionUploaded(apptId: number, rx: Prescription) {
    setOnline(prev => prev.map(a => a.id === apptId ? { ...a, prescription: rx } : a));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f9f6] flex items-center justify-center">
        <div className="text-center">
          <img src={logoImg} alt="" className="h-14 mx-auto mb-4 opacity-70" />
          <p className="text-muted-foreground text-sm animate-pulse">Loading…</p>
        </div>
      </div>
    );
  }

  const allAppts: (OnlineAppt | OfflineAppt)[] = tab === "online" ? online : offline;

  return (
    <div className="min-h-screen bg-[#f5f9f6]">
      {/* Header */}
      <header className="bg-white border-b border-border shadow-sm sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src={logoImg} alt="" className="h-9" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Doctor Portal</p>
            <p className="font-bold text-sm">Dr. P. Murali Krishna</p>
          </div>
          <button onClick={load} className="p-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted/40">
            <RefreshCw size={16} />
          </button>
          <button onClick={logout} className="p-2 text-muted-foreground hover:text-red-500 rounded-xl hover:bg-red-50">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {err && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle size={14} /> {err}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 bg-white rounded-2xl p-1.5 border border-border shadow-sm">
          {[
            { key: "online", label: "Online Consultations", count: online.length },
            { key: "offline", label: "In-Person Visits", count: offline.length },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all",
                tab === t.key ? "bg-[#1a3d2b] text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              )}>
              {t.label}
              <span className={cn("ml-1.5 text-xs px-1.5 py-0.5 rounded-full",
                tab === t.key ? "bg-white/20" : "bg-muted")}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Cards */}
        {allAppts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-8 text-center">
            <Stethoscope size={36} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-semibold text-muted-foreground text-sm">No {tab} appointments</p>
          </div>
        ) : (
          <div className="space-y-3">
            {allAppts.map(appt => (
              <ApptCard
                key={`${appt.type}-${appt.id}`}
                appt={appt}
                isDoctor={true}
                onPrescriptionUploaded={handlePrescriptionUploaded}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
