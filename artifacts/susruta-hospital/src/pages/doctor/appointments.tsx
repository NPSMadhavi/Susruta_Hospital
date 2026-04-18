import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  LogOut, RefreshCw, Video, MapPin, Users, ChevronRight, ChevronLeft,
  ChevronDown, ChevronUp, Calendar, Clock, Phone, FileText, ImageIcon,
  Camera, Upload, CheckCircle2, AlertCircle, Loader2, X, Download,
  User, ZoomIn, ZoomOut, ExternalLink
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

// ── Types ────────────────────────────────────────────────────────
type DocFile = { name: string; objectPath: string; contentType: string; size: number };
type Prescription = { photoObjectPath: string | null; notes: string | null; updatedAt: string };
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
type AnyAppt = OnlineAppt | OfflineAppt;

type Section = "online" | "offline" | "patients";

// ── Helpers ──────────────────────────────────────────────────────
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function fmtDateShort(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function isUpcoming(date: string, status: string) {
  const today = new Date().toISOString().slice(0, 10);
  return date >= today && !["cancelled", "completed"].includes(status);
}
function isImage(f: DocFile) { return f.contentType.startsWith("image/"); }

const STATUS_PILL: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-700 border border-amber-200",
  confirmed: "bg-blue-100 text-blue-700 border border-blue-200",
  arrived:   "bg-teal-100 text-teal-700 border border-teal-200",
  completed: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  cancelled: "bg-gray-100 text-gray-400 border border-gray-200",
};

// ── Prescription Upload ──────────────────────────────────────────
function PrescriptionUpload({ apptId, prescription, onUploaded }: {
  apptId: number; prescription: Prescription | null; onUploaded: (rx: Prescription) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

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
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": pendingFile.type }, body: pendingFile });
      const saveRes = await fetch(`${BASE}/api/online-appointments/doctor/${apptId}/prescription`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoObjectPath: objectPath }),
      });
      if (!saveRes.ok) throw new Error("Failed to save");
      const rx = await saveRes.json();
      setPreview(null); setPendingFile(null);
      onUploaded(rx);
    } catch (e: any) { setErr(e.message || "Upload failed"); }
    finally { setUploading(false); }
  }

  return (
    <div className="space-y-2">
      {prescription?.photoObjectPath && !preview && (
        <div className="rounded-lg overflow-hidden border border-gray-200">
          <img src={`${BASE}/api/storage${prescription.photoObjectPath}`} alt="Rx" className="w-full max-h-48 object-contain bg-gray-50" />
          <div className="flex justify-between items-center px-3 py-1.5 bg-white border-t border-gray-100">
            <span className="text-[11px] text-gray-400">Uploaded {new Date(prescription.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
            <a href={`${BASE}/api/storage${prescription.photoObjectPath}`} download target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-[#1a3d2b] font-semibold flex items-center gap-1 hover:underline">
              <Download size={10} /> Download
            </a>
          </div>
        </div>
      )}
      {preview && (
        <div className="space-y-2">
          <img src={preview} alt="Preview" className="w-full max-h-48 object-contain rounded-lg border-2 border-[#1a3d2b]/30 bg-gray-50" />
          <div className="flex gap-2">
            <button onClick={confirmUpload} disabled={uploading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#1a3d2b] text-white font-bold rounded-lg text-xs hover:bg-[#1a3d2b]/90 disabled:opacity-60 transition-colors">
              {uploading ? <><Loader2 size={12} className="animate-spin" /> Uploading…</> : <><CheckCircle2 size={12} /> Confirm Upload</>}
            </button>
            <button onClick={() => { setPreview(null); setPendingFile(null); if (fileRef.current) fileRef.current.value = ""; if (camRef.current) camRef.current.value = ""; }}
              disabled={uploading} className="px-3 py-2 border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 disabled:opacity-60">
              <X size={12} />
            </button>
          </div>
        </div>
      )}
      {err && <p className="text-[11px] text-red-600 flex items-center gap-1"><AlertCircle size={11} />{err}</p>}
      {!preview && (
        <div className="flex gap-2">
          <label className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-dashed border-[#1a3d2b]/30 rounded-lg text-xs text-[#1a3d2b] font-medium cursor-pointer hover:bg-[#1a3d2b]/5 transition-colors">
            <Camera size={13} /> Take Photo
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
          <label className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 font-medium cursor-pointer hover:bg-gray-50 transition-colors">
            <Upload size={13} /> {prescription?.photoObjectPath ? "Replace" : "Upload"}
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
        </div>
      )}
    </div>
  );
}

// ── Document Viewer (right panel) ────────────────────────────────
function DocViewer({ doc, docs, onNavigate, onClose }: {
  doc: DocFile; docs: DocFile[]; onNavigate: (doc: DocFile) => void; onClose: () => void;
}) {
  const idx = docs.indexOf(doc);
  const isImg = isImage(doc);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
            <X size={15} />
          </button>
          <div className="h-4 w-px bg-gray-200" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate max-w-[200px]">{doc.name}</p>
            <p className="text-[11px] text-gray-400">{idx + 1} of {docs.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => idx > 0 && onNavigate(docs[idx - 1])} disabled={idx === 0}
            className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30 transition-colors">
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => idx < docs.length - 1 && onNavigate(docs[idx + 1])} disabled={idx === docs.length - 1}
            className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30 transition-colors">
            <ChevronRight size={15} />
          </button>
          <a href={`${BASE}/api/storage${doc.objectPath}`} target="_blank" rel="noopener noreferrer"
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500" title="Open in new tab">
            <ExternalLink size={14} />
          </a>
          <a href={`${BASE}/api/storage${doc.objectPath}`} download
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500" title="Download">
            <Download size={14} />
          </a>
        </div>
      </div>

      {/* Document thumbnails row */}
      {docs.length > 1 && (
        <div className="flex gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50 overflow-x-auto">
          {docs.map((d, i) => (
            <button key={i} onClick={() => onNavigate(d)}
              className={cn(
                "shrink-0 flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all",
                d === doc ? "border-[#1a3d2b] bg-[#1a3d2b]/5" : "border-gray-200 hover:border-gray-300 bg-white"
              )}>
              {isImage(d) ? (
                <div className="w-12 h-10 rounded overflow-hidden bg-gray-100">
                  <img src={`${BASE}/api/storage${d.objectPath}`} alt={d.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-12 h-10 rounded bg-blue-50 flex items-center justify-center">
                  <FileText size={18} className="text-blue-500" />
                </div>
              )}
              <p className="text-[9px] text-gray-500 max-w-[56px] truncate">{d.name}</p>
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gray-100 p-4 flex items-center justify-center">
        {isImg ? (
          <img src={`${BASE}/api/storage${doc.objectPath}`} alt={doc.name}
            className="max-w-full max-h-full object-contain rounded-lg shadow-sm bg-white" />
        ) : (
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-xl bg-blue-50 flex items-center justify-center mx-auto">
              <FileText size={30} className="text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700">{doc.name}</p>
              <p className="text-xs text-gray-400 mt-1">PDF document</p>
            </div>
            <a href={`${BASE}/api/storage${doc.objectPath}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1a3d2b] text-white rounded-lg text-sm font-semibold hover:bg-[#1a3d2b]/90 transition-colors">
              <ExternalLink size={14} /> Open Document
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Patient Detail Panel (right) ─────────────────────────────────
function PatientDetail({ appt, onDocClick, onPrescriptionUploaded }: {
  appt: OnlineAppt;
  onDocClick: (doc: DocFile) => void;
  onPrescriptionUploaded: (id: number, rx: Prescription) => void;
}) {
  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Patient header */}
      <div className="px-6 py-5 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-14 h-14 rounded-xl flex items-center justify-center border-2 shrink-0",
            appt.patient.patientCode ? "bg-[#1a3d2b]/5 border-[#1a3d2b]/20" : "bg-gray-100 border-gray-200"
          )}>
            {appt.patient.patientCode
              ? <span className="font-black text-[#1a3d2b] text-base font-mono">{appt.patient.patientCode}</span>
              : <User size={24} className="text-gray-400" />}
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{appt.patient.name}</h2>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">Online</span>
              {appt.joinEnabled
                ? <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-600 text-white animate-pulse">🟢 Live</span>
                : <span className={cn("text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full", STATUS_PILL[appt.status] ?? STATUS_PILL.pending)}>{appt.status}</span>
              }
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-gray-50 rounded-lg px-3 py-2.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Date & Time</p>
            <p className="text-xs font-semibold text-gray-700">{fmtDate(appt.date)}</p>
            <p className="text-xs text-gray-500">{appt.timeLabel}</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Contact</p>
            {appt.patient.phone && <p className="text-xs font-semibold text-gray-700">{appt.patient.phone}</p>}
            {appt.patient.email && <p className="text-xs text-gray-500 truncate">{appt.patient.email}</p>}
          </div>
        </div>

        {appt.reason && (
          <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-0.5">Reason for Visit</p>
            <p className="text-xs text-gray-700">{appt.reason}</p>
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white mt-px">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <FileText size={11} /> Documents from Patient
        </p>
        {appt.documents.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No documents uploaded by patient</p>
        ) : (
          <div className="space-y-1.5">
            {appt.documents.map((d, i) => (
              <button key={i} onClick={() => onDocClick(d)}
                className="w-full flex items-center gap-3 px-3 py-2.5 bg-gray-50 hover:bg-[#1a3d2b]/5 border border-gray-200 hover:border-[#1a3d2b]/20 rounded-lg transition-all group text-left">
                {isImage(d) ? (
                  <div className="w-8 h-8 rounded overflow-hidden shrink-0 bg-gray-100">
                    <img src={`${BASE}/api/storage${d.objectPath}`} alt={d.name} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded bg-blue-50 flex items-center justify-center shrink-0">
                    <FileText size={15} className="text-blue-500" />
                  </div>
                )}
                <span className="text-xs font-medium text-gray-700 flex-1 truncate group-hover:text-[#1a3d2b]">{d.name}</span>
                <ZoomIn size={13} className="text-gray-300 group-hover:text-[#1a3d2b] shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Prescription */}
      <div className="px-6 py-4 bg-white mt-px">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <ImageIcon size={11} /> Prescription
          {appt.prescription?.photoObjectPath && (
            <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">Uploaded</span>
          )}
        </p>
        <PrescriptionUpload
          apptId={appt.id}
          prescription={appt.prescription}
          onUploaded={rx => onPrescriptionUploaded(appt.id, rx)}
        />
      </div>
    </div>
  );
}

// ── Appointment Row ──────────────────────────────────────────────
function ApptRow({ appt, selected, onClick }: {
  appt: AnyAppt; selected: boolean; onClick: () => void;
}) {
  const isOnline = appt.type === "online";
  const docCount = isOnline ? (appt as OnlineAppt).documents.length : 0;

  return (
    <button onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors flex items-start gap-3",
        selected && "bg-[#1a3d2b]/5 border-l-2 border-l-[#1a3d2b] bg-[#1a3d2b]/8"
      )}>
      <div className={cn(
        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
        appt.patient.patientCode ? "bg-[#1a3d2b]/8 border border-[#1a3d2b]/15" : isOnline ? "bg-blue-50" : "bg-green-50"
      )}>
        {appt.patient.patientCode
          ? <span className="font-black text-[#1a3d2b] text-[11px] font-mono leading-none">{appt.patient.patientCode}</span>
          : isOnline ? <Video size={15} className="text-blue-500" /> : <MapPin size={15} className="text-green-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={cn("text-sm font-semibold truncate", selected ? "text-[#1a3d2b]" : "text-gray-800")}>{appt.patient.name}</p>
          <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 border", STATUS_PILL[appt.status] ?? STATUS_PILL.pending)}>
            {appt.status}
          </span>
        </div>
        <p className="text-[11px] text-gray-500 mt-0.5">
          {fmtDateShort(appt.date)} · {appt.timeLabel}
        </p>
        {docCount > 0 && (
          <p className="text-[10px] text-blue-500 mt-0.5 flex items-center gap-1">
            <FileText size={9} /> {docCount} doc{docCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>
      <ChevronRight size={14} className={cn("mt-1.5 shrink-0", selected ? "text-[#1a3d2b]" : "text-gray-300")} />
    </button>
  );
}

// ── Patient Row (for patients list) ─────────────────────────────
function PatientRow({ patient, apptCount, selected, onClick }: {
  patient: PatientInfo; apptCount: number; selected: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors flex items-center gap-3",
        selected && "bg-[#1a3d2b]/5 border-l-2 border-l-[#1a3d2b]"
      )}>
      <div className={cn(
        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
        patient.patientCode ? "bg-[#1a3d2b]/8 border border-[#1a3d2b]/15" : "bg-gray-100"
      )}>
        {patient.patientCode
          ? <span className="font-black text-[#1a3d2b] text-[11px] font-mono">{patient.patientCode}</span>
          : <User size={15} className="text-gray-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-semibold truncate", selected ? "text-[#1a3d2b]" : "text-gray-800")}>{patient.name}</p>
        <p className="text-[11px] text-gray-400">{apptCount} appointment{apptCount !== 1 ? "s" : ""}</p>
      </div>
      <ChevronRight size={14} className={cn("shrink-0", selected ? "text-[#1a3d2b]" : "text-gray-300")} />
    </button>
  );
}

// ── Main ────────────────────────────────────────────────────────
export default function DoctorPortal() {
  const [, nav] = useLocation();
  const [online, setOnline] = useState<OnlineAppt[]>([]);
  const [offline, setOffline] = useState<OfflineAppt[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [section, setSection] = useState<Section>("online");
  const [selectedApptId, setSelectedApptId] = useState<number | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocFile | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [mobileListOpen, setMobileListOpen] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErr("");
    try {
      const data = await doctorFetch("/all-appointments");
      setOnline(data.online ?? []);
      setOffline(data.offline ?? []);
      setLastRefresh(new Date());
    } catch { if (!silent) setErr("Failed to load appointments"); }
    finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => {
    load();
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

  // Derive data
  const today = new Date().toISOString().slice(0, 10);
  const upcomingOnline = online
    .filter(a => isUpcoming(a.date, a.status))
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcomingOffline = offline
    .filter(a => isUpcoming(a.date, a.status))
    .sort((a, b) => a.date.localeCompare(b.date));

  // All unique patients (by patient.id or name+email)
  const allPatientsMap = new Map<string, { patient: PatientInfo; appts: AnyAppt[] }>();
  [...online, ...offline].forEach(appt => {
    const key = String(appt.patient.id ?? `${appt.patient.name}__${appt.patient.email}`);
    if (!allPatientsMap.has(key)) allPatientsMap.set(key, { patient: appt.patient, appts: [] });
    allPatientsMap.get(key)!.appts.push(appt);
  });
  const allPatients = Array.from(allPatientsMap.values()).sort((a, b) => a.patient.name.localeCompare(b.patient.name));

  // Selected appointment & patient
  const currentList = section === "online" ? upcomingOnline : section === "offline" ? upcomingOffline : [];
  const selectedAppt = online.find(a => a.id === selectedApptId) ?? null;
  const previewDocs = selectedAppt?.documents ?? [];
  const selectedPatientAppts = selectedPatientId !== null
    ? allPatientsMap.get(String(selectedPatientId))?.appts ?? []
    : [];

  const liveCount = online.filter(a => a.joinEnabled).length;

  const navItems: { key: Section; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "online",   label: "Online Consultations", icon: <Video size={16} />,  count: upcomingOnline.length },
    { key: "offline",  label: "In-Person Visits",     icon: <MapPin size={16} />, count: upcomingOffline.length },
    { key: "patients", label: "All Patients",          icon: <Users size={16} />,  count: allPatients.length },
  ];

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">

      {/* ── Top Header ───────────────────────────────────────── */}
      <header className="bg-[#1a3d2b] h-14 flex items-center px-4 gap-4 shrink-0 z-40">
        <img src={logoImg} alt="" className="h-7 brightness-0 invert shrink-0" />
        <div className="hidden sm:block h-4 w-px bg-white/20" />
        <div className="hidden sm:block">
          <p className="text-white/50 text-[10px] font-medium uppercase tracking-wider leading-none">Doctor Portal</p>
          <p className="text-white font-bold text-sm leading-tight">Dr. P. Murali Krishna</p>
        </div>
        <div className="flex-1" />
        {liveCount > 0 && (
          <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/30 rounded-lg px-2.5 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-300 text-xs font-semibold">{liveCount} Live</span>
          </div>
        )}
        <p className="text-white/30 text-[11px] hidden md:block">
          {lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </p>
        <button onClick={() => load()} className="p-2 text-white/50 hover:text-white rounded-lg hover:bg-white/10 transition-colors" title="Refresh">
          <RefreshCw size={15} />
        </button>
        <button onClick={logout} className="p-2 text-white/50 hover:text-red-300 rounded-lg hover:bg-white/10 transition-colors" title="Logout">
          <LogOut size={15} />
        </button>
      </header>

      {/* ── Body: 3-panel layout ─────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR ─────────────────────────────────── */}
        <aside className="w-56 lg:w-64 bg-[#1a3d2b] flex flex-col shrink-0 hidden md:flex">
          <div className="px-4 pt-5 pb-3">
            <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest">Navigation</p>
          </div>
          <nav className="flex-1 px-2 space-y-0.5">
            {navItems.map(item => (
              <button key={item.key}
                onClick={() => { setSection(item.key); setSelectedApptId(null); setSelectedPatientId(null); setPreviewDoc(null); }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left",
                  section === item.key
                    ? "bg-white/15 text-white"
                    : "text-white/50 hover:bg-white/8 hover:text-white/80"
                )}>
                <span className={section === item.key ? "text-white" : "text-white/40"}>{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.count > 0 && (
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center",
                    section === item.key ? "bg-white/20 text-white" : "bg-white/10 text-white/40"
                  )}>{item.count}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="px-4 py-4 border-t border-white/10">
            <p className="text-white/30 text-[10px]">Auto-refreshes every 20s</p>
          </div>
        </aside>

        {/* Mobile top nav (md:hidden) */}
        <div className="md:hidden w-full absolute top-14 left-0 right-0 bg-[#1a3d2b] z-30 flex">
          {navItems.map(item => (
            <button key={item.key}
              onClick={() => { setSection(item.key); setSelectedApptId(null); setPreviewDoc(null); }}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-colors",
                section === item.key ? "text-white border-b-2 border-white" : "text-white/40"
              )}>
              {item.icon}
              <span>{item.key === "online" ? "Online" : item.key === "offline" ? "In-Person" : "Patients"}</span>
            </button>
          ))}
        </div>

        {/* ── MIDDLE LIST PANEL ─────────────────────────────── */}
        <div className={cn(
          "w-full md:w-80 lg:w-96 border-r border-gray-200 bg-white flex flex-col shrink-0 overflow-hidden",
          "md:flex",
          selectedApptId !== null || selectedPatientId !== null ? "hidden md:flex" : "flex"
        )}>
          {/* List header */}
          <div className="px-4 py-3 border-b border-gray-200 bg-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900 text-sm">
                  {section === "online" ? "Online Consultations" : section === "offline" ? "In-Person Visits" : "All Patients"}
                </h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {section === "patients"
                    ? `${allPatients.length} patient${allPatients.length !== 1 ? "s" : ""}`
                    : `${currentList.length} upcoming`}
                </p>
              </div>
            </div>
          </div>

          {/* List content */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={22} className="animate-spin text-[#1a3d2b]/30" />
              </div>
            ) : err ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <AlertCircle size={28} className="text-red-400 mb-2" />
                <p className="text-sm text-gray-600">{err}</p>
              </div>
            ) : section === "patients" ? (
              allPatients.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                  <Users size={32} className="text-gray-200 mb-3" />
                  <p className="text-sm text-gray-400">No patients yet</p>
                </div>
              ) : allPatients.map(({ patient, appts }) => {
                const key = String(patient.id ?? `${patient.name}__${patient.email}`);
                return (
                  <PatientRow
                    key={key}
                    patient={patient}
                    apptCount={appts.length}
                    selected={selectedPatientId === patient.id}
                    onClick={() => { setSelectedPatientId(patient.id); setSelectedApptId(null); setPreviewDoc(null); }}
                  />
                );
              })
            ) : currentList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                {section === "online" ? <Video size={32} className="text-gray-200 mb-3" /> : <MapPin size={32} className="text-gray-200 mb-3" />}
                <p className="text-sm font-medium text-gray-500">No upcoming appointments</p>
                <p className="text-xs text-gray-400 mt-1">Upcoming confirmed appointments will appear here</p>
              </div>
            ) : currentList.map(appt => (
              <ApptRow
                key={appt.id}
                appt={appt}
                selected={selectedApptId === appt.id}
                onClick={() => {
                  setSelectedApptId(appt.id);
                  setSelectedPatientId(null);
                  setPreviewDoc(null);
                }}
              />
            ))}
          </div>
        </div>

        {/* ── RIGHT DETAIL / PREVIEW PANEL ─────────────────── */}
        <div className="flex-1 overflow-hidden flex bg-gray-50">
          {/* When a doc is being previewed, take full right panel */}
          {previewDoc && selectedAppt ? (
            <div className="flex-1 flex overflow-hidden">
              {/* Patient detail (compressed, left of preview) */}
              <div className="w-72 shrink-0 border-r border-gray-200 bg-white overflow-auto hidden lg:block">
                <PatientDetail
                  appt={selectedAppt}
                  onDocClick={setPreviewDoc}
                  onPrescriptionUploaded={handlePrescriptionUploaded}
                />
              </div>
              {/* Doc viewer */}
              <div className="flex-1 overflow-hidden">
                <DocViewer
                  doc={previewDoc}
                  docs={previewDocs}
                  onNavigate={setPreviewDoc}
                  onClose={() => setPreviewDoc(null)}
                />
              </div>
            </div>
          ) : selectedAppt ? (
            <div className="flex-1 bg-white overflow-auto">
              <div className="max-w-2xl mx-auto">
                {/* Mobile back button */}
                <div className="md:hidden px-4 pt-4">
                  <button onClick={() => setSelectedApptId(null)}
                    className="flex items-center gap-2 text-sm text-[#1a3d2b] font-semibold mb-4">
                    <ChevronLeft size={16} /> Back to list
                  </button>
                </div>
                <PatientDetail
                  appt={selectedAppt}
                  onDocClick={setPreviewDoc}
                  onPrescriptionUploaded={handlePrescriptionUploaded}
                />
              </div>
            </div>
          ) : selectedPatientId !== null ? (
            <div className="flex-1 bg-white overflow-auto">
              <div className="max-w-2xl mx-auto px-6 py-5">
                {/* Mobile back button */}
                <div className="md:hidden mb-4">
                  <button onClick={() => setSelectedPatientId(null)}
                    className="flex items-center gap-2 text-sm text-[#1a3d2b] font-semibold">
                    <ChevronLeft size={16} /> Back to list
                  </button>
                </div>
                {(() => {
                  const info = allPatientsMap.get(String(selectedPatientId));
                  if (!info) return null;
                  return (
                    <div className="space-y-5">
                      {/* Patient header */}
                      <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                        <div className={cn(
                          "w-14 h-14 rounded-xl flex items-center justify-center border-2 shrink-0",
                          info.patient.patientCode ? "bg-[#1a3d2b]/5 border-[#1a3d2b]/20" : "bg-gray-100 border-gray-200"
                        )}>
                          {info.patient.patientCode
                            ? <span className="font-black text-[#1a3d2b] text-base font-mono">{info.patient.patientCode}</span>
                            : <User size={24} className="text-gray-400" />}
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-gray-900">{info.patient.name}</h2>
                          <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-500">
                            {info.patient.phone && <span className="flex items-center gap-1"><Phone size={11} />{info.patient.phone}</span>}
                            {info.patient.email && <span>{info.patient.email}</span>}
                          </div>
                        </div>
                      </div>
                      {/* Appointment history */}
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Appointment History ({info.appts.length})</p>
                        <div className="space-y-2">
                          {info.appts.sort((a, b) => b.date.localeCompare(a.date)).map(appt => (
                            <div key={appt.id} className={cn(
                              "flex items-center gap-3 px-4 py-3 rounded-xl border",
                              isUpcoming(appt.date, appt.status) ? "bg-[#1a3d2b]/3 border-[#1a3d2b]/15" : "bg-gray-50 border-gray-100"
                            )}>
                              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", appt.type === "online" ? "bg-blue-50" : "bg-green-50")}>
                                {appt.type === "online" ? <Video size={14} className="text-blue-500" /> : <MapPin size={14} className="text-green-600" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-gray-700">{fmtDate(appt.date)} · {appt.timeLabel}</p>
                                <p className="text-[10px] text-gray-400 capitalize">{appt.type === "online" ? "Online" : "In-Person"}</p>
                              </div>
                              <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border", STATUS_PILL[appt.status] ?? STATUS_PILL.pending)}>
                                {appt.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            /* Empty state */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  {section === "online" ? <Video size={28} className="text-gray-300" />
                    : section === "offline" ? <MapPin size={28} className="text-gray-300" />
                    : <Users size={28} className="text-gray-300" />}
                </div>
                <p className="text-sm font-semibold text-gray-400">
                  {section === "patients" ? "Select a patient" : "Select an appointment"}
                </p>
                <p className="text-xs text-gray-300 mt-1">to view details here</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
