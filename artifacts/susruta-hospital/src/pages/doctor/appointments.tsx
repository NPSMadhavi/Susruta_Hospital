import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  LogOut, RefreshCw, Video, MapPin, Users, ChevronRight, ChevronLeft,
  Calendar, Clock, Phone, FileText, ImageIcon, Camera, Upload,
  CheckCircle2, AlertCircle, Loader2, X, Download, User, ZoomIn,
  StickyNote, Save, ChevronDown, ChevronUp, Mail
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

// ── Types ──────────────────────────────────────────────────────
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

// ── Helpers ────────────────────────────────────────────────────
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

// ── Drag-resize hook (pointer-capture based — works inside iframes) ──
function useDragResize(initial: number, min: number, max: number) {
  const [width, setWidth] = useState(initial);
  const startX = useRef(0);
  const startW = useRef(0);
  const widthRef = useRef(initial);

  // Keep widthRef in sync so callbacks always read latest value
  useEffect(() => { widthRef.current = width; }, [width]);

  const handlers = useRef({
    onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
      startX.current = e.clientX;
      startW.current = widthRef.current;
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
      if (!(e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) return;
      const delta = e.clientX - startX.current;
      setWidth(Math.max(min, Math.min(max, startW.current + delta)));
    },
    onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    },
  });

  return { width, handlers: handlers.current };
}

// ── Drag Handle ────────────────────────────────────────────────
function DragHandle({ handlers }: {
  handlers: {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  };
}) {
  return (
    <div
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      className="w-1.5 shrink-0 cursor-col-resize bg-gray-200 hover:bg-[#1a3d2b]/30 active:bg-[#1a3d2b]/50 transition-colors group flex items-center justify-center relative touch-none"
    >
      <div className="absolute w-1 h-8 rounded-full bg-gray-300 group-hover:bg-[#1a3d2b]/40 transition-colors" />
    </div>
  );
}

// ── Inline Document Viewer ─────────────────────────────────────
function InlineDocViewer({ doc, docs, onNavigate, onClose }: {
  doc: DocFile; docs: DocFile[]; onNavigate: (d: DocFile) => void; onClose: () => void;
}) {
  const idx = docs.indexOf(doc);
  const url = `${BASE}/api/storage${doc.objectPath}`;

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* Top toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
          <X size={14} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-800 truncate">{doc.name}</p>
          <p className="text-[10px] text-gray-400">{idx + 1} / {docs.length}</p>
        </div>
        <button disabled={idx === 0} onClick={() => onNavigate(docs[idx - 1])}
          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors">
          <ChevronLeft size={14} />
        </button>
        <button disabled={idx === docs.length - 1} onClick={() => onNavigate(docs[idx + 1])}
          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors">
          <ChevronRight size={14} />
        </button>
        <a href={url} download className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" title="Download">
          <Download size={14} />
        </a>
      </div>

      {/* Thumbnails */}
      {docs.length > 1 && (
        <div className="flex gap-2 px-3 py-2 bg-white border-b border-gray-100 overflow-x-auto shrink-0">
          {docs.map((d, i) => (
            <button key={i} onClick={() => onNavigate(d)}
              className={cn(
                "shrink-0 flex flex-col items-center gap-1 p-1 rounded-lg border transition-all",
                d === doc ? "border-[#1a3d2b] bg-[#1a3d2b]/5" : "border-gray-200 hover:border-gray-300"
              )}>
              {isImage(d) ? (
                <img src={`${BASE}/api/storage${d.objectPath}`} alt={d.name} className="w-10 h-9 object-cover rounded" />
              ) : (
                <div className="w-10 h-9 rounded bg-blue-50 flex items-center justify-center">
                  <FileText size={15} className="text-blue-500" />
                </div>
              )}
              <p className="text-[9px] text-gray-500 max-w-[50px] truncate">{d.name}</p>
            </button>
          ))}
        </div>
      )}

      {/* Content — inline always */}
      <div className="flex-1 overflow-hidden">
        {isImage(doc) ? (
          <div className="w-full h-full flex items-center justify-center p-4">
            <img src={url} alt={doc.name} className="max-w-full max-h-full object-contain rounded-lg shadow-sm bg-white" />
          </div>
        ) : (
          <iframe
            src={url}
            title={doc.name}
            className="w-full h-full border-0"
          />
        )}
      </div>
    </div>
  );
}

// ── Prescription Upload ────────────────────────────────────────
function PrescriptionUpload({ apptId, prescription, onUploaded }: {
  apptId: number; prescription: Prescription | null;
  onUploaded: (rx: Prescription) => void;
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
      onUploaded(await saveRes.json());
      setPreview(null); setPendingFile(null);
    } catch (e: any) { setErr(e.message || "Upload failed"); }
    finally { setUploading(false); }
  }

  return (
    <div className="space-y-2">
      {prescription?.photoObjectPath && !preview && (
        <div className="rounded-lg overflow-hidden border border-gray-200">
          <img src={`${BASE}/api/storage${prescription.photoObjectPath}`} alt="Rx"
            className="w-full max-h-40 object-contain bg-gray-50" />
          <div className="flex justify-between items-center px-3 py-1.5 bg-white border-t border-gray-100">
            <span className="text-[11px] text-gray-400">
              {new Date(prescription.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </span>
            <a href={`${BASE}/api/storage${prescription.photoObjectPath}`} download
              className="text-[11px] text-[#1a3d2b] font-semibold flex items-center gap-1 hover:underline">
              <Download size={10} /> Download
            </a>
          </div>
        </div>
      )}
      {preview && (
        <div className="space-y-2">
          <img src={preview} alt="Preview" className="w-full max-h-40 object-contain rounded-lg border-2 border-[#1a3d2b]/30 bg-gray-50" />
          <div className="flex gap-2">
            <button onClick={confirmUpload} disabled={uploading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#1a3d2b] text-white font-bold rounded-lg text-xs hover:bg-[#1a3d2b]/90 disabled:opacity-60 transition-colors">
              {uploading ? <><Loader2 size={12} className="animate-spin" /> Uploading…</> : <><CheckCircle2 size={12} /> Confirm</>}
            </button>
            <button onClick={() => { setPreview(null); setPendingFile(null); }} disabled={uploading}
              className="px-3 py-2 border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 disabled:opacity-60">
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
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
          <label className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 font-medium cursor-pointer hover:bg-gray-50 transition-colors">
            <Upload size={13} /> {prescription?.photoObjectPath ? "Replace" : "Upload"}
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
        </div>
      )}
    </div>
  );
}

// ── Doctor Notes ───────────────────────────────────────────────
function DoctorNotes({ apptId, initial, onSaved }: {
  apptId: number; initial: string | null; onSaved: (notes: string) => void;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const dirty = value !== (initial ?? "");

  async function save() {
    setSaving(true); setErr(""); setSaved(false);
    try {
      await fetch(`${BASE}/api/online-appointments/doctor/${apptId}/notes`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: value }),
      });
      setSaved(true); onSaved(value);
      setTimeout(() => setSaved(false), 2000);
    } catch { setErr("Failed to save"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Add clinical notes, observations, follow-up instructions…"
        rows={4}
        className="w-full text-xs resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b]/30 transition-all"
      />
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving || !dirty}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
            dirty ? "bg-[#1a3d2b] text-white hover:bg-[#1a3d2b]/90" : "bg-gray-100 text-gray-400 cursor-not-allowed"
          )}>
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
          {saving ? "Saving…" : "Save Notes"}
        </button>
        {saved && <span className="text-[11px] text-emerald-600 flex items-center gap-1"><CheckCircle2 size={11} /> Saved</span>}
        {err && <span className="text-[11px] text-red-500">{err}</span>}
      </div>
    </div>
  );
}

// ── Appointment Detail (right panel main content) ─────────────
function ApptDetail({ appt, onDocClick, onPrescriptionUploaded, onNotesSaved }: {
  appt: OnlineAppt;
  onDocClick: (doc: DocFile) => void;
  onPrescriptionUploaded: (id: number, rx: Prescription) => void;
  onNotesSaved: (id: number, notes: string) => void;
}) {
  return (
    <div className="flex flex-col divide-y divide-gray-100 overflow-auto h-full">
      {/* Patient header */}
      <div className="px-5 py-4 bg-white shrink-0">
        <div className="flex items-start gap-3">
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center border-2 shrink-0",
            appt.patient.patientCode ? "bg-[#1a3d2b]/6 border-[#1a3d2b]/20" : "bg-gray-100 border-gray-200"
          )}>
            {appt.patient.patientCode
              ? <span className="font-black text-[#1a3d2b] text-sm font-mono">{appt.patient.patientCode}</span>
              : <User size={22} className="text-gray-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate">{appt.patient.name}</h2>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">Online</span>
              {appt.joinEnabled
                ? <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-600 text-white animate-pulse">🟢 Live</span>
                : <span className={cn("text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full", STATUS_PILL[appt.status] ?? STATUS_PILL.pending)}>{appt.status}</span>
              }
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Date & Time</p>
            <p className="text-xs font-semibold text-gray-700">{fmtDate(appt.date)}</p>
            <p className="text-xs text-gray-500">{appt.timeLabel}</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Contact</p>
            {appt.patient.phone && <p className="text-xs font-semibold text-gray-700">{appt.patient.phone}</p>}
            {appt.patient.email && <p className="text-xs text-gray-500 truncate">{appt.patient.email}</p>}
          </div>
        </div>

        {appt.reason && (
          <div className="mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-0.5">Reason</p>
            <p className="text-xs text-gray-700">{appt.reason}</p>
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="px-5 py-4 bg-white shrink-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <FileText size={11} /> Patient Documents
          {appt.documents.length > 0 && <span className="text-gray-300">({appt.documents.length})</span>}
        </p>
        {appt.documents.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No documents uploaded</p>
        ) : (
          <div className="space-y-1.5">
            {appt.documents.map((d, i) => (
              <button key={i} onClick={() => onDocClick(d)}
                className="w-full flex items-center gap-2.5 px-3 py-2 bg-gray-50 hover:bg-[#1a3d2b]/5 border border-gray-200 hover:border-[#1a3d2b]/20 rounded-lg transition-all group text-left">
                {isImage(d) ? (
                  <img src={`${BASE}/api/storage${d.objectPath}`} alt={d.name}
                    className="w-7 h-7 rounded object-cover shrink-0 bg-gray-100" />
                ) : (
                  <div className="w-7 h-7 rounded bg-blue-50 flex items-center justify-center shrink-0">
                    <FileText size={13} className="text-blue-500" />
                  </div>
                )}
                <span className="text-xs font-medium text-gray-700 flex-1 truncate group-hover:text-[#1a3d2b]">{d.name}</span>
                <ZoomIn size={12} className="text-gray-300 group-hover:text-[#1a3d2b] shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Doctor's Note */}
      <div className="px-5 py-4 bg-white shrink-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <StickyNote size={11} /> Doctor's Notes
          <span className="text-gray-300 font-normal normal-case tracking-normal">(optional)</span>
        </p>
        <DoctorNotes
          apptId={appt.id}
          initial={appt.prescription?.notes ?? null}
          onSaved={notes => onNotesSaved(appt.id, notes)}
        />
      </div>

      {/* Prescription */}
      <div className="px-5 py-4 bg-white">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <ImageIcon size={11} /> Prescription Photo
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

// ── Patient History (All Patients right panel) ─────────────────
function PatientHistoryPanel({ patientInfo, onDocClick }: {
  patientInfo: { patient: PatientInfo; appts: AnyAppt[] };
  onDocClick: (doc: DocFile, docs: DocFile[]) => void;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { patient, appts } = patientInfo;
  const sorted = [...appts].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="flex flex-col h-full overflow-auto bg-white">
      {/* Patient header */}
      <div className="px-5 py-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center border-2 shrink-0",
            patient.patientCode ? "bg-[#1a3d2b]/6 border-[#1a3d2b]/20" : "bg-gray-100 border-gray-200"
          )}>
            {patient.patientCode
              ? <span className="font-black text-[#1a3d2b] text-sm font-mono">{patient.patientCode}</span>
              : <User size={22} className="text-gray-400" />}
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">{patient.name}</h2>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              {patient.phone && <span className="text-xs text-gray-500 flex items-center gap-1"><Phone size={10} />{patient.phone}</span>}
              {patient.email && <span className="text-xs text-gray-500 flex items-center gap-1"><Mail size={10} />{patient.email}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Appointment history */}
      <div className="flex-1 overflow-auto px-5 py-4">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
          Appointment History ({appts.length})
        </p>
        <div className="space-y-2">
          {sorted.map(appt => {
            const isExpanded = expandedId === appt.id;
            const onlineAppt = appt.type === "online" ? appt as OnlineAppt : null;
            const hasDetail = onlineAppt && (
              onlineAppt.prescription?.photoObjectPath ||
              onlineAppt.prescription?.notes ||
              onlineAppt.documents.length > 0
            );

            return (
              <div key={appt.id} className={cn(
                "rounded-xl border overflow-hidden transition-all",
                isExpanded ? "border-[#1a3d2b]/20 shadow-sm" : "border-gray-100"
              )}>
                {/* Row header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : appt.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                    isExpanded ? "bg-[#1a3d2b]/4" : isUpcoming(appt.date, appt.status) ? "bg-[#1a3d2b]/3 hover:bg-[#1a3d2b]/6" : "bg-gray-50 hover:bg-gray-100"
                  )}>
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", appt.type === "online" ? "bg-blue-50" : "bg-green-50")}>
                    {appt.type === "online" ? <Video size={13} className="text-blue-500" /> : <MapPin size={13} className="text-green-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-700">{fmtDate(appt.date)} · {appt.timeLabel}</p>
                    <p className="text-[10px] text-gray-400">{appt.type === "online" ? "Online" : "In-Person"}</p>
                  </div>
                  <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border shrink-0", STATUS_PILL[appt.status] ?? STATUS_PILL.pending)}>
                    {appt.status}
                  </span>
                  {isExpanded ? <ChevronUp size={13} className="text-gray-400 shrink-0" /> : <ChevronDown size={13} className="text-gray-400 shrink-0" />}
                </button>

                {/* Expanded detail */}
                {isExpanded && onlineAppt && (
                  <div className="border-t border-gray-100 bg-white divide-y divide-gray-50">
                    {/* Documents */}
                    {onlineAppt.documents.length > 0 && (
                      <div className="px-4 py-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Patient Documents</p>
                        <div className="space-y-1.5">
                          {onlineAppt.documents.map((d, i) => (
                            <button key={i} onClick={() => onDocClick(d, onlineAppt.documents)}
                              className="w-full flex items-center gap-2 px-2.5 py-2 bg-gray-50 hover:bg-[#1a3d2b]/5 border border-gray-200 hover:border-[#1a3d2b]/20 rounded-lg transition-all group text-left">
                              {isImage(d) ? (
                                <img src={`${BASE}/api/storage${d.objectPath}`} alt={d.name} className="w-6 h-6 rounded object-cover" />
                              ) : (
                                <div className="w-6 h-6 rounded bg-blue-50 flex items-center justify-center">
                                  <FileText size={12} className="text-blue-500" />
                                </div>
                              )}
                              <span className="text-xs text-gray-700 flex-1 truncate group-hover:text-[#1a3d2b]">{d.name}</span>
                              <ZoomIn size={11} className="text-gray-300 group-hover:text-[#1a3d2b]" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Doctor's notes */}
                    {onlineAppt.prescription?.notes && (
                      <div className="px-4 py-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                          <StickyNote size={10} /> Doctor's Notes
                        </p>
                        <p className="text-xs text-gray-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 whitespace-pre-wrap">
                          {onlineAppt.prescription.notes}
                        </p>
                      </div>
                    )}

                    {/* Prescription photo */}
                    {onlineAppt.prescription?.photoObjectPath && (
                      <div className="px-4 py-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                          <ImageIcon size={10} /> Prescription
                        </p>
                        <button
                          onClick={() => {
                            const d: DocFile = {
                              name: "Prescription",
                              objectPath: onlineAppt.prescription!.photoObjectPath!,
                              contentType: "image/jpeg",
                              size: 0,
                            };
                            onDocClick(d, [d]);
                          }}
                          className="relative rounded-lg overflow-hidden border border-gray-200 hover:border-[#1a3d2b]/30 transition-all group">
                          <img src={`${BASE}/api/storage${onlineAppt.prescription.photoObjectPath}`} alt="Rx"
                            className="w-full max-h-28 object-contain bg-gray-50" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 flex items-center justify-center transition-all">
                            <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 drop-shadow" />
                          </div>
                        </button>
                      </div>
                    )}

                    {!hasDetail && (
                      <div className="px-4 py-3 text-center text-xs text-gray-400 italic">No documents, notes, or prescription for this visit</div>
                    )}
                  </div>
                )}

                {/* Expanded offline appt */}
                {isExpanded && !onlineAppt && (
                  <div className="px-4 py-3 border-t border-gray-100 bg-white text-center text-xs text-gray-400 italic">
                    In-person visit — no digital records attached
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Appointment List Row ───────────────────────────────────────
function ApptRow({ appt, selected, onClick }: { appt: AnyAppt; selected: boolean; onClick: () => void }) {
  const isOnline = appt.type === "online";
  const docCount = isOnline ? (appt as OnlineAppt).documents.length : 0;

  return (
    <button onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors flex items-start gap-2.5",
        selected && "bg-[#1a3d2b]/5 border-l-[3px] border-l-[#1a3d2b]"
      )}>
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
        appt.patient.patientCode ? "bg-[#1a3d2b]/8 border border-[#1a3d2b]/15" : isOnline ? "bg-blue-50" : "bg-green-50"
      )}>
        {appt.patient.patientCode
          ? <span className="font-black text-[#1a3d2b] text-[10px] font-mono">{appt.patient.patientCode}</span>
          : isOnline ? <Video size={14} className="text-blue-500" /> : <MapPin size={14} className="text-green-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1.5">
          <p className={cn("text-sm font-semibold truncate", selected ? "text-[#1a3d2b]" : "text-gray-800")}>{appt.patient.name}</p>
          <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 border", STATUS_PILL[appt.status] ?? STATUS_PILL.pending)}>
            {appt.status}
          </span>
        </div>
        <p className="text-[11px] text-gray-500 mt-0.5">{fmtDateShort(appt.date)} · {appt.timeLabel}</p>
        {docCount > 0 && <p className="text-[10px] text-blue-500 mt-0.5 flex items-center gap-1"><FileText size={9} />{docCount} doc{docCount !== 1 ? "s" : ""}</p>}
      </div>
    </button>
  );
}

// ── Patient Row ────────────────────────────────────────────────
function PatientRow({ patient, apptCount, selected, onClick }: {
  patient: PatientInfo; apptCount: number; selected: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors flex items-center gap-2.5",
        selected && "bg-[#1a3d2b]/5 border-l-[3px] border-l-[#1a3d2b]"
      )}>
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
        patient.patientCode ? "bg-[#1a3d2b]/8 border border-[#1a3d2b]/15" : "bg-gray-100"
      )}>
        {patient.patientCode
          ? <span className="font-black text-[#1a3d2b] text-[10px] font-mono">{patient.patientCode}</span>
          : <User size={13} className="text-gray-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-semibold truncate", selected ? "text-[#1a3d2b]" : "text-gray-800")}>{patient.name}</p>
        <p className="text-[11px] text-gray-400">{apptCount} appointment{apptCount !== 1 ? "s" : ""}</p>
      </div>
      <ChevronRight size={13} className={cn("shrink-0", selected ? "text-[#1a3d2b]" : "text-gray-300")} />
    </button>
  );
}

// ── Main ───────────────────────────────────────────────────────
export default function DoctorPortal() {
  const [, nav] = useLocation();
  const [online, setOnline] = useState<OnlineAppt[]>([]);
  const [offline, setOffline] = useState<OfflineAppt[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [section, setSection] = useState<Section>("online");
  const [selectedApptId, setSelectedApptId] = useState<number | null>(null);
  const [selectedPatientKey, setSelectedPatientKey] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocFile | null>(null);
  const [previewDocs, setPreviewDocs] = useState<DocFile[]>([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Resizable panels
  const listPanel = useDragResize(300, 180, 600);
  const detailPanel = useDragResize(380, 260, 700);

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
  function handleNotesSaved(apptId: number, notes: string) {
    setOnline(prev => prev.map(a => a.id === apptId ? {
      ...a,
      prescription: a.prescription ? { ...a.prescription, notes } : { photoObjectPath: null, notes, updatedAt: new Date().toISOString() }
    } : a));
  }

  // Derived data
  const upcomingOnline = online.filter(a => isUpcoming(a.date, a.status)).sort((a, b) => a.date.localeCompare(b.date));
  const upcomingOffline = offline.filter(a => isUpcoming(a.date, a.status)).sort((a, b) => a.date.localeCompare(b.date));

  const allPatientsMap = new Map<string, { patient: PatientInfo; appts: AnyAppt[] }>();
  [...online, ...offline].forEach(appt => {
    const key = String(appt.patient.id ?? `${appt.patient.name}__${appt.patient.email}`);
    if (!allPatientsMap.has(key)) allPatientsMap.set(key, { patient: appt.patient, appts: [] });
    allPatientsMap.get(key)!.appts.push(appt);
  });
  const allPatients = Array.from(allPatientsMap.entries()).sort((a, b) => a[1].patient.name.localeCompare(b[1].patient.name));

  const selectedAppt = online.find(a => a.id === selectedApptId) ?? null;
  const selectedPatientInfo = selectedPatientKey ? allPatientsMap.get(selectedPatientKey) ?? null : null;
  const currentList = section === "online" ? upcomingOnline : section === "offline" ? upcomingOffline : [];
  const liveCount = online.filter(a => a.joinEnabled).length;

  const navItems = [
    { key: "online" as Section,   label: "Online Consultations", icon: <Video size={15} />,   count: upcomingOnline.length },
    { key: "offline" as Section,  label: "In-Person Visits",     icon: <MapPin size={15} />,  count: upcomingOffline.length },
    { key: "patients" as Section, label: "All Patients",          icon: <Users size={15} />,   count: allPatients.length },
  ];

  const hasDetail = selectedAppt !== null || selectedPatientInfo !== null;
  const showPreview = previewDoc !== null && hasDetail;

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden select-none" style={{ fontSize: '103%' }}>

      {/* ── Header ────────────────────────────────────────────── */}
      <header className="bg-[#1a3d2b] h-13 flex items-center px-4 gap-3 shrink-0 z-40" style={{ height: 52 }}>
        <img src={logoImg} alt="" className="h-7 brightness-0 invert shrink-0" />
        <div className="h-4 w-px bg-white/20 hidden sm:block" />
        <div className="hidden sm:block">
          <p className="text-white/40 text-[10px] font-medium uppercase tracking-wider leading-none">Doctor Portal</p>
          <p className="text-white font-bold text-sm leading-tight">Dr. P. Murali Krishna</p>
        </div>
        <div className="flex-1" />
        {liveCount > 0 && (
          <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/30 rounded-lg px-2.5 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-300 text-xs font-semibold">{liveCount} Live</span>
          </div>
        )}
        <p className="text-white/40 text-[12px] hidden md:block font-medium">
          {lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </p>
        <button onClick={() => load()} className="p-2 text-white/50 hover:text-white rounded-lg hover:bg-white/10 transition-colors" title="Refresh">
          <RefreshCw size={14} />
        </button>
        <button onClick={logout} className="flex items-center gap-1.5 px-3 py-1.5 text-white/70 hover:text-red-300 rounded-lg hover:bg-white/10 border border-white/15 hover:border-red-400/30 transition-colors text-[12px] font-semibold">
          <LogOut size={13} /> Logout
        </button>
      </header>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ─────────────────────────────────────────── */}
        <aside className="hidden md:flex w-52 bg-[#1a3d2b] flex-col shrink-0">
          <div className="px-4 pt-5 pb-2">
            <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest">Navigation</p>
          </div>
          <nav className="flex-1 px-2 space-y-0.5">
            {navItems.map(item => (
              <button key={item.key}
                onClick={() => { setSection(item.key); setSelectedApptId(null); setSelectedPatientKey(null); setPreviewDoc(null); }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left",
                  section === item.key ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/8 hover:text-white/80"
                )}>
                <span className={section === item.key ? "text-white" : "text-white/40"}>{item.icon}</span>
                <span className="flex-1 text-sm">{item.label}</span>
                {item.count > 0 && (
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center",
                    section === item.key ? "bg-white/20 text-white" : "bg-white/10 text-white/40")}>
                    {item.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        {/* ── Middle List (resizable) ──────────────────────────── */}
        <div style={{ width: listPanel.width }} className="shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-white shrink-0">
            <h2 className="font-bold text-gray-900 text-sm">
              {section === "online" ? "Online Consultations" : section === "offline" ? "In-Person Visits" : "All Patients"}
            </h2>
            <p className="text-[11px] text-gray-400">
              {section === "patients" ? `${allPatients.length} patient${allPatients.length !== 1 ? "s" : ""}` : `${currentList.length} upcoming`}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
            ) : err ? (
              <div className="flex flex-col items-center py-10 px-4 text-center">
                <AlertCircle size={24} className="text-red-400 mb-2" />
                <p className="text-sm text-gray-500">{err}</p>
              </div>
            ) : section === "patients" ? (
              allPatients.length === 0 ? (
                <div className="flex flex-col items-center py-14 text-center px-4">
                  <Users size={28} className="text-gray-200 mb-2" />
                  <p className="text-sm text-gray-400">No patients yet</p>
                </div>
              ) : allPatients.map(([key, { patient, appts }]) => (
                <PatientRow key={key} patient={patient} apptCount={appts.length}
                  selected={selectedPatientKey === key}
                  onClick={() => { setSelectedPatientKey(key); setSelectedApptId(null); setPreviewDoc(null); }} />
              ))
            ) : currentList.length === 0 ? (
              <div className="flex flex-col items-center py-14 text-center px-4">
                {section === "online" ? <Video size={28} className="text-gray-200 mb-2" /> : <MapPin size={28} className="text-gray-200 mb-2" />}
                <p className="text-sm font-medium text-gray-400">No upcoming appointments</p>
                <p className="text-xs text-gray-300 mt-1">Confirmed appointments for today or later appear here</p>
              </div>
            ) : currentList.map(appt => (
              <ApptRow key={appt.id} appt={appt} selected={selectedApptId === appt.id}
                onClick={() => { setSelectedApptId(appt.id); setSelectedPatientKey(null); setPreviewDoc(null); }} />
            ))}
          </div>
        </div>

        <DragHandle handlers={listPanel.handlers} />

        {/* ── Right area: detail + optional preview ─────────────── */}
        <div className="flex flex-1 overflow-hidden">
          {showPreview ? (
            <>
              {/* Detail panel (compressed when preview open) */}
              <div style={{ width: detailPanel.width }} className="shrink-0 overflow-hidden border-r border-gray-200">
                {selectedAppt && (
                  <ApptDetail
                    appt={selectedAppt}
                    onDocClick={d => { setPreviewDoc(d); setPreviewDocs(selectedAppt.documents); }}
                    onPrescriptionUploaded={handlePrescriptionUploaded}
                    onNotesSaved={handleNotesSaved}
                  />
                )}
                {selectedPatientInfo && (
                  <PatientHistoryPanel
                    patientInfo={selectedPatientInfo}
                    onDocClick={(d, docs) => { setPreviewDoc(d); setPreviewDocs(docs); }}
                  />
                )}
              </div>
              <DragHandle handlers={detailPanel.handlers} />
              {/* Inline doc viewer */}
              <div className="flex-1 overflow-hidden">
                <InlineDocViewer
                  doc={previewDoc!}
                  docs={previewDocs}
                  onNavigate={setPreviewDoc}
                  onClose={() => setPreviewDoc(null)}
                />
              </div>
            </>
          ) : hasDetail ? (
            /* Full-width detail */
            <div className="flex-1 overflow-hidden bg-white">
              {selectedAppt && (
                <ApptDetail
                  appt={selectedAppt}
                  onDocClick={d => { setPreviewDoc(d); setPreviewDocs(selectedAppt.documents); }}
                  onPrescriptionUploaded={handlePrescriptionUploaded}
                  onNotesSaved={handleNotesSaved}
                />
              )}
              {selectedPatientInfo && (
                <PatientHistoryPanel
                  patientInfo={selectedPatientInfo}
                  onDocClick={(d, docs) => { setPreviewDoc(d); setPreviewDocs(docs); }}
                />
              )}
            </div>
          ) : (
            /* Empty state */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  {section === "online" ? <Video size={24} className="text-gray-300" />
                    : section === "offline" ? <MapPin size={24} className="text-gray-300" />
                    : <Users size={24} className="text-gray-300" />}
                </div>
                <p className="text-sm font-semibold text-gray-400">
                  {section === "patients" ? "Select a patient" : "Select an appointment"}
                </p>
                <p className="text-xs text-gray-300 mt-1">Details will appear here</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
