import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  LogOut, RefreshCw, Video, MapPin, Users, ChevronRight, ChevronLeft,
  Calendar, Clock, Phone, FileText, ImageIcon, Camera, Upload,
  CheckCircle2, AlertCircle, Loader2, X, Download, User, ZoomIn,
  ChevronDown, ChevronUp, Mail, MailCheck, StickyNote, Save, ClipboardList,
  Stethoscope, CloudUpload, FilePlus2, Heart, IndianRupee, Search,
} from "lucide-react";
import { VideoCall } from "@/components/VideoCall";
import logoImg from "@assets/logo_1773840200056.png";
import { cn } from "@/lib/utils";
import { todayIST, fmtDateFromTs, fmtTimeIST } from "@/lib/ist";

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

// ── Types ───────────────────────────────────────────────────────
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

type RegisteredPatient = {
  id: number; patientCode: string | null; name: string; email: string; phone: string | null;
  createdAt: string; documents: DocFile[];
  appointments: {
    id: number; status: string; date: string; timeLabel: string;
    reason: string | null; joinEnabled: boolean; documents: DocFile[];
    prescription: Prescription | null;
  }[];
};

type Section = "online" | "offline" | "rxneeded" | "patients" | "donations";
type DonationRow = {
  id: number; patientCode: string | null; patientName: string | null; patientEmail: string | null;
  amount: string; lastSixDigits: string; status: string; thankYouSent: boolean; createdAt: string;
};

// ── Helpers ─────────────────────────────────────────────────────
const IST = "Asia/Kolkata";
function fmtDate(d: string) {
  return new Date(d + "T00:00:00+05:30").toLocaleDateString("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function fmtDateShort(d: string) {
  return new Date(d + "T00:00:00+05:30").toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short" });
}
function isUpcoming(date: string, status: string) {
  const today = todayIST();
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
const STATUS_LABEL: Record<string, string> = {
  pending:   "Pending", confirmed: "Confirmed", arrived: "Arrived",
  completed: "Completed", cancelled: "Cancelled",
};

// ── Drag-resize hook ─────────────────────────────────────────────
function useDragResize(initial: number, min: number, max: number) {
  const [width, setWidth] = useState(initial);
  const startX = useRef(0);
  const startW = useRef(0);
  const widthRef = useRef(initial);
  useEffect(() => { widthRef.current = width; }, [width]);
  const handlers = useRef({
    onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
      startX.current = e.clientX; startW.current = widthRef.current;
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId); e.preventDefault();
    },
    onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
      if (!(e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) return;
      setWidth(Math.max(min, Math.min(max, startW.current + e.clientX - startX.current)));
    },
    onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    },
  });
  return { width, handlers: handlers.current };
}

// ── Drag Handle ──────────────────────────────────────────────────
function DragHandle({ handlers }: { handlers: { onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void; onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void; onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void } }) {
  return (
    <div {...handlers} className="w-1.5 shrink-0 cursor-col-resize bg-gray-200 hover:bg-[#1a3d2b]/30 active:bg-[#1a3d2b]/50 transition-colors group flex items-center justify-center relative touch-none">
      <div className="absolute w-1 h-8 rounded-full bg-gray-300 group-hover:bg-[#1a3d2b]/40 transition-colors" />
    </div>
  );
}

// ── Inline Document Viewer ───────────────────────────────────────
function InlineDocViewer({ doc, docs, onNavigate, onClose }: { doc: DocFile; docs: DocFile[]; onNavigate: (d: DocFile) => void; onClose: () => void }) {
  const idx = docs.indexOf(doc);
  const url = `${BASE}/api/storage${doc.objectPath}`;
  return (
    <div className="flex flex-col h-full bg-gray-100">
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"><X size={14} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-800 truncate">{doc.name}</p>
          <p className="text-[10px] text-gray-400">{idx + 1} / {docs.length}</p>
        </div>
        <button disabled={idx === 0} onClick={() => onNavigate(docs[idx - 1])} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"><ChevronLeft size={14} /></button>
        <button disabled={idx === docs.length - 1} onClick={() => onNavigate(docs[idx + 1])} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"><ChevronRight size={14} /></button>
        <a href={url} download className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" title="Download"><Download size={14} /></a>
      </div>
      {docs.length > 1 && (
        <div className="flex gap-2 px-3 py-2 bg-white border-b border-gray-100 overflow-x-auto shrink-0">
          {docs.map((d, i) => (
            <button key={i} onClick={() => onNavigate(d)} className={cn("shrink-0 flex flex-col items-center gap-1 p-1 rounded-lg border transition-all", d === doc ? "border-[#1a3d2b] bg-[#1a3d2b]/5" : "border-gray-200 hover:border-gray-300")}>
              {isImage(d) ? <img src={`${BASE}/api/storage${d.objectPath}`} alt={d.name} className="w-10 h-9 object-cover rounded" /> : <div className="w-10 h-9 rounded bg-blue-50 flex items-center justify-center"><FileText size={15} className="text-blue-500" /></div>}
              <p className="text-[9px] text-gray-500 max-w-[50px] truncate">{d.name}</p>
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        {isImage(doc) ? (
          <div className="w-full h-full flex items-center justify-center p-4">
            <img src={url} alt={doc.name} className="max-w-full max-h-full object-contain rounded-lg shadow-sm bg-white" />
          </div>
        ) : <iframe src={url} title={doc.name} className="w-full h-full border-0" />}
      </div>
    </div>
  );
}

// ── Notes Editor ─────────────────────────────────────────────────
function NotesEditor({ apptId, initialNotes, onSaved }: { apptId: number; initialNotes: string; onSaved: (rx: Prescription) => void }) {
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setNotes(initialNotes); }, [initialNotes]);
  async function handleSave() {
    setSaving(true); setError("");
    try {
      const r = await fetch(`${BASE}/api/online-appointments/doctor/${apptId}/notes`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }) });
      if (!r.ok) throw new Error("Save failed");
      onSaved(await r.json()); setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch { setError("Could not save notes."); }
    finally { setSaving(false); }
  }
  return (
    <div className="space-y-2">
      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Write clinical notes, observations, or follow-up instructions..." rows={4}
        className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b]/40 bg-amber-50 placeholder-gray-400 text-gray-700" />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button onClick={handleSave} disabled={saving}
        className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all", saved ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-[#1a3d2b] text-white hover:bg-[#1a3d2b]/90 disabled:opacity-50")}>
        {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <CheckCircle2 size={12} /> : <Save size={12} />}
        {saving ? "Saving…" : saved ? "Saved!" : "Save Notes"}
      </button>
    </div>
  );
}

// ── Small Prescription Upload (used in ApptDetail) ────────────────
function PrescriptionUpload({ apptId, prescription, onUploaded }: { apptId: number; prescription: Prescription | null; onUploaded: (rx: Prescription) => void }) {
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
      const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: pendingFile.name, contentType: pendingFile.type, size: pendingFile.size }) });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": pendingFile.type }, body: pendingFile });
      const saveRes = await fetch(`${BASE}/api/online-appointments/doctor/${apptId}/prescription`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photoObjectPath: objectPath }) });
      if (!saveRes.ok) throw new Error("Failed to save");
      onUploaded(await saveRes.json()); setPreview(null); setPendingFile(null);
    } catch (e: any) { setErr(e.message || "Upload failed"); }
    finally { setUploading(false); }
  }
  return (
    <div className="space-y-2">
      {prescription?.photoObjectPath && !preview && (
        <div className="rounded-lg overflow-hidden border border-gray-200">
          <img src={`${BASE}/api/storage${prescription.photoObjectPath}`} alt="Rx" className="w-full max-h-40 object-contain bg-gray-50" />
          <div className="flex justify-between items-center px-3 py-1.5 bg-white border-t border-gray-100">
            <span className="text-[11px] text-gray-400">{fmtDateFromTs(prescription.updatedAt, { day: "numeric", month: "short" })}</span>
            <a href={`${BASE}/api/storage${prescription.photoObjectPath}`} download className="text-[11px] text-[#1a3d2b] font-semibold flex items-center gap-1 hover:underline"><Download size={10} /> Download</a>
          </div>
        </div>
      )}
      {preview && (
        <div className="space-y-2">
          <img src={preview} alt="Preview" className="w-full max-h-40 object-contain rounded-lg border-2 border-[#1a3d2b]/30 bg-gray-50" />
          <div className="flex gap-2">
            <button onClick={confirmUpload} disabled={uploading} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#1a3d2b] text-white font-bold rounded-lg text-xs hover:bg-[#1a3d2b]/90 disabled:opacity-60 transition-colors">
              {uploading ? <><Loader2 size={12} className="animate-spin" /> Uploading…</> : <><CheckCircle2 size={12} /> Confirm</>}
            </button>
            <button onClick={() => { setPreview(null); setPendingFile(null); }} disabled={uploading} className="px-3 py-2 border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 disabled:opacity-60"><X size={12} /></button>
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

// ── Rx Upload Panel (Rx Needed section — full elegant UI) ─────────
function RxUploadPanel({ appt, onSaved, onDocClick }: {
  appt: OnlineAppt;
  onSaved: (rx: Prescription) => void;
  onDocClick: (doc: DocFile, docs: DocFile[]) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [notes, setNotes] = useState(appt.prescription?.notes ?? "");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setNotes(appt.prescription?.notes ?? ""); setPreview(null); setPendingFile(null); setSaved(false); }, [appt.id]);

  function handleFile(file: File) {
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") { setErr("Please select an image or PDF file."); return; }
    setErr(""); setPreview(URL.createObjectURL(file)); setPendingFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  }

  async function handleSave() {
    if (!pendingFile && !appt.prescription?.photoObjectPath && !notes.trim()) {
      setErr("Please upload a prescription photo or add notes before saving."); return;
    }
    setUploading(true); setErr("");
    try {
      let objectPath = appt.prescription?.photoObjectPath ?? null;
      if (pendingFile) {
        const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: pendingFile.name, contentType: pendingFile.type, size: pendingFile.size }) });
        if (!urlRes.ok) throw new Error("Failed to get upload URL");
        const { uploadURL, objectPath: newPath } = await urlRes.json();
        await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": pendingFile.type }, body: pendingFile });
        objectPath = newPath;
      }
      if (objectPath) {
        await fetch(`${BASE}/api/online-appointments/doctor/${appt.id}/prescription`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photoObjectPath: objectPath }) });
      }
      const notesRes = await fetch(`${BASE}/api/online-appointments/doctor/${appt.id}/notes`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }) });
      if (!notesRes.ok) throw new Error("Failed to save notes");
      const rx = await notesRes.json();
      if (objectPath) rx.photoObjectPath = objectPath;
      setSaved(true); onSaved(rx);
    } catch (e: any) { setErr(e.message || "Save failed. Please try again."); }
    finally { setUploading(false); }
  }

  const rxExists = !!appt.prescription?.photoObjectPath;

  return (
    <div className="flex flex-col h-full overflow-auto bg-white">
      {/* Patient header */}
      <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-br from-[#1a3d2b]/4 to-white shrink-0">
        <div className="flex items-center gap-4">
          <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center border-2 shrink-0", appt.patient.patientCode ? "bg-[#1a3d2b]/8 border-[#1a3d2b]/25" : "bg-gray-100 border-gray-200")}>
            {appt.patient.patientCode
              ? <span className="font-black text-[#1a3d2b] text-base font-mono">{appt.patient.patientCode}</span>
              : <User size={26} className="text-gray-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-extrabold text-gray-900 truncate">{appt.patient.name}</h2>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
              {appt.patient.phone && <span className="text-xs text-gray-500 flex items-center gap-1"><Phone size={10} />{appt.patient.phone}</span>}
              {appt.patient.email && <span className="text-xs text-gray-400 flex items-center gap-1"><Mail size={10} />{appt.patient.email}</span>}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Consultation</p>
            <p className="text-xs font-semibold text-gray-700 mt-0.5">{fmtDate(appt.date)}</p>
            <p className="text-[11px] text-gray-500">{appt.timeLabel}</p>
          </div>
        </div>
        {appt.reason && (
          <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-0.5">Chief Complaint</p>
            <p className="text-xs text-gray-700">{appt.reason}</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto px-6 py-5 space-y-6">
        {/* Patient documents (for reference) */}
        {appt.documents.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><FileText size={11} /> Patient Documents</p>
            <div className="grid grid-cols-2 gap-2">
              {appt.documents.map((d, i) => (
                <button key={i} onClick={() => onDocClick(d, appt.documents)}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-[#1a3d2b]/5 border border-gray-200 hover:border-[#1a3d2b]/20 rounded-xl transition-all group text-left">
                  {isImage(d) ? <img src={`${BASE}/api/storage${d.objectPath}`} alt={d.name} className="w-7 h-7 rounded object-cover shrink-0 bg-gray-100" /> : <div className="w-7 h-7 rounded bg-blue-50 flex items-center justify-center shrink-0"><FileText size={13} className="text-blue-500" /></div>}
                  <span className="text-xs font-medium text-gray-700 flex-1 truncate group-hover:text-[#1a3d2b]">{d.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Existing prescription preview */}
        {rxExists && !preview && (
          <div>
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-1.5"><CheckCircle2 size={11} /> Current Prescription</p>
            <div className="relative rounded-xl overflow-hidden border-2 border-emerald-200 group cursor-pointer" onClick={() => onDocClick({ name: "Prescription", objectPath: appt.prescription!.photoObjectPath!, contentType: "image/jpeg", size: 0 }, [])}>
              <img src={`${BASE}/api/storage${appt.prescription!.photoObjectPath!}`} alt="Rx" className="w-full max-h-48 object-contain bg-gray-50" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 flex items-center justify-center transition-all">
                <ZoomIn size={22} className="text-white opacity-0 group-hover:opacity-100 drop-shadow" />
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">Uploaded {fmtDateFromTs(appt.prescription!.updatedAt, { day: "numeric", month: "short" })} · <button className="text-[#1a3d2b] hover:underline" onClick={() => fileRef.current?.click()}>Replace photo</button></p>
          </div>
        )}

        {/* Upload zone */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <ImageIcon size={11} /> {rxExists ? "Replace Prescription Photo" : "Prescription Photo"}
          </p>

          {preview ? (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden border-2 border-[#1a3d2b]/30 shadow-sm">
                <img src={preview} alt="Preview" className="w-full max-h-64 object-contain bg-gray-50" />
                <button onClick={() => { setPreview(null); setPendingFile(null); }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors">
                  <X size={13} />
                </button>
              </div>
              <p className="text-xs text-center text-gray-400 flex items-center justify-center gap-1.5"><CheckCircle2 size={12} className="text-emerald-500" /> Photo ready to save</p>
            </div>
          ) : (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                "relative rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-4 py-10 px-6 cursor-pointer group",
                dragOver ? "border-[#1a3d2b] bg-[#1a3d2b]/5 scale-[1.01]" : "border-gray-300 hover:border-[#1a3d2b]/40 hover:bg-gray-50"
              )}>
              <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center transition-colors", dragOver ? "bg-[#1a3d2b]/10" : "bg-gray-100 group-hover:bg-[#1a3d2b]/8")}>
                <CloudUpload size={30} className={cn("transition-colors", dragOver ? "text-[#1a3d2b]" : "text-gray-400 group-hover:text-[#1a3d2b]/60")} />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-600 mb-1">Drop prescription photo here</p>
                <p className="text-xs text-gray-400">or choose an option below</p>
              </div>
              <div className="flex gap-3 w-full max-w-xs">
                <label className="flex-1 flex flex-col items-center gap-1.5 py-3 px-2 bg-[#1a3d2b] text-white rounded-xl text-xs font-semibold cursor-pointer hover:bg-[#1a3d2b]/90 transition-colors text-center">
                  <Camera size={16} /> Take Photo
                  <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
                </label>
                <label className="flex-1 flex flex-col items-center gap-1.5 py-3 px-2 bg-white border-2 border-gray-200 text-gray-600 rounded-xl text-xs font-semibold cursor-pointer hover:border-[#1a3d2b]/30 hover:text-[#1a3d2b] transition-colors text-center">
                  <FilePlus2 size={16} /> Browse File
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><StickyNote size={11} /> Clinical Notes</p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Diagnosis, medications, instructions, follow-up advice…"
            rows={5}
            className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b]/40 bg-amber-50 placeholder-gray-400 text-gray-700 leading-relaxed"
          />
        </div>

        {err && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-red-700">
            <AlertCircle size={15} className="shrink-0 mt-0.5" /> {err}
          </div>
        )}

        {saved && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-emerald-700 font-semibold">
            <CheckCircle2 size={15} /> Prescription saved! Patient moved to All Patients.
          </div>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={uploading || saved}
          className={cn(
            "w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-base font-extrabold transition-all shadow-sm",
            saved ? "bg-emerald-100 text-emerald-700 border-2 border-emerald-200"
              : uploading ? "bg-[#1a3d2b]/70 text-white cursor-wait"
              : "bg-[#1a3d2b] text-white hover:bg-[#1a3d2b]/90 active:scale-[0.99] shadow-[#1a3d2b]/20 shadow-lg"
          )}>
          {uploading ? <><Loader2 size={18} className="animate-spin" /> Saving…</>
            : saved ? <><CheckCircle2 size={18} /> Prescription Saved</>
            : <><Save size={18} /> Save Prescription & Complete</>}
        </button>
      </div>
    </div>
  );
}

// ── Appointment Detail (right panel main content) ─────────────────
function ApptDetail({ appt, onDocClick, onPrescriptionUploaded, onCallEnded }: {
  appt: OnlineAppt;
  onDocClick: (doc: DocFile) => void;
  onPrescriptionUploaded: (id: number, rx: Prescription) => void;
  onCallEnded: (id: number) => void;
}) {
  return (
    <div className="flex flex-col divide-y divide-gray-100 overflow-auto h-full">
      <div className="px-5 py-4 bg-white shrink-0">
        <div className="flex items-start gap-3">
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center border-2 shrink-0", appt.patient.patientCode ? "bg-[#1a3d2b]/6 border-[#1a3d2b]/20" : "bg-gray-100 border-gray-200")}>
            {appt.patient.patientCode ? <span className="font-black text-[#1a3d2b] text-sm font-mono">{appt.patient.patientCode}</span> : <User size={22} className="text-gray-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate">{appt.patient.name}</h2>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">Online</span>
              {appt.joinEnabled
                ? <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-600 text-white animate-pulse">🟢 Live</span>
                : <span className={cn("text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full", STATUS_PILL[appt.status] ?? STATUS_PILL.pending)}>{STATUS_LABEL[appt.status] ?? appt.status}</span>}
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
        {appt.reason && <div className="mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2"><p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-0.5">Reason</p><p className="text-xs text-gray-700">{appt.reason}</p></div>}
      </div>

      {appt.joinEnabled && (
        <div className="px-5 py-4 bg-white border-b border-gray-100 shrink-0">
          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Video size={11} /> Video Consultation — Active</p>
          <VideoCall apptId={appt.id} role="doctor" onCallEnded={() => onCallEnded(appt.id)} />
        </div>
      )}

      <div className="px-5 py-4 bg-white shrink-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><FileText size={11} /> Patient Documents {appt.documents.length > 0 && <span className="text-gray-300">({appt.documents.length})</span>}</p>
        {appt.documents.length === 0 ? <p className="text-xs text-gray-400 italic">No documents uploaded</p> : (
          <div className="space-y-1.5">
            {appt.documents.map((d, i) => (
              <button key={i} onClick={() => onDocClick(d)} className="w-full flex items-center gap-2.5 px-3 py-2 bg-gray-50 hover:bg-[#1a3d2b]/5 border border-gray-200 hover:border-[#1a3d2b]/20 rounded-lg transition-all group text-left">
                {isImage(d) ? <img src={`${BASE}/api/storage${d.objectPath}`} alt={d.name} className="w-7 h-7 rounded object-cover shrink-0 bg-gray-100" /> : <div className="w-7 h-7 rounded bg-blue-50 flex items-center justify-center shrink-0"><FileText size={13} className="text-blue-500" /></div>}
                <span className="text-xs font-medium text-gray-700 flex-1 truncate group-hover:text-[#1a3d2b]">{d.name}</span>
                <ZoomIn size={12} className="text-gray-300 group-hover:text-[#1a3d2b] shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 py-4 bg-white shrink-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><StickyNote size={11} /> Doctor's Notes</p>
        <NotesEditor apptId={appt.id} initialNotes={appt.prescription?.notes ?? ""} onSaved={rx => onPrescriptionUploaded(appt.id, rx)} />
      </div>

      <div className="px-5 py-4 bg-white">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <ImageIcon size={11} /> Prescription Photo
          {appt.prescription?.photoObjectPath && <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">Uploaded</span>}
        </p>
        <PrescriptionUpload apptId={appt.id} prescription={appt.prescription} onUploaded={rx => onPrescriptionUploaded(appt.id, rx)} />
      </div>
    </div>
  );
}

// ── Patient History Panel (All Patients section) ───────────────────
function PatientHistoryPanel({ patient, patientDocs, appointments, onDocClick }: {
  patient: PatientInfo & { email?: string; createdAt?: string };
  patientDocs: DocFile[];
  appointments: RegisteredPatient["appointments"];
  onDocClick: (doc: DocFile, docs: DocFile[]) => void;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const sorted = [...appointments].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="flex flex-col h-full overflow-auto bg-white">
      {/* Patient header */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-br from-[#1a3d2b]/3 to-white shrink-0">
        <div className="flex items-center gap-3">
          <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center border-2 shrink-0", patient.patientCode ? "bg-[#1a3d2b]/8 border-[#1a3d2b]/25" : "bg-gray-100 border-gray-200")}>
            {patient.patientCode ? <span className="font-black text-[#1a3d2b] text-base font-mono">{patient.patientCode}</span> : <User size={24} className="text-gray-400" />}
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">{patient.name}</h2>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              {patient.phone && <span className="text-xs text-gray-500 flex items-center gap-1"><Phone size={10} />{patient.phone}</span>}
              {patient.email && <span className="text-xs text-gray-500 flex items-center gap-1"><Mail size={10} />{patient.email}</span>}
            </div>
            {patient.createdAt && <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1"><Calendar size={9} /> Registered {fmtDateFromTs(patient.createdAt, { day: "numeric", month: "short", year: "numeric" })}</p>}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-5 py-4 space-y-5">
        {/* Patient documents (from profile) */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <FileText size={11} /> Medical Documents {patientDocs.length > 0 && <span className="text-gray-300">({patientDocs.length})</span>}
          </p>
          {patientDocs.length === 0 ? (
            <div className="text-center py-5 rounded-xl bg-gray-50 border border-gray-100">
              <FileText size={22} className="text-gray-200 mx-auto mb-1.5" />
              <p className="text-xs text-gray-400">No documents uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {patientDocs.map((d, i) => (
                <button key={i} onClick={() => onDocClick(d, patientDocs)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 bg-gray-50 hover:bg-[#1a3d2b]/5 border border-gray-200 hover:border-[#1a3d2b]/20 rounded-xl transition-all group text-left">
                  {isImage(d) ? <img src={`${BASE}/api/storage${d.objectPath}`} alt={d.name} className="w-8 h-8 rounded-lg object-cover shrink-0 bg-gray-100" /> : <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><FileText size={14} className="text-blue-500" /></div>}
                  <span className="text-xs font-medium text-gray-700 flex-1 truncate group-hover:text-[#1a3d2b]">{d.name}</span>
                  <ZoomIn size={12} className="text-gray-300 group-hover:text-[#1a3d2b] shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Appointment history */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Calendar size={11} /> Consultation History {appointments.length > 0 && <span className="text-gray-300">({appointments.length})</span>}
          </p>
          {appointments.length === 0 ? (
            <div className="text-center py-5 rounded-xl bg-gray-50 border border-gray-100">
              <Video size={22} className="text-gray-200 mx-auto mb-1.5" />
              <p className="text-xs text-gray-400">No appointments booked yet</p>
              <p className="text-[10px] text-gray-300 mt-0.5">Appointments will appear here when booked</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map(appt => {
                const isExpanded = expandedId === appt.id;
                const hasDetail = appt.prescription?.photoObjectPath || appt.prescription?.notes || appt.documents.length > 0;
                return (
                  <div key={appt.id} className={cn("rounded-xl border overflow-hidden transition-all", isExpanded ? "border-[#1a3d2b]/20 shadow-sm" : "border-gray-100")}>
                    <button onClick={() => setExpandedId(isExpanded ? null : appt.id)}
                      className={cn("w-full flex items-center gap-3 px-4 py-3 text-left transition-colors", isExpanded ? "bg-[#1a3d2b]/4" : "bg-gray-50 hover:bg-gray-100")}>
                      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><Video size={13} className="text-blue-500" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-700">{fmtDate(appt.date)} · {appt.timeLabel}</p>
                        {appt.reason && <p className="text-[10px] text-gray-400 truncate">{appt.reason}</p>}
                      </div>
                      <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border shrink-0", STATUS_PILL[appt.status] ?? STATUS_PILL.pending)}>{STATUS_LABEL[appt.status] ?? appt.status}</span>
                      {isExpanded ? <ChevronUp size={13} className="text-gray-400 shrink-0" /> : <ChevronDown size={13} className="text-gray-400 shrink-0" />}
                    </button>
                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-white divide-y divide-gray-50">
                        {appt.documents.length > 0 && (
                          <div className="px-4 py-3">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Uploaded Documents</p>
                            <div className="space-y-1.5">
                              {appt.documents.map((d, i) => (
                                <button key={i} onClick={() => onDocClick(d, appt.documents)}
                                  className="w-full flex items-center gap-2 px-2.5 py-2 bg-gray-50 hover:bg-[#1a3d2b]/5 border border-gray-200 hover:border-[#1a3d2b]/20 rounded-lg transition-all group text-left">
                                  {isImage(d) ? <img src={`${BASE}/api/storage${d.objectPath}`} alt={d.name} className="w-6 h-6 rounded object-cover" /> : <div className="w-6 h-6 rounded bg-blue-50 flex items-center justify-center"><FileText size={12} className="text-blue-500" /></div>}
                                  <span className="text-xs text-gray-700 flex-1 truncate group-hover:text-[#1a3d2b]">{d.name}</span>
                                  <ZoomIn size={11} className="text-gray-300 group-hover:text-[#1a3d2b]" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {appt.prescription?.notes && (
                          <div className="px-4 py-3">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1"><StickyNote size={10} /> Doctor's Notes</p>
                            <p className="text-xs text-gray-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 whitespace-pre-wrap">{appt.prescription.notes}</p>
                          </div>
                        )}
                        {appt.prescription?.photoObjectPath && (
                          <div className="px-4 py-3">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1"><ImageIcon size={10} /> Prescription</p>
                            <button onClick={() => onDocClick({ name: "Prescription", objectPath: appt.prescription!.photoObjectPath!, contentType: "image/jpeg", size: 0 }, [])}
                              className="relative rounded-lg overflow-hidden border border-gray-200 hover:border-[#1a3d2b]/30 transition-all group w-full">
                              <img src={`${BASE}/api/storage${appt.prescription.photoObjectPath}`} alt="Rx" className="w-full max-h-28 object-contain bg-gray-50" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 flex items-center justify-center transition-all">
                                <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 drop-shadow" />
                              </div>
                            </button>
                          </div>
                        )}
                        {!hasDetail && <div className="px-4 py-3 text-center text-xs text-gray-400 italic">No documents, notes, or prescription for this visit</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Appointment List Row ──────────────────────────────────────────
function ApptRow({ appt, selected, onClick }: { appt: OnlineAppt; selected: boolean; onClick: () => void }) {
  const hasRx = !!appt.prescription?.photoObjectPath;
  return (
    <button onClick={onClick} className={cn("w-full text-left px-3 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors flex items-start gap-2.5", selected && "bg-[#1a3d2b]/5 border-l-[3px] border-l-[#1a3d2b]")}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1.5 mb-1">
          <p className={cn("text-sm font-bold truncate", selected ? "text-[#1a3d2b]" : "text-gray-800")}>{appt.patient.name}</p>
          <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 border", STATUS_PILL[appt.status] ?? STATUS_PILL.pending)}>{STATUS_LABEL[appt.status] ?? appt.status}</span>
        </div>
        {appt.patient.patientCode && (
          <p className="text-base font-black text-[#1a3d2b] font-mono tracking-widest leading-none mb-1">{appt.patient.patientCode}</p>
        )}
        <p className="text-[11px] text-gray-500">{fmtDateShort(appt.date)} · {appt.timeLabel}</p>
        {hasRx && <p className="text-[10px] text-emerald-500 mt-0.5 flex items-center gap-1"><CheckCircle2 size={9} />Rx uploaded</p>}
        {appt.joinEnabled && <p className="text-[10px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1 animate-pulse">🟢 Live</p>}
      </div>
    </button>
  );
}

// ── Patient Row (All Patients section) ────────────────────────────
function PatientRow({ patient, selected, onClick }: { patient: RegisteredPatient; selected: boolean; onClick: () => void }) {
  const hasAppts = patient.appointments.length > 0;
  const hasDocs = patient.documents.length > 0;
  return (
    <button onClick={onClick} className={cn("w-full text-left px-3 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors flex items-center gap-2.5", selected && "bg-[#1a3d2b]/5 border-l-[3px] border-l-[#1a3d2b]")}>
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", patient.patientCode ? "bg-[#1a3d2b]/8 border border-[#1a3d2b]/15" : "bg-gray-100")}>
        {patient.patientCode ? <span className="font-black text-[#1a3d2b] text-[10px] font-mono">{patient.patientCode}</span> : <User size={13} className="text-gray-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-semibold truncate", selected ? "text-[#1a3d2b]" : "text-gray-800")}>{patient.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {hasAppts && <span className="text-[10px] text-gray-400">{patient.appointments.length} visit{patient.appointments.length !== 1 ? "s" : ""}</span>}
          {!hasAppts && <span className="text-[10px] text-gray-300 italic">No appointments yet</span>}
          {hasDocs && <span className="text-[10px] text-blue-400 flex items-center gap-0.5"><FileText size={8} />{patient.documents.length} doc{patient.documents.length !== 1 ? "s" : ""}</span>}
        </div>
      </div>
      <ChevronRight size={13} className={cn("shrink-0", selected ? "text-[#1a3d2b]" : "text-gray-300")} />
    </button>
  );
}

// ── Rx Needed Row ─────────────────────────────────────────────────
function RxRow({ appt, selected, onClick }: { appt: OnlineAppt; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("w-full text-left px-3 py-3.5 border-b border-amber-50 hover:bg-amber-50/50 transition-colors flex items-start gap-3", selected && "bg-amber-50 border-l-[3px] border-l-amber-500")}>
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border", appt.patient.patientCode ? "bg-[#1a3d2b]/8 border-[#1a3d2b]/15" : "bg-amber-50 border-amber-200")}>
        {appt.patient.patientCode ? <span className="font-black text-[#1a3d2b] text-[10px] font-mono">{appt.patient.patientCode}</span> : <Stethoscope size={15} className="text-amber-500" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-semibold truncate", selected ? "text-amber-700" : "text-gray-800")}>{appt.patient.name}</p>
        <p className="text-[11px] text-gray-500 mt-0.5">{fmtDate(appt.date)} · {appt.timeLabel}</p>
        <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1"><ClipboardList size={9} />Prescription needed</p>
      </div>
      <ChevronRight size={13} className={cn("shrink-0 mt-1", selected ? "text-amber-500" : "text-gray-300")} />
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────
export default function DoctorPortal() {
  const [, nav] = useLocation();
  const [online, setOnline] = useState<OnlineAppt[]>([]);
  const [offline, setOffline] = useState<OfflineAppt[]>([]);
  const [registeredPatients, setRegisteredPatients] = useState<RegisteredPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [section, setSection] = useState<Section>("online");
  const [selectedApptId, setSelectedApptId] = useState<number | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocFile | null>(null);
  const [previewDocs, setPreviewDocs] = useState<DocFile[]>([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [donations, setDonations] = useState<DonationRow[]>([]);
  const [donationsLoading, setDonationsLoading] = useState(false);
  const [donationSearch, setDonationSearch] = useState("");
  const [donationToast, setDonationToast] = useState<string | null>(null);

  const listPanel = useDragResize(300, 180, 600);
  const detailPanel = useDragResize(420, 280, 720);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErr("");
    try {
      const [apptData, patientsData] = await Promise.all([
        doctorFetch("/all-appointments"),
        doctorFetch("/patients"),
      ]);
      setOnline(apptData.online ?? []);
      setOffline(apptData.offline ?? []);
      setRegisteredPatients(patientsData ?? []);
      setLastRefresh(new Date());
    } catch { if (!silent) setErr("Failed to load data"); }
    finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load(true), 20_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load]);

  // ── Donations live SSE ────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource(`${BASE}/api/doctor/donations/sse`, { withCredentials: true });
    es.addEventListener("donation_updated", (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as { id: number; status: string; thankYouSent?: boolean };
      setDonations(prev => prev.map(d =>
        d.id === payload.id
          ? { ...d, status: payload.status, ...(payload.thankYouSent !== undefined ? { thankYouSent: payload.thankYouSent } : {}) }
          : d
      ));
    });
    return () => es.close();
  }, []);

  async function logout() {
    await doctorFetch("/logout", { method: "POST" });
    nav("/doctor");
  }

  function handlePrescriptionUploaded(apptId: number, rx: Prescription) {
    setOnline(prev => prev.map(a => a.id === apptId ? { ...a, prescription: rx } : a));
    // Also update registeredPatients
    setRegisteredPatients(prev => prev.map(p => ({
      ...p,
      appointments: p.appointments.map(a => a.id === apptId ? { ...a, prescription: rx } : a),
    })));
  }

  function handleRxSaved(apptId: number, rx: Prescription) {
    handlePrescriptionUploaded(apptId, rx);
    // When Rx saved from Rx Needed panel, deselect and stay in section (list auto-updates)
    setSelectedApptId(null);
  }

  async function loadDonations() {
    setDonationsLoading(true);
    try {
      const data = await doctorFetch("/donations");
      setDonations(Array.isArray(data) ? data : []);
    } catch {}
    setDonationsLoading(false);
  }

  async function toggleDonationVerify(d: DonationRow) {
    const newVerified = d.status !== "verified";
    await doctorFetch(`/donations/${d.id}/verify`, {
      method: "PATCH",
      body: JSON.stringify({ verified: newVerified }),
    });
    setDonations(prev => prev.map(x => x.id === d.id ? { ...x, status: newVerified ? "verified" : "pending" } : x));
  }

  async function sendDonationThankYou(d: DonationRow) {
    setDonationToast(`Sending to ${d.patientName}…`);
    try {
      const res = await doctorFetch(`/donations/${d.id}/thank-you`, { method: "POST" });
      if (res && !res.error) {
        setDonations(prev => prev.map(x => x.id === d.id ? { ...x, thankYouSent: true } : x));
        setDonationToast("Thank you email sent!");
      } else {
        setDonationToast("Failed to send email.");
      }
    } catch { setDonationToast("Failed to send email."); }
    setTimeout(() => setDonationToast(null), 3500);
  }

  async function handleCallEnded(apptId: number) {
    setOnline(prev => prev.map(a => a.id === apptId ? { ...a, joinEnabled: false, status: "completed" } : a));
    try { await doctorFetch(`/online-appointments/${apptId}/complete`, { method: "POST" }); } catch { }
  }

  // ── Derived data ────────────────────────────────────────────────
  const upcomingOnline = online
    .filter(a => isUpcoming(a.date, a.status))
    .sort((a, b) => a.date.localeCompare(b.date));

  const upcomingOffline = offline
    .filter(a => isUpcoming(a.date, a.status))
    .sort((a, b) => a.date.localeCompare(b.date));

  const rxNeeded = online
    .filter(a => a.status === "completed" && !a.joinEnabled && !a.prescription?.photoObjectPath)
    .sort((a, b) => b.date.localeCompare(a.date));

  const liveCount = online.filter(a => a.joinEnabled).length;

  const selectedAppt = online.find(a => a.id === selectedApptId) ?? null;
  const selectedPatient = registeredPatients.find(p => p.id === selectedPatientId) ?? null;

  const navItems = [
    { key: "online" as Section,    label: "Online Consultations", icon: <Video size={15} />,         count: upcomingOnline.length, color: "text-white" },
    { key: "offline" as Section,   label: "In-Person Visits",     icon: <MapPin size={15} />,         count: upcomingOffline.length, color: "text-white" },
    { key: "rxneeded" as Section,  label: "Rx Needed",            icon: <ClipboardList size={15} />,  count: rxNeeded.length, color: rxNeeded.length > 0 ? "text-amber-300" : "text-white" },
    { key: "patients" as Section,  label: "All Patients",         icon: <Users size={15} />,          count: registeredPatients.length, color: "text-white" },
    { key: "donations" as Section, label: "Donations",            icon: <Heart size={15} />,          count: donations.length, color: "text-white" },
  ];

  const hasDetail = (section === "rxneeded" || section === "online") ? selectedAppt !== null
    : section === "patients" ? selectedPatient !== null
    : false;
  const showPreview = previewDoc !== null && hasDetail;

  function selectSection(s: Section) {
    setSection(s); setSelectedApptId(null); setSelectedPatientId(null); setPreviewDoc(null);
    if (s === "donations") loadDonations();
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden select-none" style={{ fontSize: '103%' }}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <header className="bg-[#1a3d2b] h-13 flex items-center px-4 gap-3 shrink-0 z-40" style={{ height: 52 }}>
        <img src={logoImg} alt="" className="h-7 brightness-0 invert shrink-0" />
        <div className="h-4 w-px bg-white/20 hidden sm:block" />
        <div className="hidden sm:block">
          <p className="text-white/40 text-[10px] font-medium uppercase tracking-wider leading-none">Doctor Portal</p>
          <p className="text-white font-bold text-sm leading-tight">Dr. P. Murali Krishna</p>
        </div>
        <div className="flex-1" />
        {rxNeeded.length > 0 && (
          <div className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/30 rounded-lg px-2.5 py-1.5">
            <ClipboardList size={13} className="text-amber-300" />
            <span className="text-amber-200 text-xs font-semibold">{rxNeeded.length} Rx Pending</span>
          </div>
        )}
        {liveCount > 0 && (
          <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/30 rounded-lg px-2.5 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-300 text-xs font-semibold">{liveCount} Live</span>
          </div>
        )}
        <p className="text-white/40 text-[12px] hidden md:block font-medium">
          {fmtTimeIST(lastRefresh, { hour: "2-digit", minute: "2-digit" })}
        </p>
        <button onClick={() => load()} className="p-2 text-white/50 hover:text-white rounded-lg hover:bg-white/10 transition-colors" title="Refresh"><RefreshCw size={14} /></button>
        <button onClick={logout} className="flex items-center gap-1.5 px-3 py-1.5 text-white/70 hover:text-red-300 rounded-lg hover:bg-white/10 border border-white/15 hover:border-red-400/30 transition-colors text-[12px] font-semibold">
          <LogOut size={13} /> Logout
        </button>
      </header>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ──────────────────────────────────────────── */}
        <aside className="hidden md:flex w-52 bg-[#1a3d2b] flex-col shrink-0">
          <div className="px-4 pt-5 pb-2">
            <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest">Navigation</p>
          </div>
          <nav className="flex-1 px-2 space-y-0.5">
            {navItems.map(item => (
              <button key={item.key} onClick={() => selectSection(item.key)}
                className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left", section === item.key ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/8 hover:text-white/80")}>
                <span className={cn(section === item.key ? "text-white" : "text-white/40", item.key === "rxneeded" && item.count > 0 ? "text-amber-300" : "")}>{item.icon}</span>
                <span className="flex-1 text-sm">{item.label}</span>
                {item.count > 0 && (
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center",
                    item.key === "rxneeded" && item.count > 0
                      ? section === item.key ? "bg-amber-400/30 text-amber-200" : "bg-amber-400/20 text-amber-300"
                      : section === item.key ? "bg-white/20 text-white" : "bg-white/10 text-white/40"
                  )}>{item.count}</span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        {/* ── List panel ───────────────────────────────────────── */}
        <div style={{ width: section === "donations" ? 0 : listPanel.width }} className={cn("shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden", section === "donations" && "hidden")}>
          <div className="px-4 py-2.5 border-b border-gray-100 bg-white shrink-0">
            <h2 className="font-bold text-gray-900 text-sm">
              {section === "online" ? "Online Consultations"
                : section === "offline" ? "In-Person Visits"
                : section === "rxneeded" ? "Rx Needed"
                : section === "donations" ? "Donations"
                : "All Patients"}
            </h2>
            <p className="text-[11px] text-gray-400">
              {section === "patients" ? `${registeredPatients.length} registered`
                : section === "rxneeded" ? `${rxNeeded.length} awaiting prescription`
                : section === "donations" ? `${donations.length} total donations`
                : `${section === "online" ? upcomingOnline.length : upcomingOffline.length} upcoming`}
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
              registeredPatients.length === 0 ? (
                <div className="flex flex-col items-center py-14 text-center px-4">
                  <Users size={28} className="text-gray-200 mb-2" />
                  <p className="text-sm text-gray-400">No patients registered yet</p>
                </div>
              ) : registeredPatients.map(p => (
                <PatientRow key={p.id} patient={p} selected={selectedPatientId === p.id}
                  onClick={() => { setSelectedPatientId(p.id); setSelectedApptId(null); setPreviewDoc(null); }} />
              ))
            ) : section === "rxneeded" ? (
              rxNeeded.length === 0 ? (
                <div className="flex flex-col items-center py-14 text-center px-4">
                  <CheckCircle2 size={28} className="text-emerald-200 mb-2" />
                  <p className="text-sm font-medium text-gray-400">All prescriptions uploaded</p>
                  <p className="text-xs text-gray-300 mt-1">No pending prescriptions</p>
                </div>
              ) : rxNeeded.map(appt => (
                <RxRow key={appt.id} appt={appt} selected={selectedApptId === appt.id}
                  onClick={() => { setSelectedApptId(appt.id); setSelectedPatientId(null); setPreviewDoc(null); }} />
              ))
            ) : section === "donations" ? (
              donationsLoading ? (
                <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
              ) : donations.length === 0 ? (
                <div className="flex flex-col items-center py-14 text-center px-4">
                  <Heart size={28} className="text-gray-200 mb-2" />
                  <p className="text-sm font-medium text-gray-400">No donations yet</p>
                  <p className="text-xs text-gray-300 mt-1">Patient donations appear here</p>
                </div>
              ) : donations.map(d => (
                <div key={d.id} className="border-b border-gray-100 px-3 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {d.patientCode && (
                        <span className="text-[10px] font-black text-[#1a3d2b] font-mono tracking-widest bg-[#1a3d2b]/8 border border-[#1a3d2b]/15 rounded px-1.5 py-0.5 shrink-0">
                          {d.patientCode}
                        </span>
                      )}
                      <p className="text-sm font-semibold text-gray-800 truncate">{d.patientName || "—"}</p>
                    </div>
                    <span className="text-sm font-black text-emerald-700 shrink-0">₹{d.amount}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] text-gray-400 font-mono">xxxx{d.lastSixDigits} · {new Date(d.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                    <button onClick={() => toggleDonationVerify(d)}
                      className="flex items-center gap-1.5 shrink-0 group cursor-pointer">
                      <div className={cn(
                        "relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0",
                        d.status === "verified" ? "bg-green-500" : "bg-gray-200 group-hover:bg-gray-300"
                      )}>
                        <div className={cn(
                          "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                          d.status === "verified" ? "translate-x-4" : "translate-x-0.5"
                        )} />
                      </div>
                      <span className={cn("text-[10px] font-semibold", d.status === "verified" ? "text-green-700" : "text-gray-400")}>
                        {d.status === "verified" ? "Received" : "Not Received"}
                      </span>
                    </button>
                  </div>
                </div>
              ))
            ) : section === "online" ? (
              upcomingOnline.length === 0 ? (
                <div className="flex flex-col items-center py-14 text-center px-4">
                  <Video size={28} className="text-gray-200 mb-2" />
                  <p className="text-sm font-medium text-gray-400">No upcoming appointments</p>
                  <p className="text-xs text-gray-300 mt-1">Confirmed appointments appear here</p>
                </div>
              ) : upcomingOnline.map(appt => (
                <ApptRow key={appt.id} appt={appt} selected={selectedApptId === appt.id}
                  onClick={() => { setSelectedApptId(appt.id); setSelectedPatientId(null); setPreviewDoc(null); }} />
              ))
            ) : (
              upcomingOffline.length === 0 ? (
                <div className="flex flex-col items-center py-14 text-center px-4">
                  <MapPin size={28} className="text-gray-200 mb-2" />
                  <p className="text-sm font-medium text-gray-400">No upcoming in-person visits</p>
                </div>
              ) : upcomingOffline.map(appt => (
                <button key={appt.id} onClick={() => {}}
                  className="w-full text-left px-3 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0 mt-0.5"><MapPin size={14} className="text-green-600" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{appt.patient.name}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{fmtDateShort(appt.date)} · {appt.timeLabel}</p>
                  </div>
                  <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border shrink-0", STATUS_PILL[appt.status] ?? STATUS_PILL.pending)}>{STATUS_LABEL[appt.status] ?? appt.status}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {section !== "donations" && <DragHandle handlers={listPanel.handlers} />}

        {/* ── Right area ───────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">
          {showPreview ? (
            <>
              <div style={{ width: detailPanel.width }} className="shrink-0 overflow-hidden border-r border-gray-200">
                {selectedAppt && section !== "rxneeded" && (
                  <ApptDetail appt={selectedAppt} onDocClick={d => { setPreviewDoc(d); setPreviewDocs(selectedAppt.documents); }} onPrescriptionUploaded={handlePrescriptionUploaded} onCallEnded={handleCallEnded} />
                )}
                {selectedAppt && section === "rxneeded" && (
                  <RxUploadPanel appt={selectedAppt} onSaved={rx => handleRxSaved(selectedAppt.id, rx)} onDocClick={(d, docs) => { setPreviewDoc(d); setPreviewDocs(docs); }} />
                )}
                {selectedPatient && (
                  <PatientHistoryPanel
                    patient={{ id: selectedPatient.id, patientCode: selectedPatient.patientCode, name: selectedPatient.name, email: selectedPatient.email, phone: selectedPatient.phone, createdAt: selectedPatient.createdAt }}
                    patientDocs={selectedPatient.documents}
                    appointments={selectedPatient.appointments}
                    onDocClick={(d, docs) => { setPreviewDoc(d); setPreviewDocs(docs); }}
                  />
                )}
              </div>
              <DragHandle handlers={detailPanel.handlers} />
              <div className="flex-1 overflow-hidden">
                <InlineDocViewer doc={previewDoc!} docs={previewDocs} onNavigate={setPreviewDoc} onClose={() => setPreviewDoc(null)} />
              </div>
            </>
          ) : hasDetail ? (
            <div className="flex-1 overflow-hidden bg-white">
              {selectedAppt && section !== "rxneeded" && (
                <ApptDetail appt={selectedAppt} onDocClick={d => { setPreviewDoc(d); setPreviewDocs(selectedAppt.documents); }} onPrescriptionUploaded={handlePrescriptionUploaded} onCallEnded={handleCallEnded} />
              )}
              {selectedAppt && section === "rxneeded" && (
                <RxUploadPanel appt={selectedAppt} onSaved={rx => handleRxSaved(selectedAppt.id, rx)} onDocClick={(d, docs) => { setPreviewDoc(d); setPreviewDocs(docs); }} />
              )}
              {selectedPatient && (
                <PatientHistoryPanel
                  patient={{ id: selectedPatient.id, patientCode: selectedPatient.patientCode, name: selectedPatient.name, email: selectedPatient.email, phone: selectedPatient.phone, createdAt: selectedPatient.createdAt }}
                  patientDocs={selectedPatient.documents}
                  appointments={selectedPatient.appointments}
                  onDocClick={(d, docs) => { setPreviewDoc(d); setPreviewDocs(docs); }}
                />
              )}
            </div>
          ) : section === "donations" ? (
            <div className="flex-1 overflow-y-auto bg-gray-50">
              {/* Toast */}
              {donationToast && (
                <div className="fixed top-6 right-6 z-50 bg-[#1a3d2b] text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold">
                  {donationToast}
                </div>
              )}
              <div className="p-6">
                {/* Search */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex-1 relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" placeholder="Search by name, Patient ID, amount…"
                      value={donationSearch} onChange={e => setDonationSearch(e.target.value)}
                      className="w-full pl-8 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1a3d2b]" />
                  </div>
                  <button onClick={loadDonations} className="p-2 text-gray-400 hover:text-[#1a3d2b] hover:bg-white rounded-xl border border-gray-200 transition-colors" title="Refresh">
                    <RefreshCw size={14} />
                  </button>
                </div>

                {/* Summary cards */}
                {(() => {
                  const filtered = donations.filter(d => {
                    if (!donationSearch.trim()) return true;
                    const q = donationSearch.toLowerCase();
                    return d.patientName?.toLowerCase().includes(q) || d.patientCode?.toLowerCase().includes(q) || d.lastSixDigits.includes(q) || d.amount.includes(q);
                  });
                  const totalAmt = filtered.reduce((s, d) => s + parseFloat(d.amount || "0"), 0);
                  const verifiedCount = filtered.filter(d => d.status === "verified").length;
                  const pendingCount = filtered.filter(d => d.status !== "verified").length;
                  return (
                    <>
                      <div className="grid grid-cols-3 gap-4 mb-5">
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0"><IndianRupee size={18} className="text-emerald-700" /></div>
                          <div><p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Donated</p><p className="text-xl font-black text-gray-800">₹{totalAmt.toLocaleString("en-IN")}</p></div>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0"><CheckCircle2 size={18} className="text-green-700" /></div>
                          <div><p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Received</p><p className="text-xl font-black text-green-700">{verifiedCount}</p></div>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0"><Clock size={18} className="text-amber-600" /></div>
                          <div><p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Not Received</p><p className="text-xl font-black text-amber-600">{pendingCount}</p></div>
                        </div>
                      </div>

                      {/* Table */}
                      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        {donationsLoading ? (
                          <div className="py-16 text-center text-gray-400 text-sm flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading donations…</div>
                        ) : filtered.length === 0 ? (
                          <div className="py-16 text-center">
                            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3"><Heart size={24} className="text-gray-300" /></div>
                            <p className="text-gray-500 font-semibold text-sm">No donations found</p>
                            <p className="text-xs text-gray-400 mt-1">Patient donations will appear here</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-100 bg-gray-50">
                                  <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Patient</th>
                                  <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Amount</th>
                                  <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Txn Last 6</th>
                                  <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Date</th>
                                  <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                                  <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filtered.map(d => (
                                  <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                    <td className="px-5 py-4">
                                      <div className="flex items-center gap-3">
                                        {d.patientCode && (
                                          <span className="text-sm font-black text-[#1a3d2b] font-mono tracking-widest bg-[#1a3d2b]/8 border border-[#1a3d2b]/15 rounded-lg px-2 py-1 shrink-0">{d.patientCode}</span>
                                        )}
                                        <div>
                                          <p className="font-semibold text-gray-800">{d.patientName || "—"}</p>
                                          <p className="text-xs text-gray-400">{d.patientEmail || "—"}</p>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-5 py-4"><span className="text-base font-black text-emerald-700">₹{d.amount}</span></td>
                                    <td className="px-5 py-4"><span className="font-mono font-semibold text-gray-700 tracking-widest">xxxxxx{d.lastSixDigits}</span></td>
                                    <td className="px-5 py-4 text-gray-500 whitespace-nowrap">{new Date(d.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } as any)}</td>
                                    <td className="px-5 py-4">
                                      <button onClick={() => toggleDonationVerify(d)} className="flex items-center gap-2 cursor-pointer group select-none">
                                        <div className={cn("relative w-10 h-6 rounded-full transition-colors duration-200 shrink-0", d.status === "verified" ? "bg-green-500" : "bg-gray-200 group-hover:bg-gray-300")}>
                                          <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200", d.status === "verified" ? "translate-x-5" : "translate-x-1")} />
                                        </div>
                                        <span className={cn("text-xs font-semibold", d.status === "verified" ? "text-green-700" : "text-gray-400")}>
                                          {d.status === "verified" ? "Received" : "Not Received"}
                                        </span>
                                      </button>
                                    </td>
                                    <td className="px-5 py-4">
                                      <button onClick={() => !d.thankYouSent && sendDonationThankYou(d)} disabled={d.thankYouSent}
                                        className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                                          d.thankYouSent ? "bg-gray-50 border-gray-200 text-gray-400 cursor-default" : "bg-[#1a3d2b]/5 border-[#1a3d2b]/20 text-[#1a3d2b] hover:bg-[#1a3d2b]/10"
                                        )}>
                                        {d.thankYouSent ? <MailCheck size={12} /> : <Mail size={12} />}
                                        {d.thankYouSent ? "Sent" : "Send Thanks"}
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  {section === "rxneeded" ? <ClipboardList size={24} className="text-amber-300" />
                    : section === "online" ? <Video size={24} className="text-gray-300" />
                    : section === "offline" ? <MapPin size={24} className="text-gray-300" />
                    : <Users size={24} className="text-gray-300" />}
                </div>
                <p className="text-sm font-semibold text-gray-400">
                  {section === "patients" ? "Select a patient"
                    : section === "rxneeded" ? rxNeeded.length === 0 ? "All done!" : "Select a patient to upload prescription"
                    : "Select an appointment"}
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
