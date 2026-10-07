import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import {
  LogOut, RefreshCw, Video, MapPin, Users, ChevronRight, ChevronLeft,
  Calendar, Clock, Phone, FileText, ImageIcon, Camera, Upload,
  CheckCircle2, AlertCircle, Loader2, X, Download, User, ZoomIn, Eye,
  ChevronDown, ChevronUp, Mail, MailCheck, StickyNote, Save, ClipboardList,
  Stethoscope, CloudUpload, FilePlus2, Heart, IndianRupee, Search, ArrowLeft, ExternalLink,
  Printer, Plus, Link as LinkIcon, AlertTriangle, Building2, UserCheck, FlaskConical, FileEdit, Trash2
} from "lucide-react";
import { VideoCall } from "@/components/VideoCall";
import { CleanPdfViewer } from "@/components/CleanPdfViewer";
import logoImg from "@assets/logo_1773840200056.png";
import { cn } from "@/lib/utils";
import { todayIST, fmtDateFromTs, fmtTimeIST } from "@/lib/ist";
import { playDoctorCallAlert } from "@/lib/sound";

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
type DocFile = { id?: number; name: string; objectPath: string; contentType: string; size: number };
type Prescription = { id?: number; photoObjectPath: string | null; notes: string | null; updatedAt: string };
type PatientInfo = {
  id: number | null;
  patientCode: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  age?: number | string | null;
  gender?: string | null;
};

type OnlineAppt = {
  id: number;
  type: "online";
  status: string;
  reason: string | null;
  documents: DocFile[];
  patientDocs: DocFile[];
  joinEnabled: boolean;
  createdAt: string;
  date: string;
  timeLabel: string;
  slotId: number;
  patient: PatientInfo;
  prescription: Prescription | null;
};

type OfflineAppt = {
  id: number;
  type: "offline";
  status: string;
  reason: string | null;
  documents: DocFile[];
  patientDocs: DocFile[];
  joinEnabled: false;
  createdAt: string;
  date: string;
  timeLabel: string;
  patient: PatientInfo;
  prescription: Prescription | null;
  notes: string | null;
};

type AnyAppt = OnlineAppt | OfflineAppt;

type RegisteredPatient = {
  id: number;
  patientCode: string | null;
  name: string;
  email: string;
  phone: string | null;
  createdAt: string;
  documents: DocFile[];
  appointments: {
    id: number;
    type?: "online" | "offline";
    status: string;
    date: string;
    timeLabel: string;
    reason: string | null;
    joinEnabled: boolean;
    documents: DocFile[];
    prescription: Prescription | null;
  }[];
};

type Section = "online" | "offline" | "rxneeded" | "patients" | "donations";

type DonationRow = {
  id: number;
  patientCode: string | null;
  patientName: string | null;
  patientEmail: string | null;
  amount: string;
  lastSixDigits: string;
  status: string;
  thankYouSent: boolean;
  createdAt: string;
};

type DirectCall = {
  id: number;
  status: string;
  roomName: string;
  startedAt: string;
  patientJoinedAt: string | null;
  patient: { id: number; patientCode: string | null; name: string; email: string | null; phone: string | null };
};

// ── Helpers ─────────────────────────────────────────────────────
const IST = "Asia/Kolkata";
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
function fmtDate(d: string) {
  if (!d) return "";
  const dateObj = d.includes("T") ? new Date(d) : new Date(d + "T00:00:00+05:30");
  if (isNaN(dateObj.getTime())) return d;
  return dateObj.toLocaleDateString("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function fmtDateShort(d: string) {
  if (!d) return "";
  const dateObj = d.includes("T") ? new Date(d) : new Date(d + "T00:00:00+05:30");
  if (isNaN(dateObj.getTime())) return d;
  return dateObj.toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short" });
}
export function cleanDoctorNotes(rawNotes: string | null | undefined): string {
  if (!rawNotes || typeof rawNotes !== "string") return "";
  let text = rawNotes.trim();
  if (!text) return "";
  if (text.startsWith("{") && (text.includes('"token"') || text.includes('"amount"') || text.includes('"paymentMode"'))) {
    return "";
  }
  if (text.includes("DOCTOR NOTES:")) {
    const parts = text.split("DOCTOR NOTES:");
    return parts[parts.length - 1].trim();
  }
  if (text.startsWith("AYURVEDIC MEDICINAL FORMULATIONS:")) {
    return "";
  }
  return text;
}

function parseMedicinesFromNotes(rawNotes: string | null | undefined): MedicineItem[] {
  if (!rawNotes || !rawNotes.includes("AYURVEDIC MEDICINAL FORMULATIONS:")) return [];
  const lines = rawNotes.split("\n");
  const meds: MedicineItem[] = [];
  let currentMed: Partial<MedicineItem> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\d+\.\s+/.test(trimmed)) {
      if (currentMed && currentMed.name) {
        meds.push(currentMed as MedicineItem);
      }
      const name = trimmed.replace(/^\d+\.\s+/, "");
      currentMed = {
        id: String(Math.random()),
        name,
        morningBefore: false,
        morningAfter: true,
        afternoonBefore: false,
        afternoonAfter: false,
        nightBefore: false,
        nightAfter: true,
        duration: "21 Days",
      };
    } else if (currentMed && trimmed.startsWith("Dosage:")) {
      const dosageStr = trimmed.replace("Dosage:", "");
      currentMed.morningBefore = dosageStr.includes("Morning (Before");
      currentMed.morningAfter = dosageStr.includes("Morning (After");
      currentMed.afternoonBefore = dosageStr.includes("Afternoon (Before");
      currentMed.afternoonAfter = dosageStr.includes("Afternoon (After");
      currentMed.nightBefore = dosageStr.includes("Night (Before");
      currentMed.nightAfter = dosageStr.includes("Night (After");
    } else if (currentMed && trimmed.startsWith("Duration:")) {
      currentMed.duration = trimmed.replace("Duration:", "").trim();
    } else if (trimmed.startsWith("DOCTOR NOTES:")) {
      break;
    }
  }
  if (currentMed && currentMed.name) {
    meds.push(currentMed as MedicineItem);
  }
  return meds;
}

function isRealClinicalNotes(notes: string | null | undefined): boolean {
  return !!cleanDoctorNotes(notes);
}
function fmtDateFull(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function isUpcoming(date: string, status: string) {
  const today = todayIST();
  return date >= today && !["cancelled", "completed"].includes(status);
}
function isImage(f: DocFile) {
  if (f.contentType && f.contentType.startsWith("image/")) return true;
  const name = (f.name || f.objectPath || "").toLowerCase();
  return /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i.test(name);
}
function isPdf(f: DocFile) {
  if (f.contentType === "application/pdf") return true;
  const name = (f.name || f.objectPath || "").toLowerCase();
  return name.endsWith(".pdf");
}

const STATUS_PILL: Record<string, string> = {
  pending:   "bg-[#fef3c7] text-[#b45309] border border-amber-200/80 font-bold",
  confirmed: "bg-[#dbeafe] text-[#1d4ed8] border border-blue-200/80 font-bold",
  arrived:   "bg-[#ccfbf1] text-[#0f766e] border border-teal-200/80 font-bold",
  reschedule_accepted: "bg-[#e0e7ff] text-[#4338ca] border border-indigo-200/80 font-bold",
  completed: "bg-[#d1fae5] text-[#047857] border border-emerald-200/80 font-bold",
  cancelled: "bg-[#f1f5f9] text-[#64748b] border border-slate-200/80 font-medium",
};
const STATUS_LABEL: Record<string, string> = {
  pending:   "Pending",
  confirmed: "Confirmed",
  arrived:   "Arrived",
  reschedule_accepted: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

// ── Drag-resize hook (desktop only) ──────────────────────────────
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

function DragHandle({ handlers }: { handlers: { onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void; onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void; onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void } }) {
  return (
    <div {...handlers} className="w-1 shrink-0 cursor-col-resize bg-[#EDEFEB] hover:bg-[#D95B2F]/40 active:bg-[#D95B2F]/60 transition-colors group flex items-center justify-center relative touch-none">
      <div className="absolute w-1 h-8 rounded-full bg-[#cbd5e1] group-hover:bg-[#D95B2F]/50 transition-colors" />
    </div>
  );
}

// ── Document / Prescription Preview Lightbox Modal ───────────────────
function DocumentPreviewModal({ doc, onClose }: { doc: DocFile | null | undefined; onClose: () => void }) {
  if (!doc) return null;

  const rawPath = doc.objectPath || "";
  const url = rawPath.startsWith("http")
    ? rawPath
    : rawPath.startsWith("/api/storage")
      ? `${BASE}${rawPath}`
      : `${BASE}/api/storage${rawPath.startsWith("/") ? "" : "/"}${rawPath}`;

  const image = isImage(doc);
  const pdf = isPdf(doc);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleDownload = useCallback(() => {
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.name || (pdf ? "document.pdf" : "image.jpg");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [url, doc.name, pdf]);

  const handlePrint = useCallback(() => {
    if (pdf) {
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          window.open(url, "_blank");
        }
        setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 60000);
      };
    } else {
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(`
          <!DOCTYPE html>
          <html>
            <head><title>${doc.name || "Print"}</title></head>
            <body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;">
              <img src="${url}" style="max-width:100%;max-height:100%;object-contain:scale-down;" onload="window.print();window.close();" />
            </body>
          </html>
        `);
        win.document.close();
      }
    }
  }, [url, doc.name, pdf]);

  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setLoadError(false);
  }, [doc, retryKey]);

  return (
    <div
      className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-gray-200/80 w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
          <div className="min-w-0 mr-4">
            <h3 className="font-bold text-gray-900 text-sm sm:text-base truncate">
              {doc.name || (image ? "Prescription Preview" : "Document Preview")}
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              title="Download"
            >
              <Download size={14} />
              <span>Download</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              title="Print"
            >
              <Printer size={14} />
              <span>Print</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors ml-1"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 w-full overflow-hidden bg-[#f8fafc] relative flex flex-col">
          {loadError ? (
            <div className="text-center p-8 bg-white rounded-2xl shadow-sm border border-gray-200 max-w-sm mx-auto my-auto">
              <AlertCircle size={44} className="text-amber-500 mx-auto mb-3" />
              <p className="font-bold text-gray-800 text-base mb-1">Unable to load document</p>
              <p className="text-xs text-gray-500 mb-4">The file could not be retrieved from the server.</p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setRetryKey(k => k + 1)}
                  className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5"
                >
                  <RefreshCw size={13} /> Retry
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="px-4 py-2 bg-[#D95B2F] hover:bg-[#c84e24] text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5 shadow-sm"
                >
                  <Download size={13} /> Download File
                </button>
              </div>
            </div>
          ) : pdf ? (
            <CleanPdfViewer key={retryKey} url={url} title={doc.name} className="w-full h-full flex-1 min-h-0" />
          ) : image ? (
            <div className="flex-1 min-h-0 w-full p-4 sm:p-8 pb-28 flex items-center justify-center overflow-y-auto overflow-x-auto">
              <img
                key={retryKey}
                src={url}
                alt={doc.name || "Preview"}
                onError={() => setLoadError(true)}
                className="max-w-full h-auto bg-white shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-gray-200/90 rounded-xl select-none"
              />
            </div>
          ) : (
            <div className="text-center p-8 bg-white rounded-2xl shadow-sm border border-gray-200 max-w-sm mx-auto my-auto">
              <FileText size={48} className="text-[#D95B2F] mx-auto mb-3" />
              <p className="font-bold text-gray-800 text-base mb-1 truncate">{doc.name}</p>
              <p className="text-xs text-gray-500 mb-4">Preview unavailable for this file type.</p>
              <button
                type="button"
                onClick={handleDownload}
                className="px-5 py-2.5 bg-[#D95B2F] hover:bg-[#c84e24] text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-2 shadow-sm"
              >
                <Download size={14} /> Download File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Upload Document Modal ──────────────────────────────────────────
function UploadDocumentModal({ apptId, onUploaded, onClose }: { apptId: number; onUploaded: (doc: DocFile) => void; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSave() {
    if (!file) { setErr("Please select a file to upload."); return; }
    setUploading(true); setErr("");
    try {
      const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, contentType: file.type || "application/pdf", size: file.size })
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type || "application/pdf" }, body: file });

      const docData: DocFile = { name: file.name, objectPath, contentType: file.type || "application/pdf", size: file.size };
      const docRes = await fetch(`${BASE}/api/online-appointments/doctor/${apptId}/documents`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, objectPath, contentType: file.type || "application/pdf", size: file.size })
      });
      if (!docRes.ok) throw new Error("Failed to save document reference");
      onUploaded(docData);
      onClose();
    } catch (e: any) {
      setErr(e.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-gray-100 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
            <Upload size={18} className="text-[#D95B2F]" /> Upload Patient Document
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-300 hover:border-[#D95B2F] rounded-2xl p-6 text-center cursor-pointer bg-slate-50 hover:bg-orange-50/20 transition-all"
          >
            <CloudUpload size={32} className="text-[#D95B2F] mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-800">{file ? file.name : "Click to browse or drop file here"}</p>
            <p className="text-xs text-gray-400 mt-1">PDF, Medical Reports, Receipts, Images</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }}
            />
          </div>

          {err && (
            <div className="bg-red-50 text-red-700 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle size={14} /> {err}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={uploading || !file}
              className="px-5 py-2.5 bg-[#D95B2F] hover:bg-[#c84e24] text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? "Uploading…" : "Upload File"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Medicine Item Type ─────────────────────────────────────────────
type MedicineItem = {
  id: string;
  name: string;
  morningBefore: boolean;
  morningAfter: boolean;
  afternoonBefore: boolean;
  afternoonAfter: boolean;
  nightBefore: boolean;
  nightAfter: boolean;
  duration: string;
};

// ── Prescription Modal Component ───────────────────────────────────
function PrescriptionModal({ appt, patientName: initialPatientName, patientCode: initialPatientCode, onSaved, onClose, onDocClick }: {
  appt: OnlineAppt;
  patientName?: string;
  patientCode?: string;
  onSaved: (rx: Prescription) => void;
  onClose: () => void;
  onDocClick: (doc: DocFile) => void;
}) {
  const [mode, setMode] = useState<"select" | "digital">("select");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const uploadFileInputRef = useRef<HTMLInputElement>(null);

  const patientName = initialPatientName || appt?.patient?.name || "Patient";
  const patientCode = initialPatientCode || appt?.patient?.patientCode || `A00${appt?.patient?.id || appt?.id || 1}`;

  const handleBox2UploadClick = () => {
    uploadFileInputRef.current?.click();
  };

  const handleFilePickedAndUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setUploadErr("Please select an image or PDF file.");
      return;
    }

    setUploading(true);
    setUploadErr("");

    try {
      const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, contentType: file.type, size: file.size }),
      });

      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

      await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (appt?.id) {
        await fetch(`${BASE}/api/online-appointments/doctor/${appt.id}/prescription`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoObjectPath: objectPath }),
        });
      }

      const rxObj = {
        photoObjectPath: objectPath,
        notes: appt?.prescription?.notes ?? null,
        updatedAt: new Date().toISOString(),
      };

      onSaved(rxObj);
      onClose();
    } catch (err: any) {
      setUploadErr(err.message || "Failed to upload file. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <input
        ref={uploadFileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleFilePickedAndUpload}
      />

      {mode === "digital" ? (
        <DigitalPrescriptionForm
          appt={appt}
          patientName={patientName}
          patientCode={patientCode}
          onSaved={onSaved}
          onClose={onClose}
          onBack={() => setMode("select")}
        />
      ) : (
        <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150 relative">
          {/* Loading Overlay */}
          {uploading && (
            <div className="absolute inset-0 bg-white/95 backdrop-blur-xs flex flex-col items-center justify-center p-6 z-30">
              <Loader2 size={36} className="text-[#D95B2F] animate-spin mb-3" />
              <p className="font-extrabold text-sm text-[#1E293B]">Uploading Prescription...</p>
              <p className="text-xs text-slate-500 mt-1">Please wait while your document is being saved.</p>
            </div>
          )}

          {/* Modal Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FFF4EF] border border-[#FDE8E0] flex items-center justify-center text-[#D95B2F] shrink-0">
                <ClipboardList size={20} />
              </div>
              <div>
                <h3 className="font-extrabold text-[#1E293B] text-lg leading-snug">Add Prescription</h3>
                <div className="text-xs text-[#64748B] mt-0.5 flex items-center gap-1.5 font-medium">
                  <span>Patient: <strong className="text-[#1E293B] font-bold">{patientName}</strong></span>
                  <span className="text-slate-300">•</span>
                  <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[11px] font-semibold border border-slate-200/60">ID: {patientCode}</span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Choice Content */}
          <div className="p-6 sm:p-8 space-y-4">
            {uploadErr && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-xl flex items-center gap-2 font-medium">
                <AlertCircle size={15} className="shrink-0" />
                <span>{uploadErr}</span>
              </div>
            )}

            {/* Box 1: Create Digital Prescription */}
            <div
              onClick={() => setMode("digital")}
              className="border-2 border-dashed border-[#CBD5E1] hover:border-[#D95B2F] bg-white hover:bg-[#FFF4EF]/20 rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group shadow-2xs"
            >
              <div className="w-9 h-9 rounded-xl border border-slate-200 group-hover:border-[#D95B2F] group-hover:bg-white flex items-center justify-center text-slate-500 group-hover:text-[#D95B2F] mb-3 transition-colors shadow-2xs">
                <Plus size={18} />
              </div>
              <h4 className="font-bold text-sm text-[#1E293B] group-hover:text-[#D95B2F] transition-colors">
                Create Digital Prescription
              </h4>
              <p className="text-xs text-[#64748B] mt-1">
                Type medicines, dosage & instructions directly
              </p>
            </div>

            {/* Or Divider */}
            <div className="relative flex items-center justify-center my-4">
              <div className="w-full border-t border-[#E2E8F0]"></div>
              <span className="absolute bg-white px-4 text-xs font-semibold text-slate-400 select-none">
                Or
              </span>
            </div>

            {/* Box 2: Upload */}
            <div
              onClick={handleBox2UploadClick}
              className="border-2 border-dashed border-[#CBD5E1] hover:border-[#D95B2F] bg-white hover:bg-[#FFF4EF]/20 rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group shadow-2xs"
            >
              <div className="w-9 h-9 rounded-xl border border-slate-200 group-hover:border-[#D95B2F] group-hover:bg-white flex items-center justify-center text-slate-500 group-hover:text-[#D95B2F] mb-3 transition-colors shadow-2xs">
                <Upload size={18} />
              </div>
              <h4 className="font-bold text-sm text-[#1E293B] group-hover:text-[#D95B2F] transition-colors">
                Upload
              </h4>
              <p className="text-xs text-[#64748B] mt-1">
                Drag & drop PDF, JPG, or PNG up to 10MB
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getFormulationSubtext(name: string): string {
  const lower = (name || "").toLowerCase();
  if (lower.includes("gutika") || lower.includes("vati") || lower.includes("tablet")) return "500mg Vati / Tablet";
  if (lower.includes("churna") || lower.includes("powder")) return "3g Microfine Powder";
  if (lower.includes("kwath") || lower.includes("kashayam") || lower.includes("decoction")) return "30ml Decoction / Kashayam";
  if (lower.includes("arishta") || lower.includes("asava")) return "15ml Liquid / Arishta";
  if (lower.includes("taila") || lower.includes("thailam")) return "10ml Medicinal Oil";
  if (lower.includes("lehya") || lower.includes("rasayana")) return "10g Herbal Paste";
  return "Ayurvedic Formulation";
}

// ── Print Prescription Template Modal (Matching User Image) ───────
function PrintPrescriptionModal({
  data,
  onClose,
}: {
  data: {
    patientName: string;
    patientCode: string;
    age?: string;
    gender?: string;
    ageGender?: string;
    consultDate: string;
    medicines: MedicineItem[];
    doctorNotes: string;
  };
  onClose: () => void;
}) {
  const ehrUid = `${(data.patientName || "Patient").replace(/\s+/g, "")}_${(data.patientCode || "Code").replace(/#/g, "")}`;
  const displayAge = data.age || (data.ageGender ? data.ageGender.split("/")[0]?.trim() : "") || "—";
  const displayGender = data.gender || (data.ageGender ? data.ageGender.split("/")[1]?.trim() : "") || "—";

  return (
    <div className="fixed inset-0 z-[160] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-100 max-h-[95vh] flex flex-col animate-in zoom-in-95 duration-150 my-auto">
        {/* Printable Section */}
        <div id="printable-prescription" className="flex-1 overflow-y-auto p-6 sm:p-10 bg-white">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-200/80">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <img src={logoImg} alt="Susruta Hospital" className="h-10 w-auto max-w-[220px] object-contain" />
              </div>
              <p className="text-xs text-[#64748B] font-medium leading-relaxed">
                119, Ramulavari North Mada Street, Tirupati - 517507 | Ph: 9492068180 / 0877-2220663
              </p>
              <p className="text-[11px] font-semibold text-[#64748B] mt-0.5">
                Govt. Regd No: <span className="font-extrabold text-[#D95B2F]">AYUR-TPT-2024</span> • ISO 9001:2015 Certified
              </p>
            </div>

            <div className="text-left sm:text-right shrink-0">
              <p className="text-[10px] font-bold text-[#D95B2F] uppercase tracking-wider mb-0.5">
                CHIEF CONSULTING PHYSICIAN
              </p>
              <h3 className="font-extrabold text-[#1E293B] text-base">
                Dr. P. Murali Krishna
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                B.A.M.S. (Gold Medalist), M.D. (Ay), Ph.D.
              </p>
              <p className="text-xs text-slate-400 font-medium">
                Former Principal, S.V. Ayurvedic College
              </p>
            </div>
          </div>

          {/* Patient Details Banner */}
          <div className="bg-[#FAF8F5] border border-[#EDE8DF] rounded-2xl p-4 sm:p-5 my-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
              <div>
                <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">Patient Full Name</p>
                <p className="font-extrabold text-sm text-[#1E293B] truncate">{data.patientName || "Sinjini Saha"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">Patient ID/IPD</p>
                <p className="font-extrabold text-sm text-[#D95B2F] font-mono">{data.patientCode || "#A115"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">Age</p>
                <p className="font-extrabold text-xs text-[#1E293B]">{displayAge}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">Gender</p>
                <p className="font-extrabold text-xs text-[#1E293B]">{displayGender}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">Date Of Consult & Time</p>
                <p className="font-bold text-xs text-[#1E293B]">{data.consultDate || "24 Oct 2026 • 11:30 AM IST"}</p>
              </div>
            </div>
          </div>

          {/* Ayurvedic Formulations Table */}
          <div className="space-y-3 mb-6">
            <div>
              <h4 className="font-extrabold text-xs text-[#1E293B] uppercase tracking-wider">
                AYURVEDIC MEDICINAL FORMULATIONS
              </h4>
              <p className="text-[11px] text-[#64748B] font-medium">
                Administer precisely as charted below with indicated Anupana
              </p>
            </div>

            <div className="border border-[#E2E4DE] rounded-2xl overflow-hidden bg-white shadow-2xs">
              <div className="bg-[#F0EDE8] py-3 px-4 text-[11px] font-bold text-[#475569] grid grid-cols-12 gap-2 items-center tracking-wide border-b border-[#E2E4DE]">
                <div className="col-span-1 text-center">S.NO</div>
                <div className="col-span-4">Medicine & Formulation</div>
                <div className="col-span-5 text-center">
                  Dosage Timing & Food Association
                  <span className="block text-[10px] text-slate-400 font-normal italic">(strict before / after meals correlation)</span>
                </div>
                <div className="col-span-2 text-center">Duration</div>
              </div>

              <div className="divide-y divide-slate-100">
                {data.medicines.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400 italic">No specific medicines recorded.</div>
                ) : (
                  data.medicines.map((m, idx) => (
                    <div key={m.id || idx} className="p-4 grid grid-cols-12 gap-2.5 items-center text-xs bg-white">
                      <div className="col-span-1 text-center font-extrabold text-[#1E293B] text-xs">
                        {String(idx + 1).padStart(2, "0")}
                      </div>

                      <div className="col-span-4">
                        <h5 className="font-bold text-sm text-[#1E293B]">{m.name || "Bilwadi Gutika"}</h5>
                        <p className="text-[11px] font-semibold text-[#D95B2F] mt-0.5">
                          {getFormulationSubtext(m.name)}
                        </p>
                      </div>

                      <div className="col-span-5">
                        <div className="space-y-1.5 max-w-xs mx-auto">
                          {/* Morning */}
                          <div className="flex items-center justify-between text-[11px]">
                            <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${m.morningBefore ? "bg-[#D95B2F] text-white" : "bg-slate-100 text-slate-300"}`}>
                              {m.morningBefore ? "✓ Before" : "Before"}
                            </span>
                            <span className="font-bold text-[#1E293B] text-xs px-2">Breakfast</span>
                            <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${m.morningAfter ? "bg-[#D95B2F] text-white" : "bg-slate-100 text-slate-300"}`}>
                              {m.morningAfter ? "After ✓" : "After"}
                            </span>
                          </div>

                          {/* Afternoon */}
                          <div className="flex items-center justify-between text-[11px]">
                            <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${m.afternoonBefore ? "bg-[#D95B2F] text-white" : "bg-slate-100 text-slate-300"}`}>
                              {m.afternoonBefore ? "✓ Before" : "Before"}
                            </span>
                            <span className="font-bold text-[#1E293B] text-xs px-2">Lunch</span>
                            <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${m.afternoonAfter ? "bg-[#D95B2F] text-white" : "bg-slate-100 text-slate-300"}`}>
                              {m.afternoonAfter ? "After ✓" : "After"}
                            </span>
                          </div>

                          {/* Night */}
                          <div className="flex items-center justify-between text-[11px]">
                            <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${m.nightBefore ? "bg-[#D95B2F] text-white" : "bg-slate-100 text-slate-300"}`}>
                              {m.nightBefore ? "✓ Before" : "Before"}
                            </span>
                            <span className="font-bold text-[#1E293B] text-xs px-2">Dinner</span>
                            <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${m.nightAfter ? "bg-[#D95B2F] text-white" : "bg-slate-100 text-slate-300"}`}>
                              {m.nightAfter ? "After ✓" : "After"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="col-span-2 text-center">
                        <span className="inline-block px-3 py-1 bg-slate-50 text-[#1E293B] border border-slate-200 rounded-xl text-xs font-bold shadow-2xs">
                          {m.duration || "21 Days"}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Doctor Notes */}
          {data.doctorNotes && (
            <div className="bg-[#FAF8F5] border border-[#EDE8DF] rounded-2xl p-5 mb-6 space-y-2">
              <h5 className="font-extrabold text-xs text-[#D95B2F]">Doctor Notes</h5>
              <div className="text-xs text-[#475569] leading-relaxed whitespace-pre-line font-medium">
                {data.doctorNotes}
              </div>
            </div>
          )}

          {/* Stamp & Signature Block */}
          <div className="flex flex-col items-end justify-end mt-8 mb-4 pr-2">
            <div className="relative text-right">
              <div className="absolute -top-3 -left-12 w-20 h-20 rounded-full border-2 border-dashed border-[#D95B2F]/30 bg-[#FFF4EF]/40 flex flex-col items-center justify-center text-[8px] font-extrabold text-[#D95B2F]/60 select-none rotate-[-12deg] pointer-events-none">
                <span>SUSRUTA</span>
                <span>HOSPITAL</span>
                <span>TIRUPATI</span>
              </div>

              <p className="font-serif italic text-2xl text-[#64748B] select-none pr-4">
                P. Murali Krishna
              </p>

              <div className="w-48 border-t border-slate-300 my-1.5 ml-auto"></div>
              <p className="font-extrabold text-xs text-[#1E293B]">
                Dr. P. Murali Krishna
              </p>
              <p className="text-[10px] text-slate-500 font-medium">
                Chief Physician & Research Director
              </p>
              <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                Digitally Signed & Timestamped: {format(new Date(), "dd-MM-yyyy HH:mm")} IST
              </p>
            </div>
          </div>
        </div>

        {/* Footer Bar */}
        <div className="bg-[#F0EDE8] px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#EAE6DF] shrink-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#475569]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
            <span>Electronic Health Record (EHR) Linked to UID: {ehrUid}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#475569] text-xs font-bold transition-all shadow-2xs cursor-pointer"
            >
              Close Window
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-5 py-2.5 rounded-xl bg-[#D95B2F] hover:bg-[#c04e26] text-white text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-2"
            >
              <Printer size={15} /> Print Prescription
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-prescription, #printable-prescription * {
            visibility: visible;
          }
          #printable-prescription {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

// ── Digital Prescription Form Component (Image 1 & Image 2) ──────
function DigitalPrescriptionForm({ appt, patientName, patientCode, onSaved, onClose, onBack }: {
  appt: OnlineAppt;
  patientName: string;
  patientCode: string;
  onSaved: (rx: Prescription) => void;
  onClose: () => void;
  onBack: () => void;
}) {
  const getInitialAge = (pAge: any) => {
    if (pAge === null || pAge === undefined || pAge === "") return "";
    const s = String(pAge).trim();
    if (!s) return "";
    if (/^\d+$/.test(s)) return `${s} Y`;
    return s;
  };

  const getInitialGender = (pGen: any) => {
    if (!pGen || typeof pGen !== "string") return "";
    const g = pGen.trim();
    if (/^female$/i.test(g)) return "Female";
    if (/^male$/i.test(g)) return "Male";
    if (/^other$/i.test(g)) return "Other";
    return g;
  };

  const [patientFullName, setPatientFullName] = useState(patientName);
  const [patientIdStr, setPatientIdStr] = useState(patientCode);
  const [patientAge, setPatientAge] = useState(() => getInitialAge((appt as any)?.patient?.age));
  const [patientGender, setPatientGender] = useState(() => getInitialGender((appt as any)?.patient?.gender));
  const [consultDate, setConsultDate] = useState(() => format(new Date(), "dd MMM yyyy • hh:mm a"));

  const [medicines, setMedicines] = useState<MedicineItem[]>([]);
  const [doctorNotes, setDoctorNotes] = useState(appt?.prescription?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [printData, setPrintData] = useState<{
    patientName: string;
    patientCode: string;
    age?: string;
    gender?: string;
    ageGender?: string;
    consultDate: string;
    medicines: MedicineItem[];
    doctorNotes: string;
  } | null>(null);

  const addMedicine = () => {
    setMedicines(prev => [
      ...prev,
      {
        id: String(Date.now() + Math.random()),
        name: "",
        morningBefore: false,
        morningAfter: false,
        afternoonBefore: false,
        afternoonAfter: false,
        nightBefore: false,
        nightAfter: false,
        duration: "21 Days",
      },
    ]);
  };

  const updateMedicine = (id: string, key: keyof MedicineItem, val: any) => {
    setMedicines(prev =>
      prev.map(m => (m.id === id ? { ...m, [key]: val } : m))
    );
  };

  const removeMedicine = (id: string) => {
    setMedicines(prev => prev.filter(m => m.id !== id));
  };

  const handleSave = async (shouldPrint = false) => {
    setSaving(true); setErr("");
    try {
      const notesToSave = doctorNotes.trim();

      if (appt?.id) {
        await fetch(`${BASE}/api/online-appointments/doctor/${appt.id}/notes`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: notesToSave }),
        }).catch(() => {});
      }

      const rxObj = { photoObjectPath: null, notes: notesToSave, updatedAt: new Date().toISOString() };
      onSaved(rxObj);

      if (shouldPrint) {
        setPrintData({
          patientName: patientFullName,
          patientCode: patientIdStr,
          age: patientAge,
          gender: patientGender,
          consultDate: consultDate,
          medicines: medicines,
          doctorNotes: doctorNotes || "",
        });
      } else {
        onClose();
      }
    } catch (e: any) {
      setErr(e.message || "Failed to save prescription.");
    } finally {
      setSaving(false);
    }
  };

  if (printData) {
    return (
      <PrintPrescriptionModal
        data={printData}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-2xl max-w-4xl sm:max-w-5xl w-full overflow-hidden border border-gray-100 max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-150">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-xl text-slate-400 hover:text-[#D95B2F] hover:bg-[#FFF4EF] transition-colors cursor-pointer mr-1">
            <ArrowLeft size={18} />
          </button>
          <div className="w-9 h-9 rounded-xl bg-[#FFF4EF] border border-[#FDE8E0] flex items-center justify-center text-[#D95B2F] shrink-0">
            <ClipboardList size={18} />
          </div>
          <h3 className="font-extrabold text-[#1E293B] text-lg">Add Prescription</h3>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer">
          <X size={18} />
        </button>
      </div>

      {/* Main Body (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 bg-white">
        {/* Section 1: Patient Details */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-md bg-[#FFF4EF] text-[#D95B2F] flex items-center justify-center font-bold text-xs">
              <User size={12} />
            </div>
            <h4 className="font-bold text-sm text-[#1E293B]">Patient Details</h4>
          </div>

          <div className="bg-[#FAF8F5] border border-[#EDE8DF] rounded-2xl p-4 sm:p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              {/* Card 1 */}
              <div className="bg-white rounded-xl p-3 border border-[#E8E3DA] shadow-2xs">
                <label className="text-[10px] font-bold text-[#64748B] block mb-1 uppercase tracking-wider">Patient Full Name</label>
                <div className="flex items-center gap-2 text-xs font-bold text-[#1E293B]">
                  <User size={13} className="text-[#94A3B8] shrink-0" />
                  <input
                    type="text"
                    value={patientFullName}
                    onChange={e => setPatientFullName(e.target.value)}
                    placeholder="e.g. Sinjini Saha"
                    className="w-full bg-transparent focus:outline-none font-bold text-xs text-[#1E293B]"
                  />
                </div>
              </div>

              {/* Card 2 */}
              <div className="bg-white rounded-xl p-3 border border-[#E8E3DA] shadow-2xs">
                <label className="text-[10px] font-bold text-[#64748B] block mb-1 uppercase tracking-wider">Patient ID / IPD</label>
                <div className="flex items-center gap-2 text-xs font-bold text-[#1E293B]">
                  <span className="text-[#94A3B8] font-mono text-xs shrink-0">#</span>
                  <input
                    type="text"
                    value={patientIdStr}
                    onChange={e => setPatientIdStr(e.target.value)}
                    placeholder="e.g. #A115"
                    className="w-full bg-transparent focus:outline-none font-bold text-xs text-[#1E293B]"
                  />
                </div>
              </div>

              {/* Card 3 */}
              <div className="bg-white rounded-xl p-3 border border-[#E8E3DA] shadow-2xs">
                <label className="text-[10px] font-bold text-[#64748B] block mb-1 uppercase tracking-wider">Age</label>
                <div className="flex items-center gap-2 text-xs font-bold text-[#1E293B]">
                  <User size={13} className="text-[#94A3B8] shrink-0" />
                  <input
                    type="text"
                    value={patientAge}
                    onChange={e => setPatientAge(e.target.value)}
                    placeholder="e.g. 34 Y"
                    className="w-full bg-transparent focus:outline-none font-bold text-xs text-[#1E293B]"
                  />
                </div>
              </div>

              {/* Card 4 */}
              <div className="bg-white rounded-xl p-3 border border-[#E8E3DA] shadow-2xs">
                <label className="text-[10px] font-bold text-[#64748B] block mb-1 uppercase tracking-wider">Gender</label>
                <div className="flex items-center gap-2 text-xs font-bold text-[#1E293B]">
                  <User size={13} className="text-[#94A3B8] shrink-0" />
                  <select
                    value={patientGender}
                    onChange={e => setPatientGender(e.target.value)}
                    className="w-full bg-transparent focus:outline-none font-bold text-xs text-[#1E293B] cursor-pointer"
                  >
                    <option value="">Select Gender</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Card 5 */}
              <div className="bg-white rounded-xl p-3 border border-[#E8E3DA] shadow-2xs">
                <label className="text-[10px] font-bold text-[#64748B] block mb-1 uppercase tracking-wider">Date & Time Of Consult</label>
                <div className="flex items-center gap-2 text-xs font-bold text-[#1E293B]">
                  <Calendar size={13} className="text-[#94A3B8] shrink-0" />
                  <input
                    type="text"
                    value={consultDate}
                    onChange={e => setConsultDate(e.target.value)}
                    placeholder="e.g. 24 Oct 2026 • 11:30 AM"
                    className="w-full bg-transparent focus:outline-none font-bold text-xs text-[#1E293B]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Ayurvedic Medicinal Formulations */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-[#FFF4EF] text-[#D95B2F] flex items-center justify-center font-bold text-xs">
                <Plus size={12} />
              </div>
              <h4 className="font-bold text-sm text-[#1E293B]">Ayurvedic Medicinal Formulations</h4>
            </div>

            {medicines.length > 0 && (
              <button
                type="button"
                onClick={addMedicine}
                className="bg-[#FFF4EF] hover:bg-[#FDE8E0] text-[#D95B2F] border border-[#FDE8E0] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
              >
                <Plus size={14} /> Add Medicine
              </button>
            )}
          </div>

          {medicines.length === 0 ? (
            /* Empty State (Image 1) */
            <div className="border-2 border-dashed border-[#E2E4DE] bg-white rounded-2xl p-10 sm:p-12 flex flex-col items-center justify-center text-center">
              <button
                type="button"
                onClick={addMedicine}
                className="w-10 h-10 rounded-xl bg-[#FFF4EF] border border-[#FDE8E0] text-[#D95B2F] flex items-center justify-center hover:bg-[#FDE8E0] cursor-pointer transition-colors mb-3 shadow-2xs"
              >
                <Plus size={20} />
              </button>
              <h5 className="font-bold text-sm text-[#1E293B]">No medicines added yet</h5>
              <p className="text-xs text-[#64748B] mt-1 max-w-sm">
                Click the button below to add Ayurvedic formulations to this prescription.
              </p>
            </div>
          ) : (
            /* Medicines Form Table (Image 2) */
            <div className="border border-[#E2E4DE] rounded-2xl overflow-hidden bg-white shadow-2xs">
              {/* Header Row */}
              <div className="bg-[#F0EDE8] py-3 px-4 text-[11px] font-bold text-[#475569] grid grid-cols-12 gap-2 items-center tracking-wide border-b border-[#E2E4DE]">
                <div className="col-span-1 text-center">S.NO</div>
                <div className="col-span-3 font-bold">Medicine & Formulation</div>
                <div className="col-span-6 text-center font-bold">
                  Dosage Timing & Food Association
                  <div className="grid grid-cols-3 gap-2 mt-1 text-[10px] font-semibold text-[#64748B]">
                    <span>Morning</span>
                    <span>Afternoon</span>
                    <span>Night</span>
                  </div>
                </div>
                <div className="col-span-1.5 text-center font-bold">Duration</div>
                <div className="col-span-0.5 text-right font-bold">Action</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-100">
                {medicines.map((m, idx) => (
                  <div key={m.id} className="p-3.5 grid grid-cols-12 gap-2.5 items-center text-xs bg-white hover:bg-slate-50/50 transition-colors">
                    {/* S.NO */}
                    <div className="col-span-1 text-center font-extrabold text-[#1E293B] text-xs">
                      {String(idx + 1).padStart(2, "0")}
                    </div>

                    {/* Medicine Name */}
                    <div className="col-span-3">
                      <input
                        type="text"
                        list="ayurvedic-meds-list"
                        value={m.name}
                        onChange={e => updateMedicine(m.id, "name", e.target.value)}
                        placeholder="e.g. Bilwadi Gutika / Dashamularishta"
                        className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] bg-white text-xs font-semibold text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F]"
                      />
                    </div>

                    {/* Dosage Timing (3 Cards) */}
                    <div className="col-span-6">
                      <div className="grid grid-cols-3 gap-2">
                        {/* Morning */}
                        <div className="bg-[#FAF9F5] border border-[#EAE5DC] rounded-xl p-2 text-center">
                          <span className="text-[10px] font-bold text-[#64748B] block mb-1">Breakfast</span>
                          <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-[#1E293B]">
                            <label className="flex items-center gap-1 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={m.morningBefore}
                                onChange={e => updateMedicine(m.id, "morningBefore", e.target.checked)}
                                className="rounded text-[#D95B2F] focus:ring-[#D95B2F]"
                              /> Before
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={m.morningAfter}
                                onChange={e => updateMedicine(m.id, "morningAfter", e.target.checked)}
                                className="rounded text-[#D95B2F] focus:ring-[#D95B2F]"
                              /> After
                            </label>
                          </div>
                        </div>

                        {/* Afternoon */}
                        <div className="bg-[#FAF9F5] border border-[#EAE5DC] rounded-xl p-2 text-center">
                          <span className="text-[10px] font-bold text-[#64748B] block mb-1">Lunch</span>
                          <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-[#1E293B]">
                            <label className="flex items-center gap-1 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={m.afternoonBefore}
                                onChange={e => updateMedicine(m.id, "afternoonBefore", e.target.checked)}
                                className="rounded text-[#D95B2F] focus:ring-[#D95B2F]"
                              /> Before
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={m.afternoonAfter}
                                onChange={e => updateMedicine(m.id, "afternoonAfter", e.target.checked)}
                                className="rounded text-[#D95B2F] focus:ring-[#D95B2F]"
                              /> After
                            </label>
                          </div>
                        </div>

                        {/* Night */}
                        <div className="bg-[#FAF9F5] border border-[#EAE5DC] rounded-xl p-2 text-center">
                          <span className="text-[10px] font-bold text-[#64748B] block mb-1">Dinner</span>
                          <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-[#1E293B]">
                            <label className="flex items-center gap-1 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={m.nightBefore}
                                onChange={e => updateMedicine(m.id, "nightBefore", e.target.checked)}
                                className="rounded text-[#D95B2F] focus:ring-[#D95B2F]"
                              /> Before
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={m.nightAfter}
                                onChange={e => updateMedicine(m.id, "nightAfter", e.target.checked)}
                                className="rounded text-[#D95B2F] focus:ring-[#D95B2F]"
                              /> After
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Duration */}
                    <div className="col-span-1.5">
                      <input
                        type="text"
                        value={m.duration}
                        onChange={e => updateMedicine(m.id, "duration", e.target.value)}
                        placeholder="e.g. 21 Days"
                        className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] bg-white text-xs font-semibold text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F]"
                      />
                    </div>

                    {/* Action (Delete) */}
                    <div className="col-span-0.5 text-right">
                      <button
                        type="button"
                        onClick={() => removeMedicine(m.id)}
                        className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <datalist id="ayurvedic-meds-list">
            <option value="Bilwadi Gutika" />
            <option value="Dashamoolarishta" />
            <option value="Ashwagandharishta" />
            <option value="Triphala Churna" />
            <option value="Kanakasava" />
            <option value="Chyawanprash" />
            <option value="Brahmi Vati" />
            <option value="Yograj Guggulu" />
            <option value="Saraswatarishta" />
          </datalist>
        </div>

        {/* Section 3: Doctor Notes */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-md bg-[#FFF4EF] text-[#D95B2F] flex items-center justify-center font-bold text-xs">
              <Plus size={12} />
            </div>
            <h4 className="font-bold text-sm text-[#1E293B]">Doctor Notes</h4>
          </div>

          <textarea
            rows={4}
            value={doctorNotes}
            onChange={e => setDoctorNotes(e.target.value)}
            placeholder={`Write clinical notes, observations, diagnosis, or follow-up instructions for ${patientName}...`}
            className="w-full px-4 py-3.5 rounded-2xl border border-[#CBD5E1] text-xs font-medium text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all bg-white"
          />
        </div>

        {err && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 flex items-center gap-2 text-xs text-red-700 font-medium">
            <AlertCircle size={14} className="shrink-0" /> {err}
          </div>
        )}
      </div>

      {/* Footer Bar */}
      <div className="bg-[#F0EDE8] px-6 py-4 flex items-center justify-end gap-3 border-t border-[#EAE6DF] shrink-0">
        <button
          type="button"
          onClick={() => handleSave(false)}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#475569] text-xs font-bold transition-all shadow-2xs cursor-pointer"
        >
          {saving ? "Saving..." : "Save Draft"}
        </button>

        <button
          type="button"
          onClick={() => handleSave(true)}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-[#D95B2F] hover:bg-[#c04e26] text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
        >
          {saving ? "Saving..." : "Print Prescription"}
        </button>
      </div>
    </div>
  );
}

// ── Rx Upload Panel ───────────────────────────────────────────────
function RxUploadPanel({ appt, initialFile, onSaved, onDocClick }: {
  appt: OnlineAppt;
  initialFile?: File | null;
  onSaved: (rx: Prescription) => void;
  onDocClick: (doc: DocFile) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [notes, setNotes] = useState(cleanDoctorNotes(appt.prescription?.notes));
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNotes(cleanDoctorNotes(appt.prescription?.notes));
    setPreview(null);
    setPendingFile(null);
    setSaved(false);
    if (initialFile) {
      handleFile(initialFile);
    }
  }, [appt.id, initialFile]);

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
    <div className="flex flex-col bg-white min-h-0">
      <div className="space-y-4">
        <div>
          <p className="text-[10px] font-bold text-gray-400 tracking-widest mb-2 flex items-center gap-1.5">
            <ImageIcon size={11} /> {rxExists ? "Replace Prescription Photo" : "Prescription Photo"}
          </p>
          {preview ? (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden border-2 border-[#D95B2F]/30 shadow-sm">
                <img src={preview} alt="Preview" className="w-full max-h-56 object-contain bg-gray-50" />
                <button onClick={() => { setPreview(null); setPendingFile(null); }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors">
                  <X size={14} />
                </button>
              </div>
              <p className="text-xs text-center text-emerald-600 font-medium flex items-center justify-center gap-1"><CheckCircle2 size={13} /> Photo ready to save</p>
            </div>
          ) : rxExists ? (
            <div className="mb-3">
              <div className="relative rounded-xl overflow-hidden border border-emerald-200 group cursor-pointer" onClick={() => onDocClick({ name: "Prescription", objectPath: appt.prescription!.photoObjectPath!, contentType: "image/jpeg", size: 0 })}>
                <img src={`${BASE}/api/storage${appt.prescription!.photoObjectPath!}`} alt="Rx" className="w-full max-h-36 object-contain bg-gray-50 group-hover:opacity-90 transition-opacity" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 text-gray-800 text-xs font-semibold px-2.5 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5">
                    <ZoomIn size={13} /> Preview
                  </span>
                </div>
              </div>
              <button className="text-xs text-[#D95B2F] font-semibold hover:underline mt-1" onClick={() => fileRef.current?.click()}>Upload new prescription photo</button>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col items-center justify-center gap-1.5 py-5 px-3 bg-[#D95B2F] text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-[#c84e24] transition-colors text-center shadow-sm">
                <Camera size={22} />
                <span>Take Photo</span>
                <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
              </label>
              <label className="flex flex-col items-center justify-center gap-1.5 py-5 px-3 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-semibold cursor-pointer hover:border-[#D95B2F] hover:text-[#D95B2F] transition-colors text-center"
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}>
                <FilePlus2 size={22} className={dragOver ? "text-[#D95B2F]" : ""} />
                <span>Browse File</span>
                <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
              </label>
            </div>
          )}
        </div>

        <div>
          <p className="text-[10px] font-bold text-gray-400 tracking-widest mb-2 flex items-center gap-1.5"><StickyNote size={11} /> Clinical Notes & Prescription Instructions</p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Write clinical notes, observations, diagnosis, or prescription instructions..."
            rows={4}
            className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F]/50 bg-white placeholder-gray-400 text-gray-700 leading-relaxed"
          />
        </div>

        {err && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 flex items-start gap-2 text-xs text-red-700 font-medium">
            <AlertCircle size={14} className="shrink-0 mt-0.5" /> {err}
          </div>
        )}
        {saved && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5 flex items-center gap-2 text-xs text-emerald-700 font-semibold">
            <CheckCircle2 size={14} /> Prescription details saved successfully!
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={uploading || saved}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer",
            saved ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
              : uploading ? "bg-[#D95B2F]/70 text-white cursor-wait"
              : "bg-[#D95B2F] hover:bg-[#c84e24] text-white shadow-sm"
          )}>
          {uploading ? <><Loader2 size={16} className="animate-spin" /> Saving…</>
            : saved ? <><CheckCircle2 size={16} /> Prescription Saved</>
            : <><Save size={16} /> Save Prescription</>}
        </button>
      </div>
    </div>
  );
}

// ── Notes Editor Component ───────────────────────────────────────
function NotesEditor({ apptId, isOnline, initialNotes, patientName, onSaved }: { apptId: number; isOnline: boolean; initialNotes: string; patientName: string; onSaved: (notes: string) => void }) {
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setNotes(initialNotes); setSaved(false); }, [initialNotes, apptId]);

  async function handleSave() {
    setSaving(true); setError(""); setSaved(false);
    try {
      if (isOnline) {
        const res = await fetch(`${BASE}/api/online-appointments/doctor/${apptId}/notes`, {
          method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes }),
        });
        if (!res.ok) throw new Error("Failed to save notes");
      } else {
        const res = await fetch(`${BASE}/api/doctor/offline-appointments/${apptId}/notes`, {
          method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes }),
        });
        if (!res.ok) throw new Error("Failed to save notes");
      }
      setSaved(true); onSaved(notes);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError("Failed to save notes."); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder={`Write clinical notes, observations, diagnosis, or follow-up instructions for ${patientName}...`}
        rows={4}
        className="w-full text-sm border border-gray-200/90 rounded-xl px-4 py-3.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F]/50 bg-white placeholder-gray-400 text-gray-700 leading-relaxed transition-all shadow-inner"
      />
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
      <div className="flex items-center justify-between pt-1">
        {saved ? (
          <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle2 size={13} /> Notes saved</span>
        ) : <span />}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-[#D95B2F] hover:bg-[#c84e24] text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          <span>Save</span>
        </button>
      </div>
    </div>
  );
}

// ── Main Doctor Portal Component ──────────────────────────────────
export default function DoctorPortal() {
  const [, nav] = useLocation();
  const [online, setOnline] = useState<OnlineAppt[]>([]);
  const [offline, setOffline] = useState<OfflineAppt[]>([]);
  const [registeredPatients, setRegisteredPatients] = useState<RegisteredPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [section, setSection] = useState<Section>("online");

  const [patientSearch, setPatientSearch] = useState("");
  const [lastSeenPatientCount, setLastSeenPatientCount] = useState<number>(() => {
    const saved = localStorage.getItem("doctor_last_seen_patient_count");
    return saved !== null ? parseInt(saved, 10) : -1;
  });

  useEffect(() => {
    if (section === "patients" && registeredPatients.length >= 0) {
      setLastSeenPatientCount(registeredPatients.length);
      localStorage.setItem("doctor_last_seen_patient_count", registeredPatients.length.toString());
    }
  }, [section, registeredPatients.length]);

  useEffect(() => {
    if (lastSeenPatientCount === -1 && registeredPatients.length > 0) {
      setLastSeenPatientCount(registeredPatients.length);
      localStorage.setItem("doctor_last_seen_patient_count", registeredPatients.length.toString());
    }
  }, [lastSeenPatientCount, registeredPatients.length]);

  const newPatientsCount = useMemo(() => {
    if (lastSeenPatientCount < 0) return 0;
    return Math.max(0, registeredPatients.length - lastSeenPatientCount);
  }, [registeredPatients.length, lastSeenPatientCount]);

  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return registeredPatients;
    const q = patientSearch.toLowerCase().trim();
    return registeredPatients.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.patientCode?.toLowerCase().includes(q) ||
      p.phone?.includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      `p${String(p.id).padStart(3, "0")}`.includes(q) ||
      `a00${p.id}`.includes(q)
    );
  }, [registeredPatients, patientSearch]);

  // Selection states
  const [selectedApptId, setSelectedApptId] = useState<number | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);

  const [previewDoc, setPreviewDoc] = useState<DocFile | null>(null);
  const [showUploadDocModal, setShowUploadDocModal] = useState(false);
  const [showAddRxModal, setShowAddRxModal] = useState(false);
  const [activePrintData, setActivePrintData] = useState<any>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const now = new Date();
  const [filterMonth, setFilterMonth] = useState<number>(now.getMonth() + 1);
  const [filterYear, setFilterYear] = useState<number>(now.getFullYear());
  const [allTime, setAllTime] = useState(false);
  const [donationSearch, setDonationSearch] = useState("");
  const [selectedDonationId, setSelectedDonationId] = useState<number | null>(null);

  const [donations, setDonations] = useState<DonationRow[]>([]);
  const [donationsLoading, setDonationsLoading] = useState(false);
  const [donationToast, setDonationToast] = useState<string | null>(null);

  const [incomingOnlineCall, setIncomingOnlineCall] = useState<{
    id: number; patientName: string; patientCode?: string | null;
  } | null>(null);

  const [incomingDirectCall, setIncomingDirectCall] = useState<{
    id: number; patientName: string; patientCode?: string | null;
  } | null>(null);

  const [doctorVideoCallApptId, setDoctorVideoCallApptId] = useState<number | null>(null);
  const [doctorDirectCallId, setDoctorDirectCallId] = useState<number | null>(null);

  const listPanel = useDragResize(300, 240, 500);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    setErr("");
    const startTime = Date.now();
    try {
      const [apptData, patientsData] = await Promise.all([
        doctorFetch("/all-appointments"),
        doctorFetch("/patients"),
      ]);
      const onlineAppts: OnlineAppt[] = apptData.online ?? [];
      const offlineAppts: OfflineAppt[] = apptData.offline ?? [];
      setOnline(onlineAppts);
      setOffline(offlineAppts);
      setRegisteredPatients(patientsData ?? []);
      setLastRefresh(new Date());

      // Check active direct call for doctor
      fetch(`${BASE}/api/direct-calls/doctor/active`, { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then((activeCalls: any[]) => {
          if (activeCalls && activeCalls.length > 0) {
            const firstCall = activeCalls[0];
            setIncomingDirectCall({
              id: firstCall.id,
              patientName: firstCall.patient?.name || "Patient",
              patientCode: firstCall.patient?.patientCode || null,
            });
          }
        })
        .catch(() => {});

      // Auto selection logic on initial load (only select from upcoming)
      if (!selectedApptId) {
        const upcoming = onlineAppts.filter(a => isUpcoming(a.date, a.status));
        if (upcoming.length > 0) {
          setSelectedApptId(upcoming[0].id);
        } else {
          setSelectedApptId(null);
        }
      }
    } catch { if (!silent) setErr("Failed to load data"); }
    finally {
      if (!silent) setLoading(false);
      const elapsed = Date.now() - startTime;
      const delay = Math.max(0, 450 - elapsed);
      setTimeout(() => setRefreshing(false), delay);
    }
  }, [selectedApptId]);

  const loadDonations = useCallback(async () => {
    setDonationsLoading(true);
    try {
      const params = allTime ? "" : `?month=${filterMonth}&year=${filterYear}`;
      const data = await doctorFetch(`/donations${params}`);
      setDonations(Array.isArray(data) ? data : []);
    } catch {}
    setDonationsLoading(false);
  }, [filterMonth, filterYear, allTime]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (section === "donations") {
      loadDonations();
    }
  }, [section, loadDonations]);

  // Real-time SSE listener for online appointments
  useEffect(() => {
    const es = new EventSource(`${BASE}/api/doctor/online-appointments/sse`, { withCredentials: true });
    es.addEventListener("new_online_appointment", (e) => {
      const appt = JSON.parse((e as MessageEvent).data) as OnlineAppt;
      setOnline(prev => {
        if (prev.some(a => a.id === appt.id)) return prev;
        return [appt, ...prev];
      });
    });
    es.addEventListener("appointment_updated", (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as {
        id: number; joinEnabled: boolean; status: string; patientName?: string; patientCode?: string | null; roomName?: string;
      };
      setOnline(prev => {
        const found = prev.find(a => a.id === payload.id);
        const resolvedName = payload.patientName || found?.patient.name || "Patient";
        const resolvedCode = payload.patientCode || found?.patient.patientCode;

        if (payload.joinEnabled) {
          playDoctorCallAlert(resolvedName);
          setIncomingOnlineCall({ id: payload.id, patientName: resolvedName, patientCode: resolvedCode });
        } else {
          setIncomingOnlineCall(prevCall => prevCall?.id === payload.id ? null : prevCall);
        }

        return prev.map(a =>
          a.id === payload.id ? { ...a, joinEnabled: payload.joinEnabled, status: payload.status } : a
        );
      });
    });
    es.addEventListener("direct_call_updated", (e) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data) as {
          id: number; status: string; roomName?: string; patient?: { name: string; patientCode: string | null };
        };
        if (payload.status === "active") {
          const patientName = payload.patient?.name || "Patient";
          const patientCode = payload.patient?.patientCode || null;
          playDoctorCallAlert(patientName);
          setIncomingDirectCall({ id: payload.id, patientName, patientCode });
        } else {
          setIncomingDirectCall(prevCall => prevCall?.id === payload.id ? null : prevCall);
          setDoctorDirectCallId(prevId => prevId === payload.id ? null : prevId);
        }
      } catch (err) {
        console.error("[Doctor SSE] direct_call_updated error:", err);
      }
    });
    return () => es.close();
  }, []);

  // Real-time SSE listener for donations
  useEffect(() => {
    const es = new EventSource(`${BASE}/api/doctor/donations/sse`, { withCredentials: true });
    es.addEventListener("donation_updated", (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as { id: number; status: string; thankYouSent?: boolean };
      setDonations(prev => prev.map(d =>
        d.id === payload.id
          ? { ...d, status: payload.status as "pending" | "verified", ...(payload.thankYouSent !== undefined ? { thankYouSent: payload.thankYouSent } : {}) }
          : d
      ));
    });
    es.addEventListener("new_donation", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as DonationRow;
      setDonations(prev => [d, ...prev]);
    });
    return () => es.close();
  }, []);

  async function logout() {
    await doctorFetch("/logout", { method: "POST" });
    nav("/doctor");
  }

  function handlePrescriptionUploaded(apptId: number, rx: Prescription) {
    setOnline(prev => prev.map(a => a.id === apptId ? { ...a, prescription: rx } : a));
    setRegisteredPatients(prev => prev.map(p => ({
      ...p,
      appointments: p.appointments.map(a => a.id === apptId ? { ...a, prescription: rx } : a),
    })));
  }

  function handleDocumentUploaded(apptId: number, doc: DocFile) {
    setOnline(prev => prev.map(a => a.id === apptId ? { ...a, documents: [...(a.documents || []), doc] } : a));
    setRegisteredPatients(prev => prev.map(p => {
      const isTarget = p.appointments.some(a => a.id === apptId) || (selectedPatientId === p.id);
      if (isTarget) {
        return { ...p, documents: [...(p.documents || []), doc] };
      }
      return p;
    }));
  }

  async function markOfflineCompleted(id: number) {
    try {
      await doctorFetch(`/offline-appointments/${id}/done`, { method: "PATCH" });
      setOffline(prev => prev.map(a => a.id === id ? { ...a, status: "completed" } : a));
    } catch (e) {
      console.error("Failed to complete offline appt:", e);
    }
  }

  async function toggleVerifyDonation(d: DonationRow) {
    const newVerified = d.status !== "verified";
    try {
      await doctorFetch(`/donations/${d.id}/verify`, {
        method: "PATCH",
        body: JSON.stringify({ verified: newVerified }),
      });
      setDonations(prev => prev.map(x => x.id === d.id ? { ...x, status: newVerified ? "verified" : "pending" } : x));
    } catch {}
  }

  async function sendDonationThankYou(d: DonationRow) {
    setDonationToast(`Sending to ${d.patientName || "Patient"}…`);
    try {
      const res = await doctorFetch(`/donations/${d.id}/thank-you`, { method: "POST" });
      if (res && !res.error && !res.message) {
        setDonations(prev => prev.map(x => x.id === d.id ? { ...x, thankYouSent: true } : x));
        setDonationToast("Thank you email sent!");
      } else {
        setDonationToast(res?.message || "Failed to send email. Check SMTP settings.");
      }
    } catch (e: any) {
      setDonationToast(e?.message || "Failed to send email.");
    }
    setTimeout(() => setDonationToast(null), 3500);
  }

  async function handleCallEnded(apptId: number) {
    setOnline(prev => prev.map(a => a.id === apptId ? { ...a, joinEnabled: false, status: "completed" } : a));
    try { await doctorFetch(`/online-appointments/${apptId}/complete`, { method: "POST" }); } catch {}
  }

  // Derived datasets
  const upcomingOnline = useMemo(() => online.filter(a => isUpcoming(a.date, a.status)).sort((a, b) => a.date.localeCompare(b.date)), [online]);
  const upcomingOffline = useMemo(() => offline.filter(a => isUpcoming(a.date, a.status)).sort((a, b) => a.date.localeCompare(b.date)), [offline]);
  const rxNeeded = useMemo(() => online.filter(a => a.status === "completed" && !a.joinEnabled && !a.prescription?.photoObjectPath).sort((a, b) => b.date.localeCompare(a.date)), [online]);

  const filteredDonations = useMemo(() => {
    return donations.filter(d => {
      if (!donationSearch.trim()) return true;
      const q = donationSearch.toLowerCase();
      return (
        d.patientName?.toLowerCase().includes(q) ||
        d.patientCode?.toLowerCase().includes(q) ||
        d.lastSixDigits?.includes(q) ||
        d.amount?.includes(q)
      );
    });
  }, [donations, donationSearch]);

  const totalDonationAmount = useMemo(() => {
    return filteredDonations.filter(d => d.status === "verified").reduce((sum, d) => sum + parseFloat(d.amount || "0"), 0);
  }, [filteredDonations]);

  const verifiedDonationCount = useMemo(() => {
    return filteredDonations.filter(d => d.status === "verified").length;
  }, [filteredDonations]);

  const pendingDonationCount = useMemo(() => {
    return filteredDonations.filter(d => d.status === "pending").length;
  }, [filteredDonations]);

  const donorCount = useMemo(() => {
    return new Set(filteredDonations.map(d => d.patientCode || d.patientEmail || d.patientName).filter(Boolean)).size;
  }, [filteredDonations]);

  const years = useMemo(() => {
    const currentY = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => currentY - i);
  }, []);

  const navItems = [
    { key: "online" as Section,    label: "Online Slots", shortLabel: "Online",   icon: <Video size={18} />,        count: upcomingOnline.length },
    { key: "offline" as Section,   label: "Offline Slots",    shortLabel: "Visits",   icon: <Building2 size={18} />,    count: upcomingOffline.length },
    { key: "rxneeded" as Section,  label: "Rx needed",    shortLabel: "Rx",       icon: <ClipboardList size={18} />,count: rxNeeded.length, amber: true },
    { key: "patients" as Section,  label: "Patients",     shortLabel: "Patients", icon: <UserCheck size={18} />,    count: newPatientsCount },
    { key: "donations" as Section, label: "Donations",    shortLabel: "Donate",   icon: <Heart size={18} />,        count: filteredDonations.length },
  ];

  // Handle switching sections strictly reset selection if section is empty
  function selectSection(s: Section) {
    setSection(s);
    setPreviewDoc(null);
    if (s === "online") {
      const first = upcomingOnline[0];
      setSelectedApptId(first ? first.id : null);
      setSelectedPatientId(null);
    } else if (s === "offline") {
      const first = upcomingOffline[0];
      setSelectedApptId(first ? first.id : null);
      setSelectedPatientId(null);
    } else if (s === "rxneeded") {
      const first = rxNeeded[0];
      setSelectedApptId(first ? first.id : null);
      setSelectedPatientId(null);
    } else if (s === "patients") {
      setLastSeenPatientCount(registeredPatients.length);
      localStorage.setItem("doctor_last_seen_patient_count", registeredPatients.length.toString());
      const first = filteredPatients[0] || registeredPatients[0];
      setSelectedPatientId(first ? first.id : null);
      setSelectedApptId(null);
    } else if (s === "donations") {
      setSelectedApptId(null);
      setSelectedPatientId(null);
      loadDonations();
    }
  }

  // Find currently selected appointment STRICTLY bound to the current active section
  const selectedAppt: AnyAppt | null = useMemo(() => {
    if (!selectedApptId) return null;
    if (section === "online") {
      return upcomingOnline.find(a => a.id === selectedApptId) ?? null;
    }
    if (section === "offline") {
      return upcomingOffline.find(a => a.id === selectedApptId) ?? null;
    }
    if (section === "rxneeded") {
      return rxNeeded.find(a => a.id === selectedApptId) ?? null;
    }
    return null;
  }, [section, selectedApptId, upcomingOnline, upcomingOffline, rxNeeded]);

  const selectedPatient: RegisteredPatient | null = useMemo(() => {
    if (section !== "patients" || !selectedPatientId) return null;
    return registeredPatients.find(p => p.id === selectedPatientId) ?? null;
  }, [section, selectedPatientId, registeredPatients]);

  const activeApptForPatient: OnlineAppt | null = useMemo(() => {
    if (section !== "patients" || !selectedPatient) return null;
    const foundOnline = online.find(a => a.patient.id === selectedPatient.id || a.patient.name === selectedPatient.name);
    if (foundOnline) return foundOnline;
    const firstAppt = selectedPatient.appointments[0];
    return {
      id: firstAppt?.id || selectedPatient.id,
      type: "online" as const,
      status: firstAppt?.status || "pending",
      reason: firstAppt?.reason || null,
      documents: firstAppt?.documents || [],
      patientDocs: selectedPatient.documents || [],
      joinEnabled: false,
      createdAt: selectedPatient.createdAt || new Date().toISOString(),
      date: firstAppt?.date || todayIST(),
      timeLabel: firstAppt?.timeLabel || "OPD",
      slotId: 0,
      patient: {
        id: selectedPatient.id,
        patientCode: selectedPatient.patientCode,
        name: selectedPatient.name,
        email: selectedPatient.email,
        phone: selectedPatient.phone,
      },
      prescription: firstAppt?.prescription || null,
    };
  }, [section, selectedPatient, online]);

  // Consolidate real patient documents (no hardcoded dummy data)
  const patientDocsList: DocFile[] = useMemo(() => {
    if (!selectedAppt) return [];
    const apptDocs = (selectedAppt.documents || []).filter(d => d && (d.objectPath || d.name));
    if (apptDocs.length > 0) {
      return apptDocs;
    }
    const patientHistoryDocs = (selectedAppt.patientDocs || []).filter(d => d && (d.objectPath || d.name));
    const map = new Map<string, DocFile>();
    patientHistoryDocs.forEach(d => {
      if (d && (d.objectPath || d.name)) {
        map.set(d.objectPath || d.name, d);
      }
    });
    return Array.from(map.values());
  }, [selectedAppt]);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }} className="doctor-portal h-[100dvh] flex flex-col bg-[#F8F9FA] text-[#42493E] overflow-hidden">
      {/* Toast Notification */}
      {donationToast && (
        <div className="fixed top-4 right-4 z-50 bg-[#D95B2F] text-white px-4 py-3 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} /> {donationToast}
        </div>
      )}

      {/* Incoming Online Call Modal */}
      {incomingOnlineCall && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center border border-emerald-100 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4 relative">
              <div className="absolute inset-0 rounded-full bg-emerald-400 opacity-40 animate-ping" />
              <div className="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center text-white shadow-lg">
                <Video size={24} />
              </div>
            </div>
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 mb-2">
              Incoming Online Consultation
            </span>
            <h2 className="text-xl font-extrabold text-gray-900 mb-1">{incomingOnlineCall.patientName}</h2>
            <p className="text-xs font-mono text-gray-500 mb-4">Patient Code: {incomingOnlineCall.patientCode || "N/A"}</p>
            <button
              onClick={() => {
                const callId = incomingOnlineCall.id;
                setIncomingOnlineCall(null);
                setSection("online");
                setSelectedApptId(callId);
                setDoctorVideoCallApptId(callId);
                fetch(`${BASE}/api/online-appointments/doctor/${callId}/joined`, {
                  method: "POST",
                  credentials: "include",
                }).catch(() => {});
              }}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl text-sm transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <Video size={18} /> Join Consultation Call
            </button>
          </div>
        </div>
      )}

      {/* Doctor Full Screen Video Call Overlay */}
      {doctorVideoCallApptId && (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col animate-in fade-in duration-200">
          <div className="h-14 px-6 flex items-center justify-between bg-[#1c1c1e] border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
              <p className="text-white text-sm font-bold">
                Online Consultation Session
                {(() => {
                  const appt = online.find(a => a.id === doctorVideoCallApptId);
                  return appt ? ` (${appt.patient.name})` : "";
                })()}
              </p>
            </div>
            <button
              onClick={() => {
                const endedId = doctorVideoCallApptId;
                setDoctorVideoCallApptId(null);
                if (endedId) handleCallEnded(endedId);
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              Leave Call
            </button>
          </div>
          <div className="flex-1 min-h-0 relative">
            <VideoCall
              apptId={doctorVideoCallApptId}
              role="doctor"
              autoJoin
              className="h-full rounded-none border-0"
              onCallEnded={() => {
                const endedId = doctorVideoCallApptId;
                setDoctorVideoCallApptId(null);
                if (endedId) handleCallEnded(endedId);
              }}
            />
          </div>
        </div>
      )}

      {/* Incoming Direct Call Modal (Doctor) */}
      {incomingDirectCall && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center border border-emerald-100 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4 relative">
              <div className="absolute inset-0 rounded-full bg-emerald-400 opacity-40 animate-ping" />
              <div className="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center text-white shadow-lg">
                <Video size={24} />
              </div>
            </div>
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 mb-2">
              Incoming Direct Patient Call
            </span>
            <h2 className="text-xl font-extrabold text-gray-900 mb-1">{incomingDirectCall.patientName}</h2>
            <p className="text-xs font-mono text-gray-500 mb-4">Patient Code: {incomingDirectCall.patientCode || "N/A"}</p>
            <button
              onClick={() => {
                const callId = incomingDirectCall.id;
                setIncomingDirectCall(null);
                setDoctorDirectCallId(callId);
              }}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl text-sm transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <Video size={18} /> Join Direct Call
            </button>
          </div>
        </div>
      )}

      {/* Doctor Full Screen Direct Video Call Overlay */}
      {doctorDirectCallId && (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col animate-in fade-in duration-200">
          <div className="h-14 px-6 flex items-center justify-between bg-[#1c1c1e] border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
              <p className="text-white text-sm font-bold">
                Direct Patient Call
              </p>
            </div>
            <button
              onClick={() => {
                const endedId = doctorDirectCallId;
                setDoctorDirectCallId(null);
                if (endedId) {
                  fetch(`${BASE}/api/direct-calls/doctor/${endedId}/end`, { method: "POST", credentials: "include" }).catch(() => {});
                }
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              Leave Call
            </button>
          </div>
          <div className="flex-1 min-h-0 relative">
            <VideoCall
              directCallId={doctorDirectCallId}
              role="doctor"
              autoJoin
              className="h-full rounded-none border-0"
              onCallEnded={() => {
                const endedId = doctorDirectCallId;
                setDoctorDirectCallId(null);
                if (endedId) {
                  fetch(`${BASE}/api/direct-calls/doctor/${endedId}/end`, { method: "POST", credentials: "include" }).catch(() => {});
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── 1. LEFT SIDEBAR (Matching Admin & Patient Layout Standard) ── */}
        <aside className="w-64 md:w-[282px] bg-white border-r border-[#EDEFEB] text-[#42493E] flex flex-col shrink-0 h-screen sticky top-0 select-none">
          {/* Logo Header */}
          <div className="px-6 pt-3 pb-4 border-b border-[#EDEFEB] shrink-0">
            <img src={logoImg} alt="Susruta Hospital" className="h-9 w-auto max-w-[219px] object-contain" />
            <p className="text-xs font-semibold tracking-widest mt-1 uppercase text-[#42493E]">
              Doctor Portal
            </p>
          </div>

          {/* Navigation List matching AdminLayout */}
          <nav className="flex-1 py-2 overflow-y-auto space-y-0.5">
            {navItems.map(item => {
              const active = section === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => selectSection(item.key)}
                  className={cn(
                    "w-full flex items-center gap-3 px-6 py-2.5 text-sm transition-all duration-150 relative text-left group cursor-pointer",
                    active
                      ? "bg-[#D95B2F]/10 text-[#D95B2F] font-semibold border-r-[5px] border-[#D95B2F] shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                      : "text-[#42493E] font-normal hover:bg-[#D95B2F]/5 hover:text-[#D95B2F]"
                  )}
                >
                  <span className={cn("shrink-0 transition-colors", active ? "text-[#D95B2F]" : "text-[#42493E]")}>
                    {item.icon}
                  </span>
                  <span className="flex-1 text-sm font-medium">{item.label}</span>

                  {item.count > 0 && (
                    <span className={cn(
                      "text-[10px] font-extrabold px-2 py-0.5 rounded-full min-w-[20px] text-center shrink-0 ml-auto",
                      active ? "bg-[#D95B2F] text-white" : "bg-[#EDEFEB] text-[#42493E]"
                    )}>
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* System Footer matching Admin Layout */}
          <div className="p-4 border-t border-[#EDEFEB] shrink-0 space-y-1 bg-white">
            <p className="px-2 pb-1 text-[10px] font-bold text-[#8E938B] tracking-wider">System</p>
            <button
              onClick={logout}
              className="w-full flex items-center gap-2.5 px-2 py-2 text-xs font-bold text-[#D95B2F] hover:bg-[#D95B2F]/10 rounded-lg transition-colors text-left cursor-pointer"
            >
              <LogOut size={16} className="text-[#D95B2F]" />
              <span>Logout</span>
            </button>
            <a href="/" className="flex items-center gap-1.5 px-2 py-2 text-xs text-[#8E938B] hover:text-[#42493E] font-medium transition-colors">
              <ChevronLeft size={14} /> Back to Website
            </a>
          </div>
        </aside>

        {/* ── 2. SECOND COLUMN: APPOINTMENT / PATIENT LIST (Omitted on Donations section) ────────────────────── */}
        {section !== "donations" && (
          <>
            <div style={{ width: listPanel.width }} className="shrink-0 bg-white border-r border-[#EDEFEB] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="p-4 bg-white border-b border-[#F3F4F6] shrink-0 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-[#111827] text-base">
                    {section === "online" ? "Online Consultations"
                      : section === "offline" ? "Offline Consultations"
                      : section === "rxneeded" ? "Rx Needed"
                      : "Registered Patients"}
                  </h2>
                  <p className="text-xs text-[#9CA3AF] font-medium mt-0.5">
                    {section === "online" ? `${upcomingOnline.length} upcoming`
                      : section === "offline" ? `${upcomingOffline.length} upcoming`
                      : section === "rxneeded" ? `${rxNeeded.length} awaiting`
                      : patientSearch.trim() ? `${filteredPatients.length} of ${registeredPatients.length} registered`
                      : `${registeredPatients.length} registered`}
                  </p>
                </div>
                <button
                  onClick={() => load(true)}
                  disabled={refreshing}
                  className="p-1.5 text-gray-400 hover:text-[#D95B2F] hover:bg-orange-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  title="Refresh"
                >
                  <RefreshCw size={14} className={refreshing ? "animate-spin text-[#D95B2F]" : ""} />
                </button>
              </div>

              {/* Patient Search Bar below header */}
              {section === "patients" && (
                <div className="px-3.5 py-2.5 bg-white border-b border-[#EDEFEB] shrink-0">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={patientSearch}
                      onChange={e => setPatientSearch(e.target.value)}
                      placeholder="Search patient by name, code, phone..."
                      className="w-full pl-8 pr-7 py-1.5 text-xs bg-[#F8FAFC] border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#D95B2F] focus:bg-white text-gray-800 placeholder:text-gray-400 font-medium"
                    />
                    {patientSearch && (
                      <button
                        type="button"
                        onClick={() => setPatientSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded-full cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Dynamic List Render */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                {loading ? (
                  <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-300" /></div>
                ) : section === "online" ? (
                  upcomingOnline.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-xs font-medium">No upcoming online consultations</div>
                  ) : (
                    upcomingOnline.map(appt => {
                      const isSelected = selectedApptId === appt.id;
                      const isPending = appt.status === "pending";
                      const pCode = appt.patient?.patientCode || (appt.patient?.id ? `P${String(appt.patient.id).padStart(3, "0")}` : `P${String(appt.id).padStart(3, "0")}`);
                      return (
                        <div
                          key={appt.id}
                          onClick={() => setSelectedApptId(appt.id)}
                          className={cn(
                            "rounded-xl p-3.5 transition-all cursor-pointer select-none relative border border-transparent shadow-2xs",
                            isPending
                              ? "bg-[#FFFBF5]"
                              : "bg-[#F0F5FF]",
                            isSelected && "ring-2 ring-[#D95B2F]/40 shadow-sm"
                          )}
                        >
                          <div className="flex items-start justify-between mb-0.5">
                            <h3 className="font-bold text-[#1E293B] text-[15px] truncate mr-2">{appt.patient.name}</h3>
                            <span className={cn(
                              "text-[10px] px-2.5 py-0.5 rounded-md font-semibold shrink-0",
                              isPending
                                ? "bg-[#FEF3C7] text-[#D97706]"
                                : "bg-[#DBEAFE] text-[#1D4ED8] border border-[#BFDBFE]"
                            )}>
                              {isPending ? "Pending" : "Upcoming"}
                            </span>
                          </div>
                          <p className="text-sm font-extrabold text-[#1E293B] font-mono tracking-wide mb-1">
                            {pCode}
                          </p>
                          <p className="text-xs text-gray-500 font-medium">
                            {fmtDateShort(appt.date)} · {appt.timeLabel}
                          </p>
                          {appt.joinEnabled && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 mt-2 animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Live Call Ready
                            </span>
                          )}
                        </div>
                      );
                    })
                  )
                ) : section === "offline" ? (
                  upcomingOffline.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-xs font-medium">No upcoming offline visits</div>
                  ) : (
                    upcomingOffline.map(appt => {
                      const isSelected = selectedApptId === appt.id;
                      const isPending = appt.status === "pending";
                      const pCode = appt.patient?.patientCode || (appt.patient?.id ? `P${String(appt.patient.id).padStart(3, "0")}` : `P${String(appt.id).padStart(3, "0")}`);
                      return (
                        <div
                          key={appt.id}
                          onClick={() => setSelectedApptId(appt.id)}
                          className={cn(
                            "rounded-xl p-3.5 transition-all cursor-pointer select-none relative border border-transparent shadow-2xs",
                            isPending
                              ? "bg-[#FFFBF5]"
                              : "bg-[#F0F5FF]",
                            isSelected && "ring-2 ring-[#D95B2F]/40 shadow-sm"
                          )}
                        >
                          <div className="flex items-start justify-between mb-0.5">
                            <h3 className="font-bold text-[#1E293B] text-[15px] truncate mr-2">{appt.patient.name}</h3>
                            <span className={cn(
                              "text-[10px] px-2.5 py-0.5 rounded-md font-semibold shrink-0",
                              isPending
                                ? "bg-[#FEF3C7] text-[#D97706]"
                                : "bg-[#DBEAFE] text-[#1D4ED8] border border-[#BFDBFE]"
                            )}>
                              {isPending ? "Pending" : "Upcoming"}
                            </span>
                          </div>
                          <p className="text-sm font-extrabold text-[#1E293B] font-mono tracking-wide mb-1">
                            {pCode}
                          </p>
                          <p className="text-xs text-gray-500 font-medium">
                            {fmtDateShort(appt.date)} · {appt.timeLabel}
                          </p>
                        </div>
                      );
                    })
                  )
                ) : section === "rxneeded" ? (
                  rxNeeded.length === 0 ? (
                    <div className="text-center py-12 text-emerald-600 text-xs font-bold flex flex-col items-center gap-2">
                      <CheckCircle2 size={24} /> All prescriptions uploaded!
                    </div>
                  ) : (
                    rxNeeded.map(appt => {
                      const isSelected = selectedApptId === appt.id;
                      const pCode = appt.patient?.patientCode || (appt.patient?.id ? `P${String(appt.patient.id).padStart(3, "0")}` : `P${String(appt.id).padStart(3, "0")}`);
                      return (
                        <div
                          key={appt.id}
                          onClick={() => setSelectedApptId(appt.id)}
                          className={cn(
                            "rounded-xl p-3.5 transition-all cursor-pointer select-none relative bg-[#FFFBF5] border-l-4 border-l-[#E06D44] border border-transparent shadow-2xs",
                            isSelected && "ring-2 ring-[#D95B2F]/40 shadow-sm"
                          )}
                        >
                          <div className="flex items-start justify-between mb-0.5">
                            <h3 className="font-bold text-[#1E293B] text-[15px] truncate mr-2">{appt.patient.name}</h3>
                            <span className="text-[10px] px-2.5 py-0.5 rounded-md font-semibold bg-[#FEF3C7] text-[#D97706] shrink-0">
                              Rx Needed
                            </span>
                          </div>
                          <p className="text-sm font-extrabold text-[#1E293B] font-mono tracking-wide mb-1">
                            {pCode}
                          </p>
                          <p className="text-xs text-gray-500 font-medium">
                            {fmtDateShort(appt.date)} · {appt.timeLabel}
                          </p>
                        </div>
                      );
                    })
                  )
                ) : section === "patients" ? (
                  filteredPatients.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-xs font-medium">
                      {patientSearch.trim() ? "No matching patients found" : "No patients registered"}
                    </div>
                  ) : (
                    filteredPatients.map(patient => {
                      const isSelected = selectedPatientId === patient.id;
                      const pCode = patient.patientCode || (patient.id ? `P${String(patient.id).padStart(3, "0")}` : `P001`);
                      return (
                        <div
                          key={patient.id}
                          onClick={() => setSelectedPatientId(patient.id)}
                          className={cn(
                            "rounded-xl p-3.5 transition-all cursor-pointer select-none relative bg-[#FFFBF5] border-l-4 border-l-[#E06D44] flex items-center justify-between border border-transparent shadow-2xs",
                            isSelected && "ring-2 ring-[#D95B2F]/40 shadow-sm"
                          )}
                        >
                          <div className="space-y-1.0">
                            {/* Row 1 - Name */}
                            <h3 className="font-bold text-[#1C3A27] text-base">
                              {patient.name}
                            </h3>

                            {/* Row 2 - Patient ID */}
                            <div className="text-sm font-black text-black font-mono tracking-wide rounded-lg inline-block">
                              {pCode}
                            </div>

                            {/* Row 3 - Visits & Documents */}
                            <p className="text-xs text-gray-500 font-medium">
                              {patient.appointments.length} visits&nbsp;&nbsp; • &nbsp;&nbsp;📄 {patient.documents.length} docs
                            </p>
                          </div>
                          <ChevronRight size={18} className="text-[#D95B2F] shrink-0" />
                        </div>
                      );
                    })
                  )
                ) : null}
              </div>
            </div>

            <DragHandle handlers={listPanel.handlers} />
          </>
        )}

        {/* ── 3. MAIN WORKSPACE / RIGHT DETAIL AREA ──────────────────── */}
        <div className="flex-1 bg-white overflow-y-auto flex flex-col min-w-0">
          {section === "donations" ? (
            <div className="p-6 sm:p-8 w-full space-y-6">
              {/* Header */}
              <div className="flex items-center gap-3.5 mb-2">
                <div className="w-11 h-11 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0">
                  <Heart size={22} className="text-rose-600" fill="currentColor" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Donations</h1>
                  <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Track patient donations, verify payments, and send thank-you emails.</p>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-3 items-center justify-between bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs">
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allTime}
                      onChange={e => setAllTime(e.target.checked)}
                      className="rounded border-gray-300 text-[#D95B2F] focus:ring-[#D95B2F]"
                    />
                    All time
                  </label>

                  {!allTime && (
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <select
                          value={filterMonth}
                          onChange={e => setFilterMonth(Number(e.target.value))}
                          className="appearance-none bg-gray-50 border border-gray-200 rounded-xl pl-3 pr-8 py-2 text-xs font-semibold text-gray-700 focus:outline-none focus:border-[#D95B2F]"
                        >
                          {MONTHS.map((m, i) => (
                            <option key={i} value={i + 1}>{m}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>

                      <div className="relative">
                        <select
                          value={filterYear}
                          onChange={e => setFilterYear(Number(e.target.value))}
                          className="appearance-none bg-gray-50 border border-gray-200 rounded-xl pl-3 pr-8 py-2 text-xs font-semibold text-gray-700 focus:outline-none focus:border-[#D95B2F]"
                        >
                          {years.map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={loadDonations}
                    disabled={donationsLoading}
                    className="p-2 bg-gray-50 border border-gray-200 text-gray-500 hover:text-[#D95B2F] hover:bg-gray-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                    title="Refresh"
                  >
                    <RefreshCw size={15} className={donationsLoading ? "animate-spin text-[#D95B2F]" : ""} />
                  </button>

                  <div className="relative w-48 sm:w-72">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search by name, Patient ID, amount…"
                      value={donationSearch}
                      onChange={e => setDonationSearch(e.target.value)}
                      className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#D95B2F]"
                    />
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-500 text-xs tracking-wider">Total Donations</h3>
                    <div className="p-2 bg-emerald-500/10 text-emerald-700 rounded-xl">
                      <IndianRupee size={18} />
                    </div>
                  </div>
                  <p className="text-3xl font-bold font-sans text-gray-900">₹{totalDonationAmount.toLocaleString("en-IN")}</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-500 text-xs tracking-wider">Number of Donors</h3>
                    <div className="p-2 bg-blue-500/10 text-blue-600 rounded-xl">
                      <Users size={18} />
                    </div>
                  </div>
                  <p className="text-3xl font-bold font-sans text-blue-600">{donorCount}</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-500 text-xs tracking-wider">Amount Received</h3>
                    <div className="p-2 bg-green-500/10 text-green-600 rounded-xl">
                      <CheckCircle2 size={18} />
                    </div>
                  </div>
                  <p className="text-3xl font-bold font-sans text-green-600">{verifiedDonationCount}</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-500 text-xs tracking-wider">Amount Not Received</h3>
                    <div className="p-2 bg-yellow-500/10 text-yellow-600 rounded-xl">
                      <Clock size={18} />
                    </div>
                  </div>
                  <p className="text-3xl font-bold font-sans text-yellow-600">{pendingDonationCount}</p>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
                {donationsLoading ? (
                  <div className="py-16 text-center text-gray-400 text-xs font-medium">Loading donations…</div>
                ) : filteredDonations.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                      <Heart size={28} className="text-gray-300" />
                    </div>
                    <p className="text-gray-600 font-bold text-sm">No donations found</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {allTime ? "No donations recorded yet." : `No donations in ${MONTHS[filterMonth - 1]} ${filterYear}.`}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/80 text-gray-500 font-bold tracking-wider">
                          <th className="px-5 py-3.5">Patient</th>
                          <th className="px-5 py-3.5">Amount</th>
                          <th className="px-5 py-3.5">Txn Last 6</th>
                          <th className="px-5 py-3.5">Date</th>
                          <th className="px-5 py-3.5">Status</th>
                          <th className="px-5 py-3.5">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredDonations.map(d => (
                          <tr
                            key={d.id}
                            className={cn(
                              "hover:bg-gray-50/80 transition-colors",
                              selectedDonationId === d.id && "bg-orange-50/20"
                            )}
                          >
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                {d.patientCode && (
                                  <span className="text-xs font-black text-[#D95B2F] font-mono tracking-widest bg-[#D95B2F1A] border border-[#D95B2F]/20 rounded-lg px-2 py-1 shrink-0">
                                    {d.patientCode}
                                  </span>
                                )}
                                <div>
                                  <p className="font-bold text-gray-800 text-xs sm:text-sm">{d.patientName || "—"}</p>
                                  <p className="text-[11px] text-gray-400">{d.patientEmail || "—"}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-sm font-black text-emerald-700 font-sans">₹{d.amount}</span>
                            </td>
                            <td className="px-5 py-4">
                              <span className="font-mono font-semibold text-gray-700 tracking-widest">xxxxxx{d.lastSixDigits}</span>
                            </td>
                            <td className="px-5 py-4 text-gray-500 whitespace-nowrap">{fmtDateFull(d.createdAt)}</td>
                            <td className="px-5 py-4">
                              <button
                                onClick={() => toggleVerifyDonation(d)}
                                className="flex items-center gap-2 cursor-pointer group select-none"
                              >
                                <div className={cn(
                                  "relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0",
                                  d.status === "verified" ? "bg-emerald-600" : "bg-gray-200 group-hover:bg-gray-300"
                                )}>
                                  <div className={cn(
                                    "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-xs transition-transform duration-200",
                                    d.status === "verified" ? "translate-x-4.5" : "translate-x-0.5"
                                  )} />
                                </div>
                                <span className={cn("text-xs font-semibold", d.status === "verified" ? "text-green-700" : "text-gray-400")}>
                                  {d.status === "verified" ? "Received" : "Not Received"}
                                </span>
                              </button>
                            </td>
                            <td className="px-5 py-4">
                              <button
                                onClick={() => !d.thankYouSent && sendDonationThankYou(d)}
                                disabled={d.thankYouSent}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                                  d.thankYouSent
                                    ? "bg-gray-50 border-gray-200 text-gray-400 cursor-default"
                                    : "bg-[#D95B2F]/10 border-[#D95B2F]/20 text-[#D95B2F] hover:bg-[#D95B2F]/20"
                                )}
                              >
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
            </div>
          ) : section === "patients" && selectedPatient ? (
            /* Selected Patient Details Workspace Panel (STRICTLY AUTHENTIC ORIGINAL DATA ONLY) */
            <div className="p-6 w-full space-y-6">
              {/* Header Bar */}
              <div className="flex items-center justify-between border-b border-gray-100 pb-5">
                <div className="flex items-center gap-3">
                  <div className="text-sm font-black text-[#D95B2F] font-mono tracking-widest bg-[#D95B2F1A] border border-[#1a3d2b]/15 rounded-lg px-2.5 py-1 inline-block shrink-0">
                    {selectedPatient.patientCode || `A00${selectedPatient.id}`}
                  </div>
                  <h1 className="text-xl font-extrabold text-gray-900">{selectedPatient.name}</h1>
                </div>

                <button
                  onClick={() => setShowAddRxModal(true)}
                  className="bg-[#D95B2F] hover:bg-[#C84F27] text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2 active:scale-95"
                >
                  <Plus size={15} />
                  <span>Add Prescription</span>
                </button>
              </div>

              {/* 1. MEDICAL DOCUMENTS */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-[#64748b]" />
                    <h2 className="text-sm font-bold text-[#64748b]">
                      Medical Documents ({selectedPatient.documents.length})
                    </h2>
                  </div>
                </div>

                {selectedPatient.documents.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400 bg-slate-50 rounded-2xl border border-gray-100 flex flex-col items-center justify-center gap-1.5">
                    <FileText size={20} className="text-gray-300" />
                    <span>No medical documents uploaded yet</span>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {selectedPatient.documents.map((doc: any, idx) => {
                      const img = isImage(doc);
                      const sizeStr = doc.size ? (doc.size > 1000000 ? `${(doc.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(doc.size / 1024)} KB`) : "Document";
                      const category = doc.type || (doc.name.toLowerCase().includes("receipt") ? "Payment Receipt" : doc.name.toLowerCase().includes("payslip") ? "Income Verification" : img ? "Clinical Image / Investigation Photo" : "Medical Document");
                      const dateStr = (doc.date && doc.date !== "Invalid Date") ? doc.date : (doc.createdAt && !isNaN(new Date(doc.createdAt).getTime())) ? fmtDateShort(doc.createdAt) : fmtDateShort(selectedPatient.createdAt);

                      return (
                        <div
                          key={idx}
                          className="bg-white border border-gray-200/90 rounded-2xl p-4 flex items-center justify-between hover:border-gray-300 transition-all shadow-2xs"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                              img ? "bg-blue-50 text-blue-500" : "bg-red-50 text-red-500"
                            )}>
                              {img ? <ImageIcon size={20} /> : <FileText size={20} />}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-gray-900 truncate">{doc.name}</h4>
                              <p className="text-xs text-gray-400 font-medium mt-0.5">
                                Uploaded {dateStr} • {sizeStr} • {category}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            <button
                              onClick={() => setPreviewDoc(doc)}
                              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer"
                              title="View Document"
                            >
                              <Eye size={18} />
                            </button>
                            <a
                              href={doc.objectPath?.startsWith("http") ? doc.objectPath : `${BASE}/api/storage${doc.objectPath?.startsWith("/") ? "" : "/"}${doc.objectPath || ""}`}
                              download={doc.name}
                              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer"
                              title="Download Document"
                            >
                              <Download size={18} />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* 2. PRESCRIPTION HISTORY */}
              {(() => {
                const rxAppointments = selectedPatient.appointments
                  .filter(a => a.prescription?.photoObjectPath || cleanDoctorNotes(a.prescription?.notes));

                return (
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FlaskConical size={16} className="text-[#64748b]" />
                        <h2 className="text-sm font-bold text-[#64748b]">
                          Prescription History ({rxAppointments.length})
                        </h2>
                      </div>
                      <span className="text-xs text-gray-400 font-normal">
                        Total {rxAppointments.length} Prescriptions Recorded
                      </span>
                    </div>

                    {rxAppointments.length === 0 ? (
                      <div className="p-6 text-center text-xs text-gray-400 bg-slate-50 rounded-2xl border border-gray-100 flex flex-col items-center justify-center gap-1.5">
                        <StickyNote size={20} className="text-gray-300" />
                        <span>No prescriptions recorded yet. Click <b>+ Add Prescription</b> to issue a prescription.</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {rxAppointments.map((a, idx) => {
                          const rawNotes = a.prescription?.notes;
                          const cleanedNotes = cleanDoctorNotes(rawNotes);
                          const parsedMeds = parseMedicinesFromNotes(rawNotes);
                          const photoPath = a.prescription?.photoObjectPath;
                          const apptDocs = a.documents || [];
                          const isActive = a.status !== "completed";
                          const dateStr = fmtDateShort(a.date);

                          return (
                            <div
                              key={a.id || idx}
                              className="bg-white border border-gray-200/90 rounded-2xl p-4.5 space-y-3 hover:border-gray-300 transition-all shadow-2xs"
                            >
                              {/* Header Row */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", isActive ? "bg-emerald-500" : "bg-gray-400")} />
                                  <h4 className="text-sm font-bold text-gray-900 truncate">
                                    Prescription — {fmtDate(a.date)}
                                  </h4>
                                  <span className={cn(
                                    "text-[10px] font-semibold px-2.5 py-0.5 rounded-full border shrink-0",
                                    isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-600 border-gray-200"
                                  )}>
                                    {isActive ? "Active" : "Completed"}
                                  </span>
                                </div>
                                <span className="text-xs text-gray-400 font-medium shrink-0">{a.timeLabel || dateStr}</span>
                              </div>

                              {/* Attached Documents Section (Uploaded & Generated) */}
                              <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center gap-2">
                                {/* Generated Digital Prescription (only if notes or parsed medicines exist) */}
                                {(cleanedNotes || parsedMeds.length > 0) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActivePrintData({
                                        patientName: selectedPatient.name,
                                        patientCode: selectedPatient.patientCode || `#A00${selectedPatient.id}`,
                                        ageGender: `${(selectedPatient as any).age || 34} Y / ${(selectedPatient as any).gender || "Female"}`,
                                        consultDate: `${fmtDate(a.date)} • ${a.timeLabel || "11:30 AM"}`,
                                        medicines: parsedMeds,
                                        doctorNotes: cleanedNotes,
                                      });
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF4EF] hover:bg-[#FDE8E0] border border-[#FDE8E0] rounded-xl text-xs font-bold text-[#D95B2F] transition-colors cursor-pointer"
                                  >
                                    <Printer size={13} />
                                    <span>Generated Digital Prescription</span>
                                  </button>
                                )}

                                {/* Uploaded Prescription Document (if any) */}
                                {photoPath && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPreviewDoc({
                                        name: `Uploaded Prescription - ${selectedPatient.name}`,
                                        objectPath: photoPath,
                                        contentType: photoPath.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
                                        size: 0,
                                      });
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-bold text-blue-700 transition-colors cursor-pointer"
                                  >
                                    <Eye size={13} />
                                    <span>Uploaded Prescription Document</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })()}

              {/* 3. CONSULTATION HISTORY */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar size={16} className="text-[#64748b]" />
                  <h2 className="text-sm font-bold text-[#64748b]">
                    Consultation History ({selectedPatient.appointments.length})
                  </h2>
                </div>

                {selectedPatient.appointments.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400 bg-slate-50 rounded-2xl border border-gray-100">
                    No consultation history recorded yet
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {selectedPatient.appointments.map((a, idx) => (
                      <div
                        key={idx}
                        className="bg-white border border-gray-200/90 rounded-2xl p-4 flex items-center justify-between hover:border-gray-300 transition-all shadow-2xs"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                            <Video size={20} />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-gray-900 truncate">
                              {fmtDateShort(a.date)} • {a.timeLabel}
                            </h4>
                            <p className="text-xs text-gray-400 font-medium mt-0.5">
                              {a.type === "offline" ? "Offline Hospital Visit" : `Online Video ${a.status === "completed" ? "consultation completed" : "Awaiting review"}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-3">
                          <span className={cn(
                            "text-[10px] font-bold px-3 py-1 rounded-full border tracking-wider uppercase",
                            a.status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
                          )}>
                            {a.status === "completed" ? "COMPLETED" : a.status === "pending" ? "PENDING" : "CONFIRMED"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 4. DOCTOR NOTE'S HISTORY */}
              {(() => {
                const notesWithData = selectedPatient.appointments
                  .map(a => {
                    const cleaned = cleanDoctorNotes(a.prescription?.notes);
                    if (!cleaned) return null;
                    return {
                      title: "Clinical Note",
                      dateLabel: `${fmtDateShort(a.date)} • ${a.timeLabel}`,
                      text: cleaned,
                    };
                  })
                  .filter(Boolean) as { title: string; dateLabel: string; text: string }[];

                return (
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <FileEdit size={16} className="text-[#64748b]" />
                      <h2 className="text-sm font-bold text-[#64748b]">
                        Doctor Note's History ({notesWithData.length})
                      </h2>
                    </div>

                    {notesWithData.length === 0 ? (
                      <div className="p-6 text-center text-xs text-gray-400 bg-slate-50 rounded-2xl border border-gray-100 flex flex-col items-center justify-center gap-1.5">
                        <FileEdit size={20} className="text-gray-300" />
                        <span>No doctor notes recorded yet. Clinical notes written when giving prescription will appear here.</span>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {notesWithData.map((note, idx) => (
                          <div
                            key={idx}
                            className="bg-white border border-gray-200/90 rounded-2xl p-4 space-y-2 hover:border-gray-300 transition-all shadow-2xs"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="w-2 h-2 rounded-full bg-[#D95B2F] shrink-0" />
                              <h4 className="text-sm font-bold text-gray-900">{note.title}</h4>
                              <span className="text-xs text-gray-400 font-medium">• {note.dateLabel}</span>
                            </div>
                            <p className="text-xs text-gray-600 leading-relaxed font-normal pl-4">
                              {note.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })()}

            </div>
          ) : selectedAppt ? (
            /* Selected Appointment Details Panel */
            <div className="p-6 w-full space-y-6">

              {/* Workspace Header */}
              <div className="flex items-center justify-between border-b border-gray-100 pb-5">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="text-sm font-black text-[#D95B2F] font-mono tracking-widest bg-[#D95B2F1A] border border-[#1a3d2b]/15 rounded-lg px-2.5 py-1 inline-block shrink-0">
                    {selectedAppt.patient.patientCode || (selectedAppt.patient.id ? `P${String(selectedAppt.patient.id).padStart(3, "0")}` : `P${String(selectedAppt.id).padStart(3, "0")}`)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h1 className="text-xl font-bold text-[#1e293b] truncate">{selectedAppt.patient.name}</h1>
                      {/* <span className={cn(
                        "text-[10px] font-semibold px-2.5 py-0.5 rounded-md border",
                        selectedAppt.type === "online" ? "bg-[#dbeafe] text-[#1e40af] border-blue-200" : "bg-[#d1fae5] text-[#047857] border-emerald-200"
                      )}>
                        {selectedAppt.type === "online" ? "Online" : "Offline"}
                      </span> */}
                      {/* <span className={cn("text-[10px] font-semibold px-2.5 py-0.5 rounded-md border", STATUS_PILL[selectedAppt.status] ?? STATUS_PILL.pending)}>
                        {STATUS_LABEL[selectedAppt.status] ?? selectedAppt.status}
                      </span> */}
                    </div>
                  </div>
                </div>

                {selectedAppt.type === "online" ? (
                  <button
                    onClick={() => setShowAddRxModal(true)}
                    className="bg-[#D95B2F] hover:bg-[#C84F27] text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2 active:scale-95"
                  >
                    <Plus size={15} />
                    <span>Add Prescription</span>
                  </button>
                ) : (
                  selectedAppt.status !== "completed" ? (
                    <button
                      onClick={() => markOfflineCompleted(selectedAppt.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
                    >
                      <CheckCircle2 size={15} />
                      <span>Mark Visit Completed</span>
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 size={16} /> Visit Completed
                    </span>
                  )
                )}
              </div>

              {/* SECTION 1: SLOT & BOOKING DETAILS */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={16} className="text-[#64748b]" />
                  <h2 className="text-xs font-bold text-[#64748b]">Slot & Booking Details</h2>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[#f8fafc] border border-gray-100 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-gray-400">Appointment Slot</p>
                    <p className="text-sm font-bold text-[#1e293b] mt-1">
                      {fmtDate(selectedAppt.date)}, {selectedAppt.timeLabel}
                    </p>
                  </div>

                  <div className="bg-[#f8fafc] border border-gray-100 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-gray-400">Booking Type</p>
                    <p className="text-sm font-bold text-[#D95B2F] mt-1">
                      {selectedAppt.type === "online" ? "Online video consultation" : "Offline Hospital Visit"}
                    </p>
                  </div>

                  <div className="bg-[#f8fafc] border border-gray-100 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-gray-400">Patient Contact</p>
                    <p className="text-sm font-medium text-[#1e293b] mt-1">
                      Phone: {selectedAppt.patient.phone || "No phone provided"}
                    </p>
                    <p className="text-sm text-[#1e293b] font-medium mt-0.5">
                      Email: {selectedAppt.patient.email || "No email provided"}
                    </p>
                  </div>

                  <div className="bg-[#f8fafc] border border-gray-100 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-gray-400">Booking Status</p>
                    <p className="text-sm font-bold text-[#d97706] mt-1 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#d97706]" />
                      {selectedAppt.status === "pending"
                        ? "Patient waiting for consultation"
                        : selectedAppt.status === "arrived"
                        ? "Patient arrived at clinic"
                        : selectedAppt.status === "completed"
                        ? "Consultation completed"
                        : "Appointment confirmed"}
                    </p>
                  </div>
                </div>
              </section>

              {/* Patient's Chief Complaint / Reason if provided */}
              {selectedAppt.reason && (
                <section className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4">
                  <p className="text-[10px] font-bold text-amber-700 mb-1">Reason for Visit</p>
                  <p className="text-xs text-amber-900 font-medium leading-relaxed">{selectedAppt.reason}</p>
                </section>
              )}

              {/* Active Video Call Interface if enabled */}
              {selectedAppt.type === "online" && selectedAppt.joinEnabled && (
                <section className="bg-emerald-500/10 border-2 border-emerald-500/30 rounded-2xl p-5 text-emerald-900 shadow-xs">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md animate-pulse">
                        <Video size={24} />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-base text-gray-900 flex items-center gap-2">
                          Live Consultation Ready
                          <span className="text-[10px] bg-emerald-600 text-white font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">Active</span>
                        </h3>
                        <p className="text-xs text-gray-600 mt-0.5">
                          Admin enabled video consultation session for {selectedAppt.patient.name}. Click below to launch call in full screen.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setDoctorVideoCallApptId(selectedAppt.id);
                        fetch(`${BASE}/api/online-appointments/doctor/${selectedAppt.id}/joined`, {
                          method: "POST",
                          credentials: "include",
                        }).catch(() => {});
                      }}
                      className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer shrink-0"
                    >
                      <Video size={16} /> Join Consultation (Full Screen)
                    </button>
                  </div>
                </section>
              )}

              {/* SECTION 2: PATIENT DOCUMENTS */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-[#64748b]" />
                    <h2 className="text-xs font-bold text-[#64748b]">
                      Patient Documents ({patientDocsList.length})
                    </h2>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm space-y-2.5">
                  {patientDocsList.length === 0 ? (
                    <div className="text-center py-6 text-xs text-gray-400 flex flex-col items-center gap-1.5">
                      <FileText size={20} className="text-gray-300" />
                      <span>No patient documents uploaded for this appointment</span>
                    </div>
                  ) : (
                    patientDocsList.map((doc, idx) => (
                      <div
                        key={idx}
                        onClick={() => setPreviewDoc(doc)}
                        className="bg-[#f8fafc] border border-gray-200/80 rounded-xl px-4 py-3.5 flex items-center justify-between hover:bg-slate-100/70 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                            <FileText size={16} />
                          </div>
                          <span className="text-sm font-semibold text-[#1e293b] truncate group-hover:text-[#D95B2F] transition-colors">
                            {doc.name}
                          </span>
                        </div>
                        <ZoomIn size={16} className="text-gray-400 group-hover:text-gray-600 shrink-0 ml-2" />
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* SECTION 3: DOCTOR'S NOTES & OBSERVATIONS */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Stethoscope size={16} className="text-[#64748b]" />
                  <h2 className="text-xs font-bold text-[#64748b]">
                    Doctor's Notes & Observations
                  </h2>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
                  <NotesEditor
                    apptId={selectedAppt.id}
                    isOnline={selectedAppt.type === "online"}
                    patientName={selectedAppt.patient.name}
                    initialNotes={selectedAppt.prescription?.notes ?? (selectedAppt as OfflineAppt).notes ?? ""}
                    onSaved={newNotes => {
                      if (selectedAppt.type === "online") {
                        handlePrescriptionUploaded(selectedAppt.id, {
                          photoObjectPath: selectedAppt.prescription?.photoObjectPath ?? null,
                          notes: newNotes,
                          updatedAt: new Date().toISOString(),
                        });
                      }
                    }}
                  />
                </div>
              </section>

            </div>
          ) : (
            /* Strict Empty Workspace State when no appointment exists in this tab */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-400">
              <div className="w-16 h-16 rounded-3xl bg-[#F8F9FA] flex items-center justify-center mb-3 text-gray-300">
                {section === "offline" ? <MapPin size={28} /> : section === "online" ? <Video size={28} /> : <Calendar size={28} />}
              </div>
              <p className="text-sm font-bold text-gray-600">
                {section === "offline" ? "No upcoming offline visits" : section === "online" ? "No upcoming online consultations" : "No appointment selected"}
              </p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs leading-relaxed">
                {section === "offline"
                  ? "Offline appointments booked by patients or registered by admin will appear here."
                  : section === "online"
                  ? "Online video consultation slots booked by patients will appear here."
                  : "Select an item from the left list to view booking details, patient documents, and clinical notes."}
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Upload Document Modal */}
      {showUploadDocModal && (selectedAppt || activeApptForPatient) && (
        <UploadDocumentModal
          apptId={(selectedAppt || activeApptForPatient)!.id}
          onUploaded={doc => handleDocumentUploaded((selectedAppt || activeApptForPatient)!.id, doc)}
          onClose={() => setShowUploadDocModal(false)}
        />
      )}

      {/* Add Prescription Modal */}
      {showAddRxModal && (activeApptForPatient || selectedAppt || selectedPatient) && (
        <PrescriptionModal
          patientName={selectedPatient?.name || (activeApptForPatient || selectedAppt)?.patient?.name || "Patient"}
          patientCode={selectedPatient?.patientCode || (activeApptForPatient || selectedAppt)?.patient?.patientCode || `A00${selectedPatient?.id || (activeApptForPatient || selectedAppt)?.id || 1}`}
          appt={(activeApptForPatient || selectedAppt || {
            id: selectedPatient?.id || 1,
            patient: { name: selectedPatient?.name || "Patient", patientCode: selectedPatient?.patientCode || `A00${selectedPatient?.id}` },
            prescription: null
          }) as OnlineAppt}
          onSaved={rx => handlePrescriptionUploaded((activeApptForPatient || selectedAppt)?.id || selectedPatient?.id || 1, rx)}
          onClose={() => setShowAddRxModal(false)}
          onDocClick={d => setPreviewDoc(d)}
        />
      )}

      {/* Document Preview Lightbox Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {/* Generated Digital Prescription Print Modal */}
      {activePrintData && (
        <PrintPrescriptionModal
          data={activePrintData}
          onClose={() => setActivePrintData(null)}
        />
      )}
    </div>
  );
}
