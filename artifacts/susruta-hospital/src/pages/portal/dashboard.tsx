import React, { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Clock, LogOut, Video, FileText, User,
  RefreshCw, CheckCircle2, MapPin,
  Download, Heart, QrCode, X,
  AlertCircle, Phone, ChevronDown, ChevronUp,
  Bell, ImageIcon, Loader2, Trash2, Upload, Camera, FolderOpen,
  Mic, VideoIcon, ShieldCheck, LayoutDashboard, Footprints, Eye, Search, Menu,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import logoImg from "@assets/logo_1773840200056.png";
import { cn } from "@/lib/utils";
import { todayIST, dualSlotTime, dualOfflineTime } from "@/lib/ist";
import { dateSearchTerms, matchesPortalSearch } from "@/lib/portal-search";
import { usePortalSectionBadges } from "@/hooks/use-portal-section-badges";
import { playAppointmentChime } from "@/lib/sound";
import { BookingWizard } from "./BookingWizard";
import { VideoCall, GuestLinkCard, CallDocumentUpload } from "@/components/VideoCall";
import { useActiveCall } from "@/context/ActiveCallContext";
import PatientProfile from "@/components/portal/PatientProfile";
import { MedicalDocumentUploader } from "@/components/MedicalDocumentUploader";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { PrintPrescriptionModal, extractDigitalPrescriptionData, parseMedicinesFromNotes } from "@/pages/doctor/appointments";
import { downloadFileDirectly, downloadPrescriptionPdf, type PrintPrescriptionData } from "@/lib/prescription-download";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { useScrollLock } from "@/hooks/use-scroll-lock";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const PORTAL_PAGE_SIZE = 10;
const PORTAL_MOBILE_PAGE_SIZE = 5;
const RECENT_PRESCRIPTIONS_PAGE_SIZE = 5;

// ── Types ───────────────────────────────────────────────────────
type DocFile = { name: string; objectPath: string; contentType: string; size: number };
type PatientDoc = { id: number; name: string; objectPath: string; contentType: string; size: number; createdAt: string | null };
type OnlineAppt = {
  id: number; status: string; reason?: string; createdAt: string;
  joinEnabled: boolean; joinEnabledAt: string | null;
  liveKitRoomName: string | null; guestToken: string | null;
  documents: DocFile[];
  slot: { id: number; date: string; startTime: string; endTime: string };
  prescription: { photoObjectPath: string | null; notes: string | null; updatedAt: string } | null;
};
type PhysicalAppt = {
  id: number; date: string; timeSlot: string; status: string;
  reason?: string; followUpStatus?: string; patientName: string; patientPhone?: string;
  prescription?: { photoObjectPath: string | null; notes: string | null; updatedAt: string } | null;
  documents?: DocFile[];
};
type Patient = { id: number; patientCode: string | null; name: string; age?: number | null; gender?: string | null; address?: string | null; email: string; phone?: string; emailVerified: boolean };
type DirectCall = {
  id: number;
  status: string;
  roomName: string;
  startedAt: string;
  patientJoinedAt: string | null;
  patient: { id: number; name: string; patientCode: string | null };
};

// ── Helpers ─────────────────────────────────────────────────────
const IST = "Asia/Kolkata";
const PRESCRIPTION_PRESCRIBER = "Prescribed by Dr. P. Murali Krishna";
function paginatePortalItems<T>(items: T[], requestedPage: number, pageSize: number = PORTAL_PAGE_SIZE) {
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(items.length / pageSize)));
  return { page, items: items.slice((page - 1) * pageSize, page * pageSize) };
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00+05:30").toLocaleDateString("en-IN", { timeZone: IST, weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function fmtDateShort(d: string) {
  return new Date(d + "T00:00:00+05:30").toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short", year: "numeric" });
}
function cleanDoctorNotes(rawNotes: string | null | undefined): string {
  if (!rawNotes || typeof rawNotes !== "string") return "";
  let text = rawNotes.trim();
  if (!text) return "";
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed.notes === "string" && parsed.notes.trim()) {
        return parsed.notes.trim();
      }
      return "";
    } catch {
      return "";
    }
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

function hasAppointmentPrescription(rx: { photoObjectPath?: string | null; notes?: string | null } | null | undefined): boolean {
  if (!rx) return false;
  if (rx.photoObjectPath) return true;
  if (!rx.notes) return false;
  const t = rx.notes.trim();
  if (!t) return false;
  if (t.startsWith("{")) {
    try {
      const parsed = JSON.parse(t);
      if (parsed.token && !parsed.digitalPrescription) return false;
      return !!(parsed.digitalPrescription || (Array.isArray(parsed.formulationRows) && parsed.formulationRows.length > 0) || parsed.diagnosis || (typeof parsed.notes === "string" && parsed.notes.trim().length > 0));
    } catch {
      return false;
    }
  }
  return !!cleanDoctorNotes(t) || t.includes("AYURVEDIC MEDICINAL FORMULATIONS:");
}
function isUpcoming(date: string, status: string) {
  const today = todayIST();
  return date >= today && !["cancelled", "completed"].includes(status);
}

function playChime() {
  playAppointmentChime();
  setTimeout(() => {
    try {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance("Please join the call");
        utter.rate = 0.85;
        utter.pitch = 1.05;
        utter.volume = 1;
        window.speechSynthesis.speak(utter);
      }
    } catch {}
  }, 1500);
}

const STATUS_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  pending:     { label: "Awaiting Approval", cls: "bg-amber-100 text-amber-700 border-amber-200",   dot: "bg-amber-400" },
  confirmed:   { label: "Confirmed",         cls: "bg-blue-100 text-blue-700 border-blue-200",       dot: "bg-blue-500" },
  completed:   { label: "Completed",         cls: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  cancelled:   { label: "Cancelled",         cls: "bg-gray-100 text-gray-500 border-gray-200",       dot: "bg-gray-400" },
  rescheduled: { label: "Rescheduled",       cls: "bg-purple-100 text-purple-700 border-purple-200", dot: "bg-purple-500" },
};

type AppointmentItem =
  | { type: "online"; date: string; data: OnlineAppt }
  | { type: "physical"; date: string; data: PhysicalAppt };

function appointmentTime(item: AppointmentItem) {
  if (item.type === "physical") return item.data.timeSlot.replace(/\s*-\s*/g, " – ").replace(/\s*IST$/i, "") + " IST";
  const time = (value: string) => {
    const [hour, minute] = value.split(":");
    return (Number(hour) % 12 || 12) + ":" + minute + (Number(hour) >= 12 ? " PM" : " AM");
  };
  return time(item.data.slot.startTime) + " – " + time(item.data.slot.endTime) + " IST";
}

function AppointmentStatus({ status }: { status: string }) {
  return <span className={cn(
    "inline-flex min-w-[60px] items-center justify-center gap-1 rounded-full border px-3 py-1 text-[12px] font-medium leading-[13px] capitalize",
    status === "pending" ? "border-[#ffda75] bg-[#fffbeb] text-[#bd5900]" :
    status === "confirmed" ? "border-[#99ebc5] bg-[#ecfdf5] text-[#008568]" :
    status === "completed" ? "border-[#cccfcc] bg-[#e4e6e3] text-[#505650]" :
    STATUS_CONFIG[status]?.cls || "border-gray-200 bg-gray-100 text-gray-600"
  )}><span className="size-1 rounded-full bg-current" />{status === "pending" ? "Pending" : STATUS_CONFIG[status]?.label || status}</span>;
}

function AppointmentActions({
  item,
  onJoin,
  onViewPrescription,
}: {
  item: AppointmentItem;
  onJoin: (id: number) => void;
  onViewPrescription?: (item: AppointmentItem) => void;
}) {
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<DocFile | null>(null);
  const online = item.type === "online" ? item.data : null;
  const hasRx = hasAppointmentPrescription(item.data.prescription);

  useScrollLock(showDocsModal);

  return <div className="flex items-center justify-end gap-1.5 sm:gap-2 flex-nowrap">
    {online?.joinEnabled && <button onClick={() => onJoin(online.id)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-[12px] text-white hover:bg-emerald-700 font-medium whitespace-nowrap shrink-0"><Video size={12} /> Join Video Call</button>}
    {hasRx && onViewPrescription && (
      <button
        type="button"
        onClick={() => onViewPrescription(item)}
        aria-label={"View prescription for " + fmtDateShort(item.date)}
        className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2 sm:px-3 py-1.5 text-[11px] sm:text-[12px] font-medium leading-3 text-[#D95B2F] hover:bg-[#D95B2F]/10 cursor-pointer transition-colors shadow-2xs shrink-0"
      >
        <Eye size={12} /> View Prescription
      </button>
    )}
    <button onClick={() => setShowDocsModal(true)} aria-label={"View documents for " + fmtDateShort(item.date)} 
    className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2 sm:px-3 py-1.5 text-[11px] sm:text-[12px] font-medium leading-3 text-[#D95B2F] hover:bg-[#D95B2F]/10 cursor-pointer transition-colors shadow-2xs shrink-0">
      <Eye size={12} /> View Documents</button>

    {showDocsModal && (
      <div
        onClick={() => setShowDocsModal(false)}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overscroll-contain select-none"
        style={{ touchAction: "none" }}
        onTouchMove={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
        onWheel={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
      >
        <div
          onClick={e => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl bg-white p-5 text-sm shadow-2xl border border-border select-text overscroll-contain max-h-[85vh] flex flex-col"
          style={{ touchAction: "auto" }}
        >
          <div className="mb-4 flex items-center justify-between gap-4 shrink-0">
            <h3 className="font-bold text-[#20392b]">Documents · {fmtDateShort(item.date)}</h3>
            <button
              onClick={() => setShowDocsModal(false)}
              aria-label="Close documents"
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain space-y-2">
            {online?.documents?.length ? (
              online.documents.map((doc, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setPreviewDocument(doc)}
                  className="flex w-full text-left items-center gap-2 rounded-lg border border-[#eee8e3] p-3 text-[#d95b2f] hover:bg-orange-50 cursor-pointer transition-colors"
                >
                  <FileText size={16} className="shrink-0" />
                  <span className="break-all">{doc.name}</span>
                </button>
              ))
            ) : (
              <p className="py-4 text-gray-500 text-center">No documents attached to this appointment.</p>
            )}
          </div>
        </div>
      </div>
    )}
    {previewDocument && <MedicalDocumentPreview key={previewDocument.objectPath} doc={previewDocument} onClose={() => setPreviewDocument(null)} />}
  </div>;
}

function AppointmentMobileCard({
  item,
  onJoin,
  onViewPrescription,
}: {
  item: AppointmentItem;
  onJoin: (id: number) => void;
  onViewPrescription?: (item: AppointmentItem) => void;
}) {
  return (
    <div className="rounded-2xl border border-[#eee8e3] bg-white p-3.5 sm:p-4 space-y-2.5 shadow-2xs">
      {/* Top row: Date on left, Status on right */}
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-[16px] text-[#202420]">{fmtDateShort(item.date)}</p>
        <AppointmentStatus status={item.data.status} />
      </div>

      {/* Middle rows: Time and Type */}
      <div className="text-[13px] text-[#555E57] space-y-0.5">
        <p>{appointmentTime(item)}</p>
        <p>{item.type === "online" ? "Online Consultation" : "Offline Consultation"}</p>
      </div>

      {/* Bottom row: Right-aligned Actions */}
      <div className="flex items-center justify-end pt-2 border-t border-gray-100/80">
        <AppointmentActions item={item} onJoin={onJoin} onViewPrescription={onViewPrescription} />
      </div>
    </div>
  );
}

const MedicalPdfPreview = React.lazy(() => import("@/components/CleanPdfViewer").then(module => ({ default: module.CleanPdfViewer })));

function MedicalDocumentPreview({ doc, onClose }: { doc: Pick<PatientDoc, "name" | "objectPath" | "contentType">; onClose: () => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [preview, setPreview] = useState<{ url: string; blob: Blob; kind: "pdf" | "image" | "docx" } | null>(null);
  const [error, setError] = useState("");
  const [wordLoading, setWordLoading] = useState(true);

  // Close on Escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Lock body scroll while preview is open
  useScrollLock(true);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    async function load() {
      try {
        const response = await fetch(BASE + "/api/storage" + doc.objectPath, { credentials: "include", signal: controller.signal });
        if (!response.ok) throw new Error("Unable to load this document. Please try again.");
        const blob = await response.blob();
        const type = (doc.contentType || blob.type).toLowerCase();
        const name = doc.name.toLowerCase();
        const kind = type === "application/pdf" || name.endsWith(".pdf") ? "pdf" :
          type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name) ? "image" :
          type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || name.endsWith(".docx") ? "docx" : null;
        if (!kind) throw new Error("Preview is available for PDF, images, and DOCX documents. Please upload this document in one of these formats.");
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ url: objectUrl, blob, kind });
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to preview this document.");
      }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc]);

  async function renderWord() {
    const frameDocument = frameRef.current?.contentDocument;
    if (!frameDocument || preview?.kind !== "docx") return;
    try {
      const { renderAsync } = await import("docx-preview");
      if (!frameRef.current || frameRef.current.contentDocument !== frameDocument) return;
      await renderAsync(preview.blob, frameDocument.body, frameDocument.head, {
        ignoreWidth: true, ignoreHeight: true, useBase64URL: true, renderAltChunks: false,
      });
      frameDocument.addEventListener("click", event => event.preventDefault());
      setWordLoading(false);
    } catch {
      setError("Unable to preview this Word document. The file may be damaged.");
    }
  }

  const isImage = preview?.kind === "image";
  const isDocOrPdf = preview?.kind === "pdf" || preview?.kind === "docx";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/60 backdrop-blur-sm font-sans overscroll-contain select-none"
      style={{ touchAction: "none" }}
      onTouchMove={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
      onWheel={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.95, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 12 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
        className={`bg-white w-full rounded-none sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto overscroll-contain select-text ${
          isImage
            ? "max-w-md sm:max-w-5xl sm:h-[85vh]"
            : isDocOrPdf
            ? "max-w-5xl h-[88vh] sm:h-[85vh]"
            : "max-w-md sm:max-w-5xl"
        }`}
        style={{ touchAction: "auto" }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-6 sm:py-4 bg-white">
          <h2 className="truncate text-sm sm:text-base font-bold text-gray-900 leading-tight">{doc.name}</h2>
          <button
            autoFocus
            type="button"
            onClick={onClose}
            aria-label="Close document preview"
            className="rounded-full sm:rounded-xl p-1.5 sm:p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
          >
            <X size={18} className="sm:hidden" />
            <X size={20} className="hidden sm:block" />
          </button>
        </div>

        {/* Content Body */}
        {error ? (
          <div className="p-8 text-center">
            <p role="alert" className="text-red-600 text-sm font-medium">{error}</p>
          </div>
        ) : !preview ? (
          <div role="status" className="flex items-center justify-center gap-2 p-10 text-gray-500 text-sm">
            <Loader2 size={20} className="animate-spin text-[#d95b2f]" /> Loading document...
          </div>
        ) : isImage ? (
          <div className="w-full bg-white sm:bg-gray-50 flex items-center justify-center overflow-hidden sm:flex-1 sm:min-h-0 sm:p-6">
            <img
              src={preview.url}
              alt={doc.name}
              onError={() => setError("Unable to preview this image.")}
              className="w-full h-auto max-h-[70vh] sm:max-h-full sm:max-w-full sm:w-auto sm:rounded-xl sm:shadow-lg object-contain block select-none"
            />
          </div>
        ) : preview.kind === "pdf" ? (
          <div className="relative min-h-0 flex-1 overflow-auto bg-gray-50">
            <React.Suspense fallback={<div className="flex items-center justify-center gap-2 p-8 text-gray-500"><Loader2 size={20} className="animate-spin text-[#d95b2f]" /> Loading PDF...</div>}>
              <MedicalPdfPreview url={preview.url} title={doc.name} className="h-full w-full" />
            </React.Suspense>
          </div>
        ) : (
          <div className="relative min-h-0 flex-1 overflow-auto bg-white">
            {wordLoading && (
              <div role="status" className="flex items-center justify-center gap-2 p-8 text-gray-500 text-sm">
                <Loader2 size={20} className="animate-spin text-[#d95b2f]" /> Loading document...
              </div>
            )}
            <iframe
              ref={frameRef}
              title={doc.name}
              sandbox="allow-same-origin"
              srcDoc={'<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"></body></html>'}
              onLoad={() => void renderWord()}
              className="h-full w-full border-0 bg-white"
            />
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Join Popup ──────────────────────────────────────────────────
function JoinPopup({ apptId, onJoin, onClose }: {
  apptId: number;
  onJoin: (id: number) => void; onClose: () => void;
}) {
  useScrollLock(true);

  function handleJoin() {
    onJoin(apptId);
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overscroll-contain select-none"
      style={{ touchAction: "none" }}
      onTouchMove={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
      onWheel={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center overscroll-contain select-text"
        style={{ touchAction: "auto" }}
      >
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
          <div className="w-14 h-14 rounded-full bg-emerald-200 flex items-center justify-center animate-pulse">
            <Video size={28} className="text-emerald-700" />
          </div>
        </div>
        <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Doctor is Ready!</h2>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          Dr. P. Murali Krishna is waiting for you. Your consultation session has begun.
        </p>
        <button onClick={handleJoin}
          className="block w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl text-base transition-colors shadow-lg cursor-pointer">
          Join Video Call →
        </button>
      </motion.div>
    </div>
  );
}

function DirectCallPopup({ call, onJoin, onClose }: {
  call: DirectCall;
  onJoin: (id: number) => void;
  onClose: () => void;
}) {
  useScrollLock(true);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overscroll-contain select-none"
      style={{ touchAction: "none" }}
      onTouchMove={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
      onWheel={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center overscroll-contain select-text"
        style={{ touchAction: "auto" }}
      >
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
          <div className="w-14 h-14 rounded-full bg-emerald-200 flex items-center justify-center animate-pulse">
            <Video size={28} className="text-emerald-700" />
          </div>
        </div>
        <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Doctor is calling</h2>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          Dr. P. Murali Krishna would like to speak with you now.
        </p>
        <button onClick={() => onJoin(call.id)}
          className="block w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl text-base transition-colors shadow-lg cursor-pointer">
          Answer Video Call →
        </button>
        <button onClick={onClose} className="mt-3 text-sm font-semibold text-gray-400 hover:text-gray-600 cursor-pointer">
          Not now
        </button>
      </motion.div>
    </div>
  );
}

function EmailVerificationNotice({
  email, sent, sending, onResend,
}: {
  email: string; sent: boolean; sending: boolean; onResend: () => void;
}) {
  return (
    <div role="alert" aria-live="assertive" className="border border-amber-300 bg-amber-100 rounded-2xl px-4 py-3.5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-200 flex items-center justify-center shrink-0">
            <Bell size={18} className="text-amber-700" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-amber-950 font-extrabold text-sm">Action required: verify your email</p>
            <p className="text-amber-800 text-xs mt-0.5 leading-relaxed">
              Verify <span className="font-semibold break-all">{email}</span> to unlock appointment booking and all patient portal features.
            </p>
          </div>
        </div>
        {sent ? (
          <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 shrink-0">
            Verification email sent
          </span>
        ) : (
          <button onClick={onResend} disabled={sending}
            className="self-stretch sm:self-auto flex items-center justify-center gap-1.5 text-xs font-extrabold text-amber-950 bg-amber-200 hover:bg-amber-300 border border-amber-400 rounded-xl px-3.5 py-2.5 transition-colors shrink-0 disabled:opacity-60">
            {sending ? <RefreshCw size={13} className="animate-spin" /> : <Bell size={13} aria-hidden="true" />}
            {sending ? "Sending…" : "Resend verification email"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Donation Popup ──────────────────────────────────────────────
function DonationPopup({
  qrObjectPath, apptId, patientCode, onClose,
}: {
  qrObjectPath: string | null; apptId: number; patientCode?: string | null; onClose: () => void;
}) {
  const [screen, setScreen] = useState<"appeal" | "donate" | "receipt">("appeal");
  const [amount, setAmount] = useState("");
  const [lastSix, setLastSix] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Lock background scroll when popup is open
  useScrollLock(true);

  async function handleDonate() {
    setError("");
    const parsedAmount = parseFloat(amount.trim());
    if (!amount.trim()) {
      setError("Please enter the amount you donated.");
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Donation amount must be greater than ₹0.");
      return;
    }
    if (lastSix.trim().length < 4) {
      setError("Please enter at least the last 4 digits of your transaction.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE}/api/patient/donations`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amount.trim(), lastSixDigits: lastSix.trim(), appointmentId: apptId || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || data?.error || `Server returned status ${res.status}`);
      }
      setScreen("receipt");
    } catch (err: any) {
      console.error("[Donation Error]", err);
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/60 backdrop-blur-sm font-sans overscroll-contain select-none"
      style={{ touchAction: "none" }}
      onTouchMove={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
      onWheel={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ scale: 0.95, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 15 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-[390px] sm:max-w-[420px] overflow-hidden flex flex-col my-auto max-h-[90vh] overscroll-contain select-text"
        style={{ touchAction: "auto" }}
      >
        {screen === "appeal" && (
          <>
            <div className="relative bg-[#D95B2F] px-6 pt-7 pb-6 text-center shrink-0">
              <button
                onClick={onClose}
                className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer z-10"
                aria-label="Close"
              >
                <X size={16} />
              </button>
              <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3.5 shadow-xs">
                <Heart size={26} className="text-white" fill="white" />
              </div>
              <h2 className="text-xl sm:text-[22px] font-bold text-white leading-snug">
                Your Health Was Restored.<br />Help Restore Someone Else's.
              </h2>
            </div>
            <div className="p-5 sm:p-6 space-y-3.5 sm:space-y-4 overflow-y-auto">
              <div className="border-l-4 border-gray-300 pl-4 py-1">
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed italic font-medium">
                  "Thousands of patients have found relief through Dr. Murali Krishna's Ayurvedic care — many of them could not afford treatment on their own."
                </p>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                Behind every consultation is decades of knowledge, personal time, and often medicines provided at no cost to those who truly need it.
              </p>
              <button
                onClick={() => setScreen("donate")}
                className="w-full py-3.5 bg-[#D95B2F] text-white font-bold rounded-2xl text-sm sm:text-base hover:bg-[#c84e24] transition-colors shadow-sm cursor-pointer mt-2"
              >
                Yes, I want to donate
              </button>
              <button
                onClick={onClose}
                className="w-full py-1.5 text-gray-400 text-xs sm:text-sm hover:text-gray-600 transition-colors font-medium text-center cursor-pointer block"
              >
                Maybe next time
              </button>
            </div>
          </>
        )}

        {screen === "donate" && (
          <>
            <div className="bg-[#D95B2F] px-5 py-3.5 sm:px-6 sm:py-4 flex items-center justify-between shrink-0">
              <h2 className="text-base sm:text-lg font-bold text-white leading-tight">
                Scan &amp; Confirm Your Donation
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer shrink-0"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 sm:p-5 space-y-3 sm:space-y-3.5 overflow-y-auto">
              {qrObjectPath ? (
                <div className="bg-gray-50/80 rounded-2xl p-3.5 border border-gray-100 text-center">
                  <img src={`${BASE}/api/storage${qrObjectPath}`} alt="UPI QR" className="w-36 h-36 sm:w-40 sm:h-40 object-contain mx-auto" />
                  <p className="text-xs text-gray-400 mt-2">Scan with PhonePe, Google Pay, Paytm, or any UPI app</p>
                </div>
              ) : (
                <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-100 text-center">
                  <QrCode size={36} className="text-gray-400 mx-auto mb-1.5" />
                  <p className="text-xs text-gray-500 font-medium max-w-xs mx-auto">QR will be available soon — ask us for UPI ID directly</p>
                </div>
              )}

              <div className="bg-[#FFF9EE] border border-[#F6E1B7] rounded-2xl p-3 text-center">
                <p className="text-xs sm:text-[13px] font-bold text-[#8A5300] leading-snug">
                  📝 Important — In the UPI "Message / Note" field, please type:
                </p>
                <p className="font-extrabold text-[#7A4500] text-lg sm:text-xl font-mono tracking-wider mt-1">
                  {patientCode || "A001"}
                </p>
              </div>

              <div>
                <label className="text-xs sm:text-[13px] font-bold text-gray-700 block mb-1">
                  How much are you donating? (₹)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 500"
                  value={amount}
                  onChange={e => {
                    const digits = e.target.value.replace(/[^0-9]/g, "");
                    if (digits === "0") {
                      setAmount("");
                    } else {
                      setAmount(digits);
                    }
                  }}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm sm:text-base font-semibold focus:outline-none focus:border-[#D95B2F] focus:ring-1 focus:ring-[#D95B2F] transition-all"
                />
              </div>

              <div>
                <label className="text-xs sm:text-[13px] font-bold text-gray-700 block mb-1">
                  Transaction ID — Last 6 digits <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="e.g. 892341"
                  value={lastSix}
                  onChange={e => setLastSix(e.target.value.replace(/\D/g, ""))}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm sm:text-base font-mono font-semibold tracking-wider focus:outline-none focus:border-[#D95B2F] focus:ring-1 focus:ring-[#D95B2F] transition-all"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm">
                  <AlertCircle size={14} className="shrink-0 text-red-500" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handleDonate}
                disabled={submitting}
                className="w-full py-3.5 bg-[#D95B2F] text-white font-bold rounded-2xl text-sm sm:text-base hover:bg-[#c84e24] transition-colors disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm cursor-pointer mt-1"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                {submitting ? "Recording donation…" : "Done"}
              </button>
            </div>
          </>
        )}

        {screen === "receipt" && (
          <div className="p-6 sm:p-8 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Heart size={32} className="text-[#D95B2F] sm:w-9 sm:h-9" fill="currentColor" />
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-2">Thank You! 🙏</h2>
            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed mb-6 max-w-xs mx-auto">
              Your generous donation helps us provide Ayurvedic care and medicines to patients who need it most.
            </p>
            <button
              onClick={onClose}
              className="w-full py-3.5 bg-[#D95B2F] text-white font-bold rounded-2xl text-sm sm:text-base hover:bg-[#c84e24] transition-colors cursor-pointer shadow-sm"
            >
              Close
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────
export default function PatientDashboard() {
  const [, nav] = useLocation();
  const { activeCall, startCall, minimizeCall, maximizeCall, endCall, isCallActive } = useActiveCall();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [onlineAppts, setOnlineAppts] = useState<OnlineAppt[]>([]);
  const [physicalAppts, setPhysicalAppts] = useState<PhysicalAppt[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinPopup, setJoinPopup] = useState<{ apptId: number } | null>(null);
  const [directCall, setDirectCall] = useState<DirectCall | null>(null);
  const [directCallPopup, setDirectCallPopup] = useState<DirectCall | null>(null);
  const [donationPopup, setDonationPopup] = useState<{ apptId: number; qrObjectPath: string | null } | null>(null);
  const [permissionRequest, setPermissionRequest] = useState<{ apptId: number } | null>(null);
  const [showBooking, setShowBooking] = useState(false);
  const [bookingKey, setBookingKey] = useState(0);

  const openBooking = () => {
    if (!patient?.emailVerified) return;
    if (isCallActive) {
      minimizeCall();
    }
    setBookingKey(k => k + 1);
    setShowBooking(true);
  };

  const closeBooking = () => {
    setBookingKey(k => k + 1);
    setShowBooking(false);
  };
  const isMobile = useIsMobile();
  const portalPageSize = isMobile ? PORTAL_MOBILE_PAGE_SIZE : PORTAL_PAGE_SIZE;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useScrollLock(mobileNavOpen);
  const [sidebarTab, setSidebarTab] = useState<"dashboard" | "appointments" | "prescriptions" | "docs" | "profile">("dashboard");

  const selectSidebarTab = (tab: typeof sidebarTab) => {
    if (isCallActive) {
      minimizeCall();
    }
    setSidebarTab(tab);
    setMobileNavOpen(false);
  };

  const handleJoinCall = (id: number) => {
    setJoinPopup(null);
    fetch(`${BASE}/api/online-appointments/${id}/patient-joined`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
    startCall({
      apptId: id,
      role: "patient",
      title: "Consultation with Dr. P. Murali Krishna",
      onCallEnded: () => {
        setDonationPopup({ apptId: id, qrObjectPath: phonepeQrRef.current });
      },
    });
  };

  const handleJoinDirectCall = (id: number) => {
    setDirectCallPopup(null);
    fetch(`${BASE}/api/direct-calls/${id}/patient-joined`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
    startCall({
      directCallId: id,
      role: "patient",
      title: "Direct Consultation with Dr. P. Murali Krishna",
      onCallEnded: () => {
        fetch(`${BASE}/api/direct-calls/${id}/patient-leave`, {
          method: "POST",
          credentials: "include",
        }).catch(() => {});
      },
    });
  };
  const [patientDocs, setPatientDocs] = useState<PatientDoc[]>([]);
  const [documentSearch, setDocumentSearch] = useState("");
  const [prescriptionSearch, setPrescriptionSearch] = useState("");
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [pastPage, setPastPage] = useState(1);
  const [prescriptionPage, setPrescriptionPage] = useState(1);
  const [recentPrescriptionsPage, setRecentPrescriptionsPage] = useState(1);
  const [documentPage, setDocumentPage] = useState(1);
  const [previewDoc, setPreviewDoc] = useState<PatientDoc | null>(null);
  const [previewPrescription, setPreviewPrescription] = useState<Pick<PatientDoc, "name" | "objectPath" | "contentType"> | null>(null);
  const [activeDigitalPrint, setActiveDigitalPrint] = useState<PrintPrescriptionData | null>(null);

  const buildDigitalPrintData = useCallback((apptItem: { date?: string; time?: string }, rx: { notes?: string | null; updatedAt?: string }): PrintPrescriptionData | null => {
    const rawNotes = rx.notes;
    if (!rawNotes) return null;
    const digitalData = extractDigitalPrescriptionData(rawNotes);
    const parsedMeds = parseMedicinesFromNotes(rawNotes);

    const dateStr = apptItem.date ? fmtDateShort(apptItem.date) : fmtDateShort(todayIST());
    const timeStr = apptItem.time ? ` • ${apptItem.time}` : "";
    const consultDate = `${dateStr}${timeStr}`;

    return {
      patientName: patient?.name || "Patient",
      patientCode: patient?.patientCode || "",
      age: patient?.age ? String(patient.age) : "",
      gender: patient?.gender || "",
      consultDate,
      diagnosis: digitalData?.diagnosis || "",
      formulationRows: digitalData?.formulationRows || [],
      medicines: parsedMeds,
      doctorNotes: digitalData?.notes || "",
      signedAt: rx.updatedAt || undefined,
    };
  }, [patient]);

  const openAppointmentPrescription = useCallback(async (apptItem: {
    id?: number;
    type?: "online" | "offline" | "physical";
    date?: string;
    time?: string;
    prescription?: { photoObjectPath?: string | null; notes?: string | null; updatedAt?: string } | null;
  }) => {
    let rx = apptItem.prescription;

    if (!rx?.photoObjectPath && !rx?.notes && apptItem.id && apptItem.type) {
      try {
        const typeParam = apptItem.type === "online" ? "online" : "offline";
        const res = await fetch(`${BASE}/api/patient/prescriptions/appointment/${typeParam}/${apptItem.id}`, { credentials: "include" });
        if (res.ok) {
          const json = await res.json();
          if (json.prescription) {
            rx = json.prescription;
          }
        }
      } catch (e) {
        console.error("Failed to load appointment prescription", e);
      }
    }

    if (!rx) return;
    if (rx.photoObjectPath) {
      setPreviewPrescription({
        name: "Prescription Document",
        objectPath: rx.photoObjectPath,
        contentType: "",
      });
      return;
    }

    const printData = buildDigitalPrintData(apptItem, rx);
    if (printData) {
      setActiveDigitalPrint(printData);
    }
  }, [buildDigitalPrintData]);

  const handleDownloadPhotoPrescription = useCallback((photoPath: string, fileName?: string) => {
    const defaultName = fileName || photoPath.split("/").pop() || "Prescription.pdf";
    const url = photoPath.startsWith("http")
      ? photoPath
      : `${BASE}/api/storage${photoPath.startsWith("/") ? "" : "/"}${photoPath}?download=1&filename=${encodeURIComponent(defaultName)}`;
    downloadFileDirectly(url, defaultName);
  }, []);

  const handleDownloadDigitalPrescription = useCallback(async (apptItem: {
    id?: number;
    type?: "online" | "offline" | "physical";
    date?: string;
    time?: string;
    prescription?: { id?: number; photoObjectPath?: string | null; notes?: string | null; updatedAt?: string } | null;
  }) => {
    let rx = apptItem.prescription;

    if (!rx?.photoObjectPath && !rx?.notes && apptItem.id && apptItem.type) {
      try {
        const typeParam = apptItem.type === "online" ? "online" : "offline";
        const res = await fetch(`${BASE}/api/patient/prescriptions/appointment/${typeParam}/${apptItem.id}`, { credentials: "include" });
        if (res.ok) {
          const json = await res.json();
          if (json.prescription) {
            rx = json.prescription;
          }
        }
      } catch (e) {
        console.error("Failed to load appointment prescription", e);
      }
    }

    const patCode = patient?.patientCode || (patient?.id ? `A${String(patient.id).padStart(3, "0")}` : "A001");
    const safePatName = (patient?.name || "Patient").replace(/\s+/g, "_");
    const fileName = `Prescription_${safePatName}_${patCode}.pdf`;

    if (rx?.photoObjectPath) {
      handleDownloadPhotoPrescription(rx.photoObjectPath, fileName);
      return;
    }

    if (rx) {
      const printData = buildDigitalPrintData(apptItem, rx);
      if (printData) {
        await downloadPrescriptionPdf(printData, fileName);
        return;
      }
    }

    const typeParam = apptItem.type === "online" ? "online" : "offline";
    const rxId = (rx as any)?.id;
    const downloadUrl = rxId
      ? `${BASE}/api/patient/prescriptions/${rxId}/download?filename=${encodeURIComponent(fileName)}`
      : `${BASE}/api/patient/prescriptions/appointment/${typeParam}/${apptItem.id}/download?filename=${encodeURIComponent(fileName)}`;

    await downloadFileDirectly(downloadUrl, fileName);
  }, [patient, buildDigitalPrintData, handleDownloadPhotoPrescription]);

  const handleViewApptRx = useCallback((item: AppointmentItem) => {
    const time = appointmentTime(item);
    openAppointmentPrescription({
      id: item.data.id,
      type: item.type === "online" ? "online" : "offline",
      date: item.date,
      time,
      prescription: item.data.prescription,
    });
  }, [openAppointmentPrescription]);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<PatientDoc | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<number | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [docsError, setDocsError] = useState("");
  const docFileRef = useRef<HTMLInputElement>(null);
  const docCamRef = useRef<HTMLInputElement>(null);
  const [verifyResending, setVerifyResending] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  const [verifiedSuccess, setVerifiedSuccess] = useState<boolean>(() => {
    try { return window.location.search.includes("verified=true"); } catch { return false; }
  });

  async function resendVerificationEmail() {
    if (verifyResending || !patient) return;
    setVerifyResending(true);
    try {
      const res = await fetch(`${BASE}/api/patient/auth/resend-verification`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setVerifySent(true);
      } else {
        alert(data.message || "Failed to send verification email. Please try again.");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setVerifyResending(false);
    }
  }

  const phonepeQrRef = useRef<string | null>(null);
  const sessionEndedRef = useRef(false);
  const activeCallRef = useRef(activeCall);
  activeCallRef.current = activeCall;

  async function patientFetch(path: string, opts?: RequestInit) {
    const r = await fetch(`${BASE}/api/patient${path}`, { credentials: "include", ...opts });
    if (r.status === 401) {
      window.location.replace("/");
      return null;
    }
    return r.json();
  }

  // Handle browser Back/Forward Cache (BFCache) restore
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        fetch(`${BASE}/api/patient/me`, { credentials: "include" })
          .then(res => res.ok ? res.json() : null)
          .then(me => {
            if (!me || !me.id) {
              window.location.replace("/");
            }
          })
          .catch(() => {
            window.location.replace("/");
          });
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // 1. Verify patient session first before firing other queries
      const meRes = await fetch(`${BASE}/api/patient/me`, { credentials: "include" });
      if (!meRes.ok) {
        window.location.replace("/");
        return;
      }
      const me = await meRes.json().catch(() => null);
      if (!me || !me.id) {
        window.location.replace("/");
        return;
      }
      setPatient(me);

      // 2. Only fetch patient records if authenticated
      const [myOnline, myPhysical, settings, myDocs, activeDirect] = await Promise.all([
        fetch(`${BASE}/api/online-appointments/mine`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
        patientFetch("/appointments"),
        fetch(`${BASE}/api/admin/settings`).then(async r => r.ok ? await r.json() as { phonepeQrObjectPath?: string | null } : null),
        fetch(`${BASE}/api/patient/documents`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${BASE}/api/direct-calls/patient/active`, { credentials: "include" }).then(r => r.ok ? r.json() : null),
      ]);
      setOnlineAppts(myOnline ?? []);
      setPhysicalAppts(myPhysical ?? []);
      setPatientDocs(myDocs ?? []);
      setDirectCall(activeDirect ?? null);
      if (activeDirect && !(activeCallRef.current?.directCallId === activeDirect.id)) {
        setDirectCallPopup(activeDirect);
      }
      phonepeQrRef.current = settings?.phonepeQrObjectPath ?? null;

      // If patient is currently in an appointment call but appointment was completed or ended by doctor
      if (activeCallRef.current?.apptId) {
        const currentApptId = activeCallRef.current.apptId;
        const activeAppt = myOnline?.find((a: any) => a.id === currentApptId);
        if (activeAppt && (!activeAppt.joinEnabled || activeAppt.status === "completed")) {
          endCall();
          setDonationPopup({ apptId: currentApptId, qrObjectPath: settings?.phonepeQrObjectPath ?? phonepeQrRef.current });
        }
      }
    } catch (err) {
      console.error("[PatientDashboard] Error loading data:", err);
    } finally {
      setLoading(false);
    }
  }, [endCall]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!patient?.id) return;
    const es = new EventSource(`${BASE}/api/patient/sse`, { withCredentials: true });

    es.addEventListener("join_enabled", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { apptId: number; roomName: string; guestToken?: string | null };
        if (!isCallActive && activeCallRef.current?.apptId !== data.apptId) {
          playChime();
          setJoinPopup({ apptId: data.apptId });
        }
        setOnlineAppts(prev => prev.map(a =>
          a.id === data.apptId ? { ...a, joinEnabled: true, status: "confirmed" } : a
        ));
      } catch (err) {
        console.error("[Patient SSE] join_enabled error:", err);
      }
    });

    es.addEventListener("session_ended", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { apptId: number; qrObjectPath?: string | null };
        setJoinPopup(prev => prev?.apptId === data.apptId ? null : prev);
        if (activeCallRef.current?.apptId === data.apptId) {
          endCall();
          setDonationPopup({ apptId: data.apptId, qrObjectPath: data.qrObjectPath || phonepeQrRef.current });
        }
        setOnlineAppts(prev => prev.map(a =>
          a.id === data.apptId ? { ...a, joinEnabled: false, status: "completed" } : a
        ));
      } catch (err) {
        console.error("[Patient SSE] session_ended error:", err);
      }
    });

    es.addEventListener("direct_call_started", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as DirectCall;
        if (!isCallActive && activeCallRef.current?.directCallId !== data.id) {
          playChime();
          setDirectCall(data);
          setDirectCallPopup(data);
        }
      } catch (err) {
        console.error("[Patient SSE] direct_call_started error:", err);
      }
    });

    es.addEventListener("direct_call_ended", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { callId: number };
        setDirectCallPopup(prev => prev?.id === data.callId ? null : prev);
        if (activeCallRef.current?.directCallId === data.callId) {
          endCall();
        }
        setDirectCall(prev => prev?.id === data.callId ? null : prev);
      } catch (err) {
        console.error("[Patient SSE] direct_call_ended error:", err);
      }
    });

    es.addEventListener("appointment_updated", () => {
      loadData(true);
    });

    const pollInterval = setInterval(() => {
      loadData(true);
    }, 10000);

    return () => {
      es.close();
      clearInterval(pollInterval);
    };
  }, [patient?.id, loadData]);

  async function logout() {
    try {
      await fetch(`${BASE}/api/patient/logout`, { method: "POST", credentials: "include" });
    } catch (err) {
      console.error("Logout error:", err);
    }
    // Set previous history state to landing page, then navigate to /portal
    window.history.replaceState(null, "", "/");
    window.location.href = "/portal";
  }

  async function uploadPatientDoc(file: File) {
    setUploadingCount(prev => prev + 1);
    try {
      const contentType = file.type || "image/jpeg";
      let fileName = file.name || "document";
      if (!fileName.includes(".")) {
        const ext = contentType === "application/pdf" ? "pdf" : contentType.startsWith("image/png") ? "png" : "jpg";
        fileName = `${fileName}.${ext}`;
      }
      const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fileName, contentType, size: file.size }),
      });
      if (!urlRes.ok) throw new Error("Could not get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
      const saveRes = await fetch(`${BASE}/api/patient/documents`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fileName, objectPath, contentType, size: file.size }),
      });
      const doc = await saveRes.json();
      setPatientDocs(prev => [doc, ...prev]);
    } finally {
      setUploadingCount(prev => prev - 1);
    }
  }

  async function uploadPatientDocs(files: FileList | File[]) {
    for (let i = 0; i < files.length; i++) {
      await uploadPatientDoc(files[i]);
    }
  }

  async function deletePatientDoc(id: number) {
    setDeletingDocId(id);
    try {
      const res = await fetch(`${BASE}/api/patient/documents/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        const { objectPath } = await res.json();
        setPatientDocs(prev => prev.filter(d => d.id !== id && d.objectPath !== objectPath));
        setOnlineAppts(prev => prev.map(appt => ({
          ...appt,
          documents: appt.documents.filter(doc => doc.objectPath !== objectPath),
        })));
        setPreviewDoc(prev => prev?.objectPath === objectPath ? null : prev);
        setPreviewPrescription(prev => prev?.objectPath === objectPath ? null : prev);
        setConfirmDeleteDoc(null);
      }
    } finally {
      setDeletingDocId(null);
    }
  }

  const allAppointments = [
    ...onlineAppts.map(a => ({ type: "online" as const, date: a.slot.date, data: a })),
    ...physicalAppts.map(a => ({ type: "physical" as const, date: a.date, data: a })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const upcomingAppointments = allAppointments.filter(a => isUpcoming(a.date, a.data.status));
  const upcomingCount = upcomingAppointments.length;
  const pastAppts = allAppointments.filter(a => !isUpcoming(a.date, a.data.status));
  const allApptsForRx = [
    ...onlineAppts.map(a => ({
      id: a.id,
      type: "online" as const,
      slot: a.slot,
      apptDate: a.slot.date,
      timeLabel: appointmentTime({ type: "online", date: a.slot.date, data: a }),
      documents: a.documents || [],
      prescription: a.prescription,
    })),
    ...physicalAppts.map(a => ({
      id: a.id,
      type: "offline" as const,
      slot: { id: 0, date: a.date, startTime: "", endTime: "" },
      apptDate: a.date,
      timeLabel: appointmentTime({ type: "physical", date: a.date, data: a }),
      documents: a.documents || [],
      prescription: a.prescription,
    })),
  ];

  const prescriptions = allApptsForRx
    .filter(a => hasAppointmentPrescription(a.prescription))
    .sort((a, b) => (b.apptDate || "").localeCompare(a.apptDate || ""));

  const filteredPrescriptions = prescriptions.filter(appt => matchesPortalSearch(prescriptionSearch, [
    appt.prescription?.photoObjectPath ? "Prescription Document" : "Digital Prescription Issued",
    PRESCRIPTION_PRESCRIBER,
    ...dateSearchTerms(appt.slot.date),
  ]));
  const filteredPatientDocs = patientDocs.filter(doc => matchesPortalSearch(documentSearch, [
    doc.name,
    patient?.patientCode,
    doc.createdAt ? "Uploaded" : "Uploaded Date unavailable",
    ...dateSearchTerms(doc.createdAt),
  ]));
  const pagedUpcoming = paginatePortalItems(upcomingAppointments, upcomingPage, portalPageSize);
  const pagedPast = paginatePortalItems(pastAppts, pastPage, portalPageSize);
  const pagedPrescriptions = paginatePortalItems(filteredPrescriptions, prescriptionPage, portalPageSize);
  const pagedRecentPrescriptions = paginatePortalItems(prescriptions, recentPrescriptionsPage, RECENT_PRESCRIPTIONS_PAGE_SIZE);
  const pagedPatientDocs = paginatePortalItems(filteredPatientDocs, documentPage, portalPageSize);
  const unreadCounts = usePortalSectionBadges(patient?.id, sidebarTab, {
    appointments: upcomingAppointments.map(item => `${item.type}:${item.data.id}`),
    prescriptions: prescriptions.map(appt => `${appt.id}:${appt.prescription?.updatedAt ?? ""}`),
    docs: patientDocs.map(doc => String(doc.id)),
  }, !loading);

  type SidebarTab = "dashboard" | "appointments" | "prescriptions" | "docs" | "profile";

  interface NavItem {
    id: SidebarTab;
    label: string;
    icon: any;
    badge?: number;
  }

  const navItems: NavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "appointments", label: "My Appointments", icon: Calendar, badge: unreadCounts.appointments },
    { id: "prescriptions", label: "Prescriptions", icon: FileText, badge: unreadCounts.prescriptions },
    { id: "docs", label: "Medical Documents", icon: FolderOpen, badge: unreadCounts.docs },
    { id: "profile", label: "Profile", icon: User },
  ];

  return (
    <div className="min-h-screen md:h-screen flex flex-col md:flex-row w-full bg-[#f8faf9] font-sans font-['DM_Sans',sans-serif] md:overflow-hidden [&_h1]:font-sans [&_h2]:font-sans [&_h3]:font-sans [&_h4]:font-sans overflow-x-hidden">
      <AnimatePresence>
        {showBooking && (
          <BookingWizard
            key={`booking-wizard-${bookingKey}`}
            patient={patient}
            onClose={closeBooking}
            onSuccess={() => loadData()}
          />
        )}
        {!isCallActive && joinPopup && (
          <JoinPopup
            apptId={joinPopup.apptId}
            onJoin={handleJoinCall}
            onClose={() => setJoinPopup(null)}
          />
        )}
        {donationPopup && (
          <DonationPopup
            qrObjectPath={donationPopup.qrObjectPath}
            apptId={donationPopup.apptId}
            patientCode={patient?.patientCode}
            onClose={() => setDonationPopup(null)}
          />
        )}
        {!isCallActive && directCallPopup && (
          <DirectCallPopup
            call={directCallPopup}
            onJoin={handleJoinDirectCall}
            onClose={() => setDirectCallPopup(null)}
          />
        )}
        {previewPrescription && (
          <MedicalDocumentPreview
            key={previewPrescription.objectPath}
            doc={previewPrescription}
            onClose={() => setPreviewPrescription(null)}
          />
        )}
        {previewDoc && (
          <MedicalDocumentPreview
            key={previewDoc.id}
            doc={previewDoc}
            onClose={() => setPreviewDoc(null)}
          />
        )}
        {activeDigitalPrint && (
          <PrintPrescriptionModal
            data={activeDigitalPrint}
            onClose={() => setActiveDigitalPrint(null)}
          />
        )}
      </AnimatePresence>

      {/* ── MOBILE HEADER (Matches landing page style and behavior) ── */}
      <header className="md:hidden sticky top-0 z-50 bg-white border-b border-[#EDEFEB]">
        <div className="flex items-center justify-between px-4 sm:px-6 h-[70px]">
          <div>
            <img src={logoImg} alt="Susruta Hospital" className="h-8 sm:h-9 w-auto max-w-[190px] object-contain" />
            <p className="text-[10px] font-semibold uppercase tracking-widest mt-0.5 text-[#42493E]">PATIENT PORTAL</p>
          </div>
          {/* Mobile hamburger button - identical behavior & styling to landing page */}
          <button
            type="button"
            className="p-2 text-foreground ml-auto cursor-pointer"
            onClick={() => setMobileNavOpen(prev => !prev)}
            aria-label="Toggle menu"
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile dropdown overlay (floats over content with shadow, does not push content down) */}
        {mobileNavOpen && (
          <>
            <div
              className="fixed inset-0 top-[70px] bg-black/25 z-40 backdrop-blur-xs overscroll-contain select-none"
              style={{ touchAction: "none" }}
              onTouchMove={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
              onWheel={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="absolute top-full left-0 right-0 bg-white border-t border-border shadow-xl py-4 px-4 flex flex-col gap-1 z-50 max-h-[calc(100vh-80px)] overflow-y-auto overscroll-contain animate-in fade-in slide-in-from-top-2 duration-200">
              <nav aria-label="Mobile portal navigation" className="flex flex-col gap-1">
                {navItems.map(item => {
                  const Icon = item.icon;
                  const active = sidebarTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => selectSidebarTab(item.id)}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-3 rounded-xl text-base font-medium transition-colors text-left",
                        active
                          ? "bg-[#D95B2F]/10 text-[#D95B2F] font-semibold"
                          : "text-foreground/75 hover:bg-muted"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={18} className={active ? "text-[#D95B2F]" : "text-[#42493E]"} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className={cn(
                          "text-[10px] font-black px-2 py-0.5 rounded-full",
                          active ? "bg-[#D95B2F] text-white" : "bg-gray-200 text-gray-700"
                        )}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              <div className="mt-3 pt-3 border-t border-[#EDEFEB] space-y-2.5">
                <div className="bg-[#FAF7F4] rounded-xl p-3 border border-[#EDEFEB] flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                      <Heart size={14} className="text-rose-500" fill="currentColor" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-gray-900 leading-snug truncate">Support Dr. Murali Krishna</p>
                      <p className="text-[11px] text-gray-500 leading-tight truncate">Help extend free care to those in need</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setMobileNavOpen(false);
                      setDonationPopup({ apptId: 0, qrObjectPath: phonepeQrRef.current });
                    }}
                    className="py-1.5 px-3 bg-[#D95B2F] hover:bg-[#C84F27] text-white font-bold rounded-lg text-xs shrink-0 flex items-center gap-1 shadow-xs transition-colors"
                  >
                    <Heart size={12} fill="currentColor" /> Donate
                  </button>
                </div>

                <button
                  onClick={() => {
                    setMobileNavOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FDF2ED] hover:bg-[#FDE8E1] text-[#D95B2F] rounded-xl font-bold text-xs tracking-wider transition-colors shadow-xs"
                >
                  <LogOut size={16} className="text-[#D95B2F]" />
                  Logout
                </button>
              </div>
            </div>
          </>
        )}
      </header>

      {/* ── DESKTOP SIDEBAR (Unchanged full height sticky sidebar on md+) ── */}
      <aside className="hidden md:flex md:w-[270px] lg:w-[282px] bg-white border-r border-[#EDEFEB] flex-col shrink-0 md:h-screen md:sticky md:top-0">
        {/* Top Scrollable Section */}
        <div className="flex-1 overflow-y-auto pt-5 pb-2">
          {/* Logo & Subtitle */}
          <div className="px-5 pb-4 border-b border-[#EDEFEB] mb-3">
            <img src={logoImg} alt="Susruta Hospital" className="h-9 w-auto max-w-[219px] object-contain" />
            <p className="text-xs font-semibold uppercase tracking-widest mt-1 text-[#42493E]">PATIENT PORTAL</p>
          </div>

          {/* Nav Links - Full Width Edge to Edge */}
          <nav aria-label="Portal navigation" className="space-y-0.5">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = sidebarTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => selectSidebarTab(item.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-5 py-2.5 text-sm transition-all duration-150 relative text-left",
                    active
                      ? "bg-[#D95B2F]/10 text-[#D95B2F] font-semibold border-r-[4px] border-[#D95B2F] shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                      : "text-[#42493E] font-normal hover:bg-[#D95B2F]/5 hover:text-[#D95B2F]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={18} className={active ? "text-[#D95B2F]" : "text-[#42493E]"} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className={cn(
                      "text-[10px] font-black px-2 py-0.5 rounded-full",
                      active ? "bg-[#D95B2F] text-white" : "bg-gray-200 text-gray-700"
                    )}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Pinned Section */}
        <div className="p-4 border-t border-[#EDEFEB] shrink-0 bg-white space-y-3 mt-auto">
          {/* Support Dr. Murali Krishna Card */}
          <div className="bg-white rounded-2xl p-3.5 border border-[#EDEFEB] shadow-sm space-y-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <Heart size={15} className="text-rose-500" fill="currentColor" />
              </div>
              <div>
                <p className="font-bold text-xs text-gray-900 leading-snug">Support Dr. Murali Krishna</p>
                <p className="text-[11px] text-gray-500 leading-tight mt-0.5">Help extend free care to those in need</p>
              </div>
            </div>
            <button
              onClick={() => {
                setMobileNavOpen(false);
                setDonationPopup({ apptId: 0, qrObjectPath: phonepeQrRef.current });
              }}
              className="w-full py-2 bg-[#D95B2F] hover:bg-[#C84F27] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
            >
              <Heart size={13} fill="currentColor" /> Donate &amp; Support
            </button>
          </div>

          {/* Patient Info & Logout Button */}
          <div>
            <button
              onClick={() => {
                setMobileNavOpen(false);
                logout();
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-[#FDF2ED] hover:bg-[#FDE8E1] text-[#D95B2F] rounded-xl font-bold text-xs tracking-wider transition-colors shadow-sm"
            >
              <LogOut size={16} className="text-[#D95B2F]" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ────────────────────────────────────── */}
      <main className="flex-1 w-full min-w-0 md:h-screen md:overflow-y-auto overflow-x-hidden p-4 sm:p-6 md:p-8 xl:p-10">

        {/* Direct Call Alert Banner */}
        {directCall && !isCallActive && (
          <div className="mb-6 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl p-5 shadow-lg flex flex-wrap items-center justify-between gap-4 border border-emerald-500/30">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center animate-pulse shrink-0">
                <Video size={24} className="text-white" />
              </div>
              <div>
                <p className="font-extrabold text-base sm:text-lg">Doctor is Calling You Now!</p>
                <p className="text-xs sm:text-sm text-emerald-100 mt-0.5">Dr. P. Murali Krishna would like to speak with you. Click to answer.</p>
              </div>
            </div>
            <button
              onClick={() => handleJoinDirectCall(directCall.id)}
              className="bg-white hover:bg-emerald-50 text-emerald-800 px-6 py-3 rounded-xl font-extrabold text-sm shadow-md transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Video size={16} /> Answer Call Now
            </button>
          </div>
        )}

        {/* Live Video Consultation Alert Banner */}
        {!isCallActive && onlineAppts.some(a => a.joinEnabled) && (
          <div className="mb-6 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl p-5 shadow-lg flex flex-wrap items-center justify-between gap-4 border border-emerald-500/30">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center animate-pulse shrink-0">
                <Video size={24} className="text-white" />
              </div>
              <div>
                <p className="font-extrabold text-base sm:text-lg">Doctor is Ready for Your Online Consultation!</p>
                <p className="text-xs sm:text-sm text-emerald-100 mt-0.5">Dr. P. Murali Krishna has joined the live room. Click to start video call.</p>
              </div>
            </div>
            <button
              onClick={() => {
                const live = onlineAppts.find(a => a.joinEnabled);
                if (live) handleJoinCall(live.id);
              }}
              className="bg-white hover:bg-emerald-50 text-emerald-800 px-6 py-3 rounded-xl font-extrabold text-sm shadow-md transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Video size={16} /> Join Consultation Now
            </button>
          </div>
        )}

        {/* Email Verified Success Banner */}
        {verifiedSuccess && (
          <div className="mb-6 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
              <p className="text-sm font-semibold">Your email address has been successfully verified!</p>
            </div>
            <button onClick={() => setVerifiedSuccess(false)} className="text-emerald-600 hover:text-emerald-800 p-1 rounded-lg">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Email Verification Notice */}
        {patient && !patient.emailVerified && patient.email && (
          <div className="mb-6">
            <EmailVerificationNotice
              email={patient.email}
              sent={verifySent}
              sending={verifyResending}
              onResend={resendVerificationEmail}
            />
          </div>
        )}

        {sidebarTab === "dashboard" && (
          <div className="space-y-8 animate-in fade-in duration-200 w-full">
            {/* Header Row */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold font-sans text-gray-900">
                  Welcome back, {patient?.name}
                </h1>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs">
                  <span className="font-bold text-[#D95B2F] bg-red-50 border border-red-100 px-2.5 py-0.5 rounded-full">
                    Patient ID: {patient?.patientCode || "A005"}
                  </span>
                  {/* <span className="text-gray-400">
                    Last updated: Today, {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </span> */}
                </div>
              </div>
              {patient?.emailVerified && (
                <button
                  onClick={openBooking}
                  className="bg-[#D95B2F] hover:bg-[#C84F27] text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2 active:scale-95"
                >
                  Book Appointment
                </button>
              )}
            </div>

            {/* Top 3 Metric Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 w-full">
              {/* Card 1: Upcoming Appointments */}
              <div className="bg-white p-4 sm:p-6 rounded-2xl border border-[#EDEFEB] shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold font-sans text-gray-800 text-sm">Upcoming Appointments</h3>
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 shrink-0">
                      <Calendar size={18} />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2 sm:mt-3">
                    <span className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 font-sans">{upcomingCount}</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Total Visits */}
              <div className="bg-white p-4 sm:p-6 rounded-2xl border border-[#EDEFEB] shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold font-sans text-gray-800 text-sm">Total Visits</h3>
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                      <Footprints size={18} />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2 sm:mt-3">
                    <span className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-emerald-700 font-sans">{pastAppts.length}</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Prescriptions */}
              <div className="bg-white p-4 sm:p-6 rounded-2xl border border-[#EDEFEB] shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold font-sans text-gray-800 text-sm">Prescriptions</h3>
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                      <FileText size={18} />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2 sm:mt-3">
                    <span className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-amber-700 font-sans">{prescriptions.length}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 2: My upcoming Appointments */}
            <div className="bg-white rounded-2xl border border-[#EDEFEB] shadow-sm p-6">
              <div className="flex items-center justify-between gap-3 mb-5">
                <h2 className="text-base sm:text-xl font-bold font-sans text-gray-900 leading-tight">
                  My upcoming <br className="sm:hidden" />Appointments
                </h2>
                <button
                  onClick={() => setSidebarTab("appointments")}
                  className="px-3.5 sm:px-4 py-1.5 rounded-xl border border-[#EDEFEB] text-xs font-bold font-sans text-gray-600 bg-white hover:bg-gray-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  View All
                </button>
              </div>

              <div className="space-y-3">
  {allAppointments.filter(a => isUpcoming(a.date, a.data.status)).length > 0 ? (
    allAppointments
      .filter(a => isUpcoming(a.date, a.data.status))
      .map((item, i) => {
        const isOnline = item.type === "online";
        const date = item.date;
        const status = item.data.status;

        return (
          <div
            key={i}
            className="bg-gray-50/80 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border border-[#EDEFEB]"
          >
            <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <User size={18} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm sm:text-base font-sans text-gray-900 break-words">
                  Dr. P. Murali Krishna
                </p>

                <p className="text-xs font-sans text-gray-500 mt-0.5 break-words">
                  {isOnline
                    ? "Online Consultation"
                    : "Offline Consultation"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5 sm:gap-3 w-full sm:w-auto pt-2.5 sm:pt-0 border-t sm:border-t-0 border-gray-200/60">
              <span className="text-xs font-bold font-sans text-gray-700 whitespace-nowrap">
                {fmtDateShort(date)} • {appointmentTime(item)}
              </span>

              {isOnline && (item.data as OnlineAppt).joinEnabled ? (
                activeCall?.apptId === item.data.id ? (
                  <button
                    onClick={() => maximizeCall()}
                    className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-full text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Video size={13} />
                    In Call (Return)
                  </button>
                ) : (
                  <button
                    onClick={() => handleJoinCall(item.data.id)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-bold transition-all shadow-md animate-pulse flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Video size={13} />
                    Join Call
                  </button>
                )
              ) : (
                <span
                  className={cn(
                    "text-xs font-bold font-sans px-3 py-1 rounded-full border capitalize shrink-0",
                    status === "confirmed"
                      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                      : "bg-amber-100 text-amber-800 border-amber-200"
                  )}
                >
                  {status}
                </span>
              )}
            </div>
          </div>
        );
      })
  ) : (
    <div className="py-8 text-center bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
      <Calendar size={32} className="mx-auto mb-2 text-gray-400" />

      <p className="font-bold text-sm font-sans text-gray-700">
        No upcoming appointments scheduled
      </p>

      <p className="text-xs font-sans text-gray-500 mt-1 mb-3">
        Book a consultation with Dr. P. Murali Krishna
      </p>
    </div>
  )}
</div>
            </div>

            {/* Row 3: Recent Prescriptions */}
            <div className="bg-white rounded-2xl border border-[#EDEFEB] shadow-sm p-6">
              <div className="flex items-center justify-between gap-3 mb-5">
                <h2 className="text-base sm:text-xl font-bold font-sans text-gray-900 leading-tight">
                  Recent <br className="sm:hidden" />Prescriptions
                </h2>
                <button
                  onClick={() => setSidebarTab("prescriptions")}
                  className="px-3.5 sm:px-4 py-1.5 rounded-xl border border-[#EDEFEB] text-xs font-bold font-sans text-gray-600 bg-white hover:bg-gray-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  View All
                </button>
              </div>

              <div className="space-y-4 divide-y divide-gray-100">
                {prescriptions.length > 0 ? (
                  pagedRecentPrescriptions.items.map((appt, i) => {
                    const photoPath = appt.prescription?.photoObjectPath;
                    const hasDigital = !photoPath && !!appt.prescription?.notes;

                    return (
                      <div key={`${appt.type}-${appt.id}`} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 ${i > 0 ? "pt-4" : ""}`}>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm font-sans text-gray-900 break-words">
                            Prescription — {fmtDateShort(appt.apptDate)} • {appt.timeLabel}
                          </p>
                          <p className="text-xs font-sans text-gray-500 mt-0.5 break-words">
                            Prescribed by Dr. P. Murali Krishna
                          </p>
                        </div>
                        {photoPath ? (
                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto ml-auto sm:ml-0">
                            <button
                              type="button"
                              onClick={() => setPreviewPrescription({ name: "Prescription Document", objectPath: photoPath, contentType: "" })}
                              className="inline-flex items-center gap-1 rounded-md border border-[#e3eaf3] bg-white px-2.5 py-1 text-[12px] font-medium text-[#d95b2f] transition-colors hover:bg-orange-50 shadow-2xs"
                            >
                              <Eye size={12} /> View
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadPhotoPrescription(photoPath, `Prescription_${fmtDateShort(appt.apptDate).replace(/\s+/g, "_")}.pdf`)}
                              className="inline-flex items-center gap-1 rounded-md border border-[#e3eaf3] bg-white px-2.5 py-1 text-[12px] font-medium text-black transition-colors hover:bg-orange-50 shadow-2xs"
                            >
                              <Download size={12} /> Download
                            </button>
                          </div>
                        ) : hasDigital ? (
                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto ml-auto sm:ml-0">
                            <button
                              type="button"
                              onClick={() => openAppointmentPrescription({
                                id: appt.id,
                                type: appt.type,
                                date: appt.apptDate,
                                time: appt.timeLabel,
                                prescription: appt.prescription,
                              })}
                              className="inline-flex items-center gap-1 rounded-md border border-[#e3eaf3] bg-white px-2.5 py-1 text-[12px] font-medium text-[#d95b2f] transition-colors hover:bg-orange-50 shadow-2xs"
                            >
                              <Eye size={12} /> View
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadDigitalPrescription({
                                id: appt.id,
                                type: appt.type,
                                date: appt.apptDate,
                                time: appt.timeLabel,
                                prescription: appt.prescription,
                              })}
                              className="inline-flex items-center gap-1 rounded-md border border-[#e3eaf3] bg-white px-2.5 py-1 text-[12px] font-medium text-black transition-colors hover:bg-orange-50 shadow-2xs"
                            >
                              <Download size={12} /> Download
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                    <FileText size={32} className="mx-auto mb-2 text-gray-400" />
                    <p className="font-bold text-sm font-sans text-gray-700">No prescriptions found</p>
                    <p className="text-xs font-sans text-gray-500 mt-1">Prescriptions will appear here after your consultations.</p>
                  </div>
                )}
              </div>

              {prescriptions.length > RECENT_PRESCRIPTIONS_PAGE_SIZE && (
                <nav aria-label="Recent prescriptions pages" className="mt-5 pt-3 border-t border-gray-100">
                  <AdminPagination
                    currentPage={pagedRecentPrescriptions.page}
                    totalItems={prescriptions.length}
                    pageSize={RECENT_PRESCRIPTIONS_PAGE_SIZE}
                    onPageChange={setRecentPrescriptionsPage}
                    itemLabel="prescriptions"
                    className="rounded-[13px] border border-[#e3eaf3]"
                  />
                </nav>
              )}
            </div>
          </div>
        )}

        {/* ── 2. APPOINTMENTS TAB ── */}
        {sidebarTab === "appointments" && (
          <div className="space-y-8 animate-in fade-in duration-200 w-full">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="text-3xl font-bold font-sans text-gray-900">My Appointments</h1>
              {patient?.emailVerified && (
                <button
                  onClick={openBooking}
                  className="bg-[#D95B2F] hover:bg-[#C84F27] text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2 active:scale-95"
                >
                  Book Appointment
                </button>
              )}
                     </div>
            <section aria-labelledby="upcoming-appointments-heading">
              <h2 id="upcoming-appointments-heading" className="mb-[18px] flex items-center gap-3 text-[18px] sm:text-[20px] font-bold leading-5 text-[#242424]"> Upcoming Appointments</h2>
              <div className={cn("flex flex-col", upcomingAppointments.length > portalPageSize && "sm:min-h-[580px]")}>
                {/* Mobile view: direct cards with NO extra nested padding */}
                <div className="md:hidden space-y-3 flex-1">
                  {pagedUpcoming.items.map(item => (
                    <AppointmentMobileCard
                      key={item.type + item.data.id}
                      item={item}
                      onJoin={handleJoinCall}
                      onViewPrescription={handleViewApptRx}
                    />
                  ))}
                  {upcomingCount === 0 && (
                    <p className="rounded-[13px] border border-[#eee8e3] bg-white p-5 text-center text-sm text-gray-500">No upcoming appointments scheduled</p>
                  )}
                </div>

                {/* Desktop view: Unchanged row */}
                <div className="hidden md:block space-y-3 flex-1">
                  {pagedUpcoming.items.map(item => (
                    <div
                      key={item.type + item.data.id}
                      className="flex min-h-16 flex-wrap items-center gap-4 rounded-[13px] border border-[#ffb29b] bg-white py-[11px] pl-[18px] pr-[17px]"
                    >
                      <div
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-full",
                          item.type === "online"
                            ? "bg-blue-50 text-blue-500"
                            : "bg-orange-50 text-[#D95B2F]"
                        )}
                      >
                        {item.type === "online" ? (
                          <Video size={20} />
                        ) : (
                          <MapPin size={20} />
                        )}
                      </div>
                      <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 sm:ml-[19px]">
                        <p className="text-base font-bold text-black">{fmtDateShort(item.date)}</p>
                        <p className="text-sm text-black">
                          {appointmentTime(item)} · {item.type === "online" ? "Online Consultation" : "Offline Consultation"}
                        </p>
                      </div>
                      <div className="ml-auto flex items-center gap-1.5">
                        <AppointmentStatus status={item.data.status} />
                        <AppointmentActions item={item} onJoin={handleJoinCall} onViewPrescription={handleViewApptRx} />
                      </div>
                    </div>
                  ))}
                  {upcomingCount === 0 && (
                    <p className="rounded-[13px] border border-[#eee8e3] p-5 text-sm text-gray-500 bg-white">No upcoming appointments scheduled</p>
                  )}
                </div>

                {upcomingAppointments.length > portalPageSize && (
                  <nav aria-label="Upcoming appointments pages" className="mt-auto pt-3">
                    <AdminPagination currentPage={pagedUpcoming.page} totalItems={upcomingAppointments.length} pageSize={portalPageSize} onPageChange={setUpcomingPage} itemLabel="appointments" className="rounded-[13px] border border-[#eee8e3]" />
                  </nav>
                )}
              </div>
            </section>
            <section aria-labelledby="past-appointments-heading" className="mt-[23px]">
              <h2 id="past-appointments-heading" className="mb-3 flex items-center gap-1.5 text-[18px] sm:text-[20px] font-bold leading-5 text-[#263248]"> Past Appointments</h2>
              <div className={cn("flex flex-col md:rounded-[13px] md:border md:border-[#eee8e3] md:bg-white md:overflow-hidden", pastAppts.length > portalPageSize && "sm:min-h-[580px]")}>
                {/* Mobile view: direct cards with NO extra nested padding */}
                <div className="md:hidden space-y-3 flex-1">
                  {pagedPast.items.map(item => (
                    <AppointmentMobileCard
                      key={item.type + item.data.id}
                      item={item}
                      onJoin={handleJoinCall}
                      onViewPrescription={handleViewApptRx}
                    />
                  ))}
                  {pastAppts.length === 0 && (
                    <p className="rounded-[13px] border border-[#eee8e3] bg-white p-5 text-center text-sm text-gray-500">No past appointments</p>
                  )}
                </div>

                {/* Desktop table - 100% preserved */}
                <div className="hidden md:block flex-1 overflow-x-auto">
                  <table className="w-full min-w-[700px] table-fixed border-collapse text-left text-[14px] text-[#202420]">
                    <colgroup><col className="w-[17%]" /><col className="w-[26%]" /><col className="w-[23.5%]" /><col className="w-[18%]" /><col className="w-[15.5%]" /></colgroup>
                    <thead className="bg-[#FAF7F4] text-[16px]"><tr>{["Date", "Time", "Type", "Status", "Action"].map(label => <th key={label} scope="col" className="h-11 px-[18px] font-medium">{label}</th>)}</tr></thead>
                    <tbody>
                      {pagedPast.items.map(item => <tr key={item.type + item.data.id} className="h-[54px] border-t border-[#f1efec]">
                        <td className="px-[18px] py-3 font-medium">{fmtDateShort(item.date)}</td>
                        <td className="whitespace-nowrap px-[18px] py-3">{appointmentTime(item)}</td>
                        <td className="px-[18px] py-3 text-[14px]">{item.type === "online" ? "Online Consultation" : "Offline Consultation"}</td>
                        <td className="px-[18px]  py-3"><AppointmentStatus status={item.data.status} /></td>
                        <td className="px-[18px] py-3"><AppointmentActions item={item} onJoin={handleJoinCall} onViewPrescription={handleViewApptRx} /></td>
                      </tr>)}
                      {pastAppts.length === 0 && <tr><td colSpan={5} className="p-5 text-center text-sm text-gray-500">No past appointments</td></tr>}
                    </tbody>
                  </table>
                </div>

                {pastAppts.length > portalPageSize && (
                  <nav aria-label="Past appointments pages" className="mt-auto pt-3 md:pt-0 md:border-t md:border-[#eee8e3]">
                    <AdminPagination currentPage={pagedPast.page} totalItems={pastAppts.length} pageSize={portalPageSize} onPageChange={setPastPage} itemLabel="appointments" className="rounded-[13px] border border-[#eee8e3]" />
                  </nav>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ── 3. PRESCRIPTIONS TAB ── */}
        {sidebarTab === "prescriptions" && (
          <div className="space-y-8 animate-in fade-in duration-200 w-full">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="text-3xl font-bold font-sans text-gray-900">Prescriptions</h1>
              <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                <label className="flex h-[44px] w-full items-center gap-4 rounded-xl border border-[#cfd5c9] bg-white px-3.5 sm:w-[298px]">
                  <Search size={17} className="shrink-0 text-[#62685f]" />
                  <input type="search" value={prescriptionSearch} onChange={event => { setPrescriptionSearch(event.target.value); setPrescriptionPage(1); }} aria-label="Search prescriptions by title, date or doctor" placeholder="Search title, date, doctor..." className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-[#777]" />
                </label>
                {patient?.emailVerified && (
                  <button
                    onClick={openBooking}
                    className="bg-[#D95B2F] hover:bg-[#C84F27] text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2 active:scale-95"
                  >
                    Book Appointment
                  </button>
                )}
              </div>
            </div>
            {prescriptions.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#EDEFEB] p-12 text-center">
                <FileText size={40} className="text-gray-300 mx-auto mb-3" />
                <p className="font-bold text-gray-600 font-sans">No prescriptions available</p>
                <p className="text-xs font-sans text-gray-500 mt-1 mb-4">Prescriptions will appear here after your consultations.</p>
                
              </div>
            ) : filteredPrescriptions.length === 0 ? (
              <p role="status" className="rounded-[13px] border border-[#e3eaf3] bg-white p-6 text-center text-sm text-gray-500">No prescriptions match your search.</p>
            ) : (
              <div className={cn("flex flex-col", filteredPrescriptions.length > portalPageSize && "sm:min-h-[580px]")}>
                <div className="space-y-3 flex-1">
                  {pagedPrescriptions.items.map(appt => {
                    const photoPath = appt.prescription?.photoObjectPath;
                    const apptDate = appt.slot.date;
                    return (
                      <div key={`${appt.type || "rx"}-${appt.id}`} className="flex min-h-[65px] flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[13px] border border-[#e3eaf3] bg-white p-3.5 sm:px-4 sm:py-2.5">
                        <div className="flex min-w-0 flex-1 items-start sm:items-center gap-3">
                          <div
                            className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 sm:mt-0",
                              photoPath
                                ? "bg-blue-50 text-blue-500"
                                : "bg-red-50 text-red-500"
                            )}
                          >
                            {photoPath ? (
                              <ImageIcon size={20} />
                            ) : (
                              <FileText size={20} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] sm:text-[16px] font-bold leading-5 sm:leading-4 text-[#172238] break-words">
                              {photoPath ? "Prescription Document" : "Digital Prescription"}
                            </p>
                            <p className="mt-1 text-[12px] leading-relaxed text-[#7c8ca4] break-words">
                              <span className="text-[#27364c] font-semibold">{fmtDateShort(apptDate)} • {appt.timeLabel}</span>
                              <span className="block sm:inline sm:before:content-['·_']">{PRESCRIPTION_PRESCRIBER}</span>
                            </p>
                          </div>
                        </div>
                        <div className="ml-auto flex shrink-0 items-center gap-2 self-end sm:self-auto pt-1 sm:pt-0">
                          {photoPath ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setPreviewPrescription({ name: "Prescription Document", objectPath: photoPath, contentType: "" })}
                                className="inline-flex items-center gap-1 rounded-md border border-[#e3eaf3] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#d95b2f] transition-colors hover:bg-orange-50 cursor-pointer shadow-2xs"
                              >
                                <Eye size={12} /> View
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadPhotoPrescription(photoPath, `Prescription_${fmtDateShort(apptDate).replace(/\s+/g, "_")}.pdf`)}
                                className="inline-flex items-center gap-1 rounded-md border border-[#e3eaf3] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#27364c] transition-colors hover:bg-gray-50 cursor-pointer shadow-2xs"
                              >
                                <Download size={12} /> Download
                              </button>
                            </>
                          ) : appt.prescription?.notes ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openAppointmentPrescription({
                                  id: appt.id,
                                  type: appt.type,
                                  date: appt.apptDate,
                                  time: appt.timeLabel,
                                  prescription: appt.prescription,
                                })}
                                className="inline-flex items-center gap-1 rounded-md border border-[#e3eaf3] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#d95b2f] transition-colors hover:bg-orange-50 cursor-pointer shadow-2xs"
                              >
                                <Eye size={12} /> View
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadDigitalPrescription({
                                  id: appt.id,
                                  type: appt.type,
                                  date: appt.apptDate,
                                  time: appt.timeLabel,
                                  prescription: appt.prescription,
                                })}
                                className="inline-flex items-center gap-1 rounded-md border border-[#e3eaf3] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#27364c] transition-colors hover:bg-gray-50 cursor-pointer shadow-2xs"
                              >
                                <Download size={12} /> Download
                              </button>
                            </>
                          ) : (
                            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-lg">Issued</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {filteredPrescriptions.length > portalPageSize && (
                  <nav aria-label="Prescriptions pages" className="mt-auto pt-3">
                    <AdminPagination currentPage={pagedPrescriptions.page} totalItems={filteredPrescriptions.length} pageSize={portalPageSize} onPageChange={setPrescriptionPage} itemLabel="prescriptions" className="rounded-[13px] border border-[#e3eaf3]" />
                  </nav>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── 4. MY DOCS TAB ── */}
        {sidebarTab === "docs" && (
          <div className="space-y-8 animate-in fade-in duration-200 w-full">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="text-3xl font-bold font-sans text-gray-900">Medical Documents</h1>
              <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                <label className="flex h-[44px] w-full items-center gap-4 rounded-xl border border-[#cfd5c9] bg-white px-3.5 sm:w-[298px]">
                  <Search size={17} className="shrink-0 text-[#62685f]" />
                  <input type="search" value={documentSearch} onChange={event => { setDocumentSearch(event.target.value); setDocumentPage(1); }} aria-label="Search documents by file name, patient ID or uploaded date" placeholder="Search file, patient ID, date..." className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-[#777]" />
                </label>
              <MedicalDocumentUploader
                mode="popover"
                isUploading={uploadingCount > 0}
                onUploadFiles={uploadPatientDocs}
              />
              </div>
            </div>
            <section aria-labelledby="recent-documents-heading" className={cn("flex flex-1 flex-col", filteredPatientDocs.length > portalPageSize && "sm:min-h-[580px]")}>
              <h2 id="recent-documents-heading" className="mb-3 text-[18px] sm:text-[20px] font-bold text-[#172238]">Recent Documents</h2>
              <div className="space-y-3 flex-1">
                {pagedPatientDocs.items.map(doc => (
                  <div key={doc.id} className="flex min-h-[65px] flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[13px] border border-[#e3eaf3] bg-white p-3.5 sm:px-4 sm:py-2.5">
                    <div className="flex min-w-0 flex-1 items-start sm:items-center gap-3">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 sm:mt-0",
                          doc.contentType.startsWith("image/")
                            ? "bg-blue-50 text-blue-500"
                            : "bg-red-50 text-red-500"
                        )}
                      >
                        {doc.contentType.startsWith("image/") ? (
                          <ImageIcon size={20} />
                        ) : (
                          <FileText size={20} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p title={doc.name} className="line-clamp-2 sm:truncate text-[15px] sm:text-[16px] font-bold leading-5 sm:leading-6 text-[#172238] break-words">{doc.name}</p>
                        <p className="mt-1 text-[12px] leading-3 text-[#7c8ca4]">Uploaded: <span className="text-[#27364c]">{doc.createdAt ? new Date(doc.createdAt).toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short", year: "numeric" }) : "Date unavailable"}</span></p>
                      </div>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-2 self-end sm:self-auto pt-1 sm:pt-0">
                      <button type="button" onClick={() => setPreviewDoc(doc)} className="inline-flex items-center gap-1 rounded-md border border-[#e3eaf3] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#d95b2f] transition-colors hover:bg-orange-50 shadow-2xs"><Eye size={12} /> View</button>
                      <button type="button" onClick={() => downloadFileDirectly(BASE + "/api/storage" + doc.objectPath + "?download=1&filename=" + encodeURIComponent(doc.name), doc.name)} className="inline-flex items-center gap-1 rounded-md border border-[#e3eaf3] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#27364c] transition-colors hover:bg-gray-50 cursor-pointer shadow-2xs"><Download size={12} /> Download</button>
                      <button type="button" onClick={() => setConfirmDeleteDoc(doc)} aria-label={"Delete " + doc.name} title="Delete document" className="rounded p-1.5 text-[#9d9894] transition-colors hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
                {patientDocs.length === 0 ? (
                  <div className="rounded-[13px] border border-[#e3eaf3] bg-white p-8 text-center">
                    <FolderOpen size={32} className="mx-auto mb-3 text-gray-300" />
                    <p className="text-sm font-bold text-gray-600">No documents uploaded yet</p>
                    <p className="mt-1 text-xs text-gray-500">Upload your medical reports, test results, or scans</p>
                  </div>
                ) : filteredPatientDocs.length === 0 && (
                  <p role="status" className="rounded-[13px] border border-[#e3eaf3] bg-white p-6 text-center text-sm text-gray-500">No documents match your search.</p>
                )}
              </div>
              {filteredPatientDocs.length > portalPageSize && (
                <nav aria-label="Medical documents pages" className="sticky bottom-0 z-10 mt-auto bg-[#f8faf9] pt-3">
                  <AdminPagination currentPage={pagedPatientDocs.page} totalItems={filteredPatientDocs.length} pageSize={portalPageSize} onPageChange={setDocumentPage} itemLabel="documents" className="rounded-[13px] border border-[#e3eaf3]" />
                </nav>
              )}
            </section>
          </div>
        )}

        {/* ── 5. PROFILE TAB ── */}
        {sidebarTab === "profile" && patient && (
          <PatientProfile
            patient={{
              id: patient.id,
              patientCode: patient.patientCode,
              name: patient.name,
              age: patient.age ?? null,
              gender: patient.gender ?? null,
              address: patient.address ?? null,
              email: patient.email,
              phone: patient.phone ?? null,
              emailVerified: patient.emailVerified,
            }}
            onPatientUpdate={(updated) => {
              setPatient((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  name: updated.name,
                  age: updated.age,
                  gender: updated.gender,
                  address: updated.address ?? null,
                  email: updated.email,
                  phone: updated.phone || undefined,
                  patientCode: updated.patientCode,
                  emailVerified: updated.emailVerified ?? prev.emailVerified,
                };
              });
            }}
          />
        )}

        <ConfirmDeleteDialog
          isOpen={!!confirmDeleteDoc}
          title="Remove Medical Document?"
          description={
            confirmDeleteDoc ? (
              <p>
                Are you sure you want to remove{" "}
                <strong className="text-gray-900 break-words [overflow-wrap:anywhere]">
                  "{confirmDeleteDoc.name}"
                </strong>
                ? This document will be permanently deleted from your medical records.
              </p>
            ) : null
          }
          warningText="This action cannot be undone."
          confirmLabel="Delete"
          isLoading={deletingDocId !== null}
          onConfirm={() => {
            if (confirmDeleteDoc) deletePatientDoc(confirmDeleteDoc.id);
          }}
          onClose={() => {
            if (!deletingDocId) setConfirmDeleteDoc(null);
          }}
        />

      </main>
    </div>
  );
}

