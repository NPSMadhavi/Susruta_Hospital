import React, { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Clock, LogOut, Video, FileText, User,
  RefreshCw, CheckCircle2, MapPin,
  Download, Heart, QrCode, X,
  AlertCircle, Phone, ChevronDown, ChevronUp,
  Bell, ImageIcon, Loader2, Trash2, Upload, Camera, FolderOpen,
  Mic, VideoIcon, ShieldCheck, LayoutDashboard, RotateCcw, Eye, Search,
} from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";
import { cn } from "@/lib/utils";
import { todayIST, dualSlotTime, dualOfflineTime } from "@/lib/ist";
import { dateSearchTerms, matchesPortalSearch } from "@/lib/portal-search";
import { usePortalSectionBadges } from "@/hooks/use-portal-section-badges";
import { playAppointmentChime } from "@/lib/sound";
import { BookingWizard } from "./BookingWizard";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { VideoCall, GuestLinkCard, CallDocumentUpload } from "@/components/VideoCall";
import PatientProfile from "@/components/portal/PatientProfile";
import { MedicalDocumentUploader } from "@/components/MedicalDocumentUploader";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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

function AppointmentActions({ item, onJoin }: { item: AppointmentItem; onJoin: (id: number) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [previewDocument, setPreviewDocument] = useState<DocFile | null>(null);
  const online = item.type === "online" ? item.data : null;
  return <div className="flex flex-wrap  items-center gap-2">
    {online?.joinEnabled && <button onClick={() => onJoin(online.id)} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1.5 text-[12px] text-white hover:bg-emerald-700"><Video size={11} /> Join Video Call</button>}
    <button onClick={() => dialogRef.current?.showModal()} aria-label={"View documents for " + fmtDateShort(item.date)} className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md bg-[#D95B2F] px-3 py-1.5 text-[12px] font-medium leading-3 text-white hover:bg-[#c94e25]"><Eye size={12} /> View Documents</button>
    <dialog ref={dialogRef} aria-label="Appointment documents" className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-xl bg-white p-5 text-sm shadow-xl backdrop:bg-black/40">
      <div className="mb-4 flex items-center justify-between gap-4"><h3 className="font-bold text-[#20392b]">Documents · {fmtDateShort(item.date)}</h3><button onClick={() => dialogRef.current?.close()} aria-label="Close documents" className="rounded p-1 text-gray-500 hover:bg-gray-100"><X size={18} /></button></div>
      {online?.documents?.length ? <div className="space-y-2">{online.documents.map((doc, index) => <button key={index} type="button" onClick={() => setPreviewDocument(doc)} className="flex w-full text-left items-center gap-2 rounded-lg border border-[#eee8e3] p-3 text-[#d95b2f] hover:bg-orange-50"><FileText size={16} className="shrink-0" /><span className="break-all">{doc.name}</span></button>)}</div> : <p className="py-4 text-gray-500">No documents attached to this appointment.</p>}
    </dialog>
    {previewDocument && <MedicalDocumentPreview key={previewDocument.objectPath} doc={previewDocument} onClose={() => setPreviewDocument(null)} />}
  </div>;
}

const MedicalPdfPreview = React.lazy(() => import("@/components/CleanPdfViewer").then(module => ({ default: module.CleanPdfViewer })));

function MedicalDocumentPreview({ doc, onClose }: { doc: Pick<PatientDoc, "name" | "objectPath" | "contentType">; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [preview, setPreview] = useState<{ url: string; blob: Blob; kind: "pdf" | "image" | "docx" } | null>(null);
  const [error, setError] = useState("");
  const [wordLoading, setWordLoading] = useState(true);

  useEffect(() => {
    dialogRef.current?.showModal();
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
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
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

  return <dialog ref={dialogRef} onClose={onClose} aria-label={"Preview: " + doc.name} className="fixed inset-0 m-auto h-[85vh] w-[calc(100%-2rem)] max-w-5xl rounded-2xl bg-white p-0 shadow-xl backdrop:bg-black/50">
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
        <h2 className="truncate text-base font-bold text-gray-900">{doc.name}</h2>
        <button autoFocus type="button" onClick={() => dialogRef.current?.close()} aria-label="Close document preview" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X size={20} /></button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-auto bg-gray-50 p-3">
        {error ? <p role="alert" className="p-6 text-center text-red-600">{error}</p> : !preview ? <div role="status" className="flex items-center justify-center gap-2 p-8 text-gray-500"><Loader2 size={20} className="animate-spin" /> Loading document...</div> : preview.kind === "pdf" ? (
          <React.Suspense fallback={<p role="status" className="p-6 text-center">Loading document...</p>}><MedicalPdfPreview url={preview.url} title={doc.name} className="h-full" /></React.Suspense>
        ) : preview.kind === "image" ? <img src={preview.url} alt={doc.name} onError={() => setError("Unable to preview this image.")} className="mx-auto max-h-full max-w-full object-contain" /> : <>
          {wordLoading && <p role="status" className="p-4 text-center text-gray-500">Loading document...</p>}
          <iframe ref={frameRef} title={doc.name} sandbox="allow-same-origin" srcDoc={'<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"></body></html>'} onLoad={() => void renderWord()} className="h-full w-full border-0 bg-white" />
        </>}
      </div>
    </div>
  </dialog>;
}

// ── Join Popup ──────────────────────────────────────────────────
function JoinPopup({ apptId, onJoin, onClose }: {
  apptId: number;
  onJoin: (id: number) => void; onClose: () => void;
}) {
  function handleJoin() {
    onJoin(apptId);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center">
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
          className="block w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl text-base transition-colors shadow-lg">
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center">
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
          className="block w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl text-base transition-colors shadow-lg">
          Answer Video Call →
        </button>
        <button onClick={onClose} className="mt-3 text-sm font-semibold text-gray-400 hover:text-gray-600">
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

  async function handleDonate() {
    setError("");
    if (!amount.trim()) { setError("Please enter the amount you donated."); return; }
    if (lastSix.trim().length < 4) { setError("Please enter at least the last 4 digits of your transaction."); return; }
    setSubmitting(true);
    try {
      await fetch(`${BASE}/api/patient/donations`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amount.trim(), lastSixDigits: lastSix.trim(), appointmentId: apptId || null }),
      });
      setScreen("receipt");
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl max-w-md w-full relative my-4">

        {screen === "appeal" && (
          <>
            <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white hover:text-black hover:bg-white rounded-xl transition-colors z-10">
              <X size={18} />
            </button>
            <div className="bg-[#D95B2F] rounded-t-3xl px-6 pt-8 pb-6 text-center">
              <div className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center mx-auto mb-3">
                <Heart size={28} className="text-white" fill="currentColor" />
              </div>
              <h2 className="text-xl font-extrabold text-white leading-snug">
                Your Health Was Restored.<br />Help Restore Someone Else's.
              </h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed italic border-l-4 border-[#1a3d2b]/30 pl-4">
                "Thousands of patients have found relief through Dr. Murali Krishna's Ayurvedic care — many of them could not afford treatment on their own."
              </p>
              <p className="text-sm text-gray-600 leading-relaxed">
                Behind every consultation is decades of knowledge, personal time, and often medicines provided at no cost to those who truly need it.
              </p>
              <button onClick={() => setScreen("donate")}
                className="w-full py-4 bg-[#D95B2F] text-white font-extrabold rounded-2xl text-base hover:bg-[#C84F27] transition-colors shadow-lg">
                Yes, I want to donate
              </button>
              <button onClick={onClose} className="w-full py-2.5 text-gray-400 text-sm hover:text-gray-600 transition-colors">
                Maybe next time
              </button>
            </div>
          </>
        )}

        {screen === "donate" && (
          <>
            <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white hover:text-gray-700 hover:bg-white rounded-xl transition-colors z-10">
              <X size={18} />
            </button>
            <div className="bg-[#D95B2F] rounded-t-3xl px-6 pt-7 pb-5 text-center">
              <p className="text-white/70 text-xs font-semibold tracking-widest mb-1">Step 2 of 2</p>
              <h2 className="text-lg font-extrabold text-white">Scan &amp; Confirm Your Donation</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              {qrObjectPath ? (
                <div className="text-center">
                  <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100 inline-block">
                    <img src={`${BASE}/api/storage${qrObjectPath}`} alt="UPI QR" className="w-44 h-44 object-contain mx-auto" />
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">Scan with PhonePe, Google Pay, Paytm, or any UPI app</p>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 text-center">
                  <QrCode size={40} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">QR will be available soon — ask us for UPI ID directly</p>
                </div>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800">
                <p className="font-bold mb-1">📝 Important — In the UPI "Message / Note" field, please type:</p>
                <p className="font-black text-amber-900 text-base font-mono tracking-widest text-center py-1">
                  {patientCode || "Your Patient ID"}
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 tracking-wide block mb-1.5">How much are you donating? (₹)</label>
                <input type="number" min="1" placeholder="e.g. 500" value={amount} onChange={e => setAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base font-semibold focus:outline-none focus:border-[#1a3d2b]" />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 tracking-wide block mb-1.5">Transaction ID — Last 6 digits <span className="text-red-500">*</span></label>
                <input type="text" maxLength={6} placeholder="e.g. 892341" value={lastSix} onChange={e => setLastSix(e.target.value.replace(/\D/g, ""))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base font-mono font-semibold tracking-widest focus:outline-none focus:border-[#1a3d2b]" />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm">
                  <AlertCircle size={14} className="shrink-0" /> {error}
                </div>
              )}

              <button
                onClick={handleDonate}
                disabled={submitting}
                className="w-full py-4 bg-[#D95B2F] text-white font-extrabold rounded-2xl text-base hover:bg-[#C84F27] transition-colors disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg"
              >
                {submitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : null}
                {submitting ? "Recording donation…" : "Done"}
              </button>
            </div>
          </>
        )}

        {screen === "receipt" && (
          <div className="px-6 py-10 text-center">
            <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5">
              <Heart size={36} className="text-red-600" fill="currentColor" />
            </div>
            <h2 className="text-2xl font-extrabold text-[#1a3d2b] mb-3">Thank You! 🙏</h2>
            <p className="text-base text-gray-600 leading-relaxed mb-6">
              Your generosity has been recorded. Dr. Murali Krishna and the entire Susruta Hospital team are deeply grateful.
            </p>
            <button onClick={onClose} className="w-full py-3.5 bg-[#D95B2F] text-white font-bold rounded-2xl text-sm hover:bg-[#D95B2F]/90 transition-colors">
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
  const [patient, setPatient] = useState<Patient | null>(null);
  const [onlineAppts, setOnlineAppts] = useState<OnlineAppt[]>([]);
  const [physicalAppts, setPhysicalAppts] = useState<PhysicalAppt[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinPopup, setJoinPopup] = useState<{ apptId: number } | null>(null);
  const [directCall, setDirectCall] = useState<DirectCall | null>(null);
  const [directCallPopup, setDirectCallPopup] = useState<DirectCall | null>(null);
  const [donationPopup, setDonationPopup] = useState<{ apptId: number; qrObjectPath: string | null } | null>(null);
  const [videoCallApptId, setVideoCallApptId] = useState<number | null>(null);
  const [videoCallDirectId, setVideoCallDirectId] = useState<number | null>(null);
  const [permissionRequest, setPermissionRequest] = useState<{ apptId: number } | null>(null);
  const [showBooking, setShowBooking] = useState(false);
  const [bookingKey, setBookingKey] = useState(0);

  const openBooking = () => {
    if (!patient?.emailVerified) return;
    setBookingKey(k => k + 1);
    setShowBooking(true);
  };

  const closeBooking = () => {
    setBookingKey(k => k + 1);
    setShowBooking(false);
  };
  const [sidebarTab, setSidebarTab] = useState<"dashboard" | "appointments" | "prescriptions" | "docs" | "profile">("dashboard");
  const [patientDocs, setPatientDocs] = useState<PatientDoc[]>([]);
  const [documentSearch, setDocumentSearch] = useState("");
  const [prescriptionSearch, setPrescriptionSearch] = useState("");
  const [previewDoc, setPreviewDoc] = useState<PatientDoc | null>(null);
  const [previewPrescription, setPreviewPrescription] = useState<Pick<PatientDoc, "name" | "objectPath" | "contentType"> | null>(null);
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
  const videoCallDirectIdRef = useRef<number | null>(null);
  videoCallDirectIdRef.current = videoCallDirectId;

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
      if (activeDirect && !videoCallDirectIdRef.current) {
        setDirectCallPopup(activeDirect);
      }
      phonepeQrRef.current = settings?.phonepeQrObjectPath ?? null;
    } catch (err) {
      console.error("[PatientDashboard] Error loading data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!patient?.id) return;
    const es = new EventSource(`${BASE}/api/patient/sse`, { withCredentials: true });

    es.addEventListener("join_enabled", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { apptId: number; roomName: string; guestToken?: string | null };
        playChime();
        setJoinPopup({ apptId: data.apptId });
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
        setVideoCallApptId(prev => {
          if (prev === data.apptId) {
            setDonationPopup({ apptId: data.apptId, qrObjectPath: data.qrObjectPath || phonepeQrRef.current });
            return null;
          }
          return prev;
        });
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
        playChime();
        setDirectCall(data);
        setDirectCallPopup(data);
      } catch (err) {
        console.error("[Patient SSE] direct_call_started error:", err);
      }
    });

    es.addEventListener("direct_call_ended", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { callId: number };
        setDirectCallPopup(prev => prev?.id === data.callId ? null : prev);
        setVideoCallDirectId(prev => prev === data.callId ? null : prev);
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
  const prescriptions = onlineAppts.filter(a => a.prescription?.photoObjectPath || cleanDoctorNotes(a.prescription?.notes));
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
    <div className="min-h-screen md:h-screen flex flex-col md:flex-row w-full bg-[#f8faf9] font-sans font-['DM_Sans',sans-serif] md:overflow-hidden [&_h1]:font-sans [&_h2]:font-sans [&_h3]:font-sans [&_h4]:font-sans">
      <AnimatePresence>
        {showBooking && (
          <BookingWizard
            key={`booking-wizard-${bookingKey}`}
            patient={patient}
            onClose={closeBooking}
            onSuccess={() => loadData()}
          />
        )}
        {joinPopup && (
          <JoinPopup
            apptId={joinPopup.apptId}
            onJoin={(id) => {
              setJoinPopup(null);
              setVideoCallApptId(id);
              fetch(`${BASE}/api/online-appointments/${id}/patient-joined`, {
                method: "POST",
                credentials: "include",
              }).catch(() => {});
            }}
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
        {directCallPopup && (
          <DirectCallPopup
            call={directCallPopup}
            onJoin={(id) => {
              setDirectCallPopup(null);
              setVideoCallDirectId(id);
              fetch(`${BASE}/api/direct-calls/${id}/patient-joined`, {
                method: "POST",
                credentials: "include",
              }).catch(() => {});
            }}
            onClose={() => setDirectCallPopup(null)}
          />
        )}
      </AnimatePresence>

      {videoCallApptId && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
          <div className="h-14 px-4 flex items-center justify-between bg-[#1c1c1e] border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
              <p className="text-white text-sm font-bold">Consultation with Dr. P. Murali Krishna</p>
            </div>
            <button
              onClick={() => {
                const endedId = videoCallApptId;
                setVideoCallApptId(null);
                setDonationPopup({ apptId: endedId, qrObjectPath: phonepeQrRef.current });
              }}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition-colors"
            >
              Leave Call
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <VideoCall
              apptId={videoCallApptId}
              role="patient"
              autoJoin
              onCallEnded={() => {
                const endedId = videoCallApptId;
                setVideoCallApptId(null);
                setDonationPopup({ apptId: endedId, qrObjectPath: phonepeQrRef.current });
              }}
              className="h-full rounded-none border-0"
            />
          </div>
        </div>
      )}

      {videoCallDirectId && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
          <div className="h-14 px-4 flex items-center justify-between bg-[#1c1c1e] border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
              <p className="text-white text-sm font-bold">Direct Consultation with Dr. P. Murali Krishna</p>
            </div>
            <button
              onClick={() => {
                const leavingId = videoCallDirectId;
                setVideoCallDirectId(null);
                if (leavingId) {
                  fetch(`${BASE}/api/direct-calls/${leavingId}/patient-leave`, {
                    method: "POST",
                    credentials: "include",
                  }).catch(() => {});
                }
              }}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition-colors"
            >
              Leave Call
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <VideoCall
              directCallId={videoCallDirectId}
              role="patient"
              autoJoin
              onCallEnded={() => {
                const leavingId = videoCallDirectId;
                setVideoCallDirectId(null);
                if (leavingId) {
                  fetch(`${BASE}/api/direct-calls/${leavingId}/patient-leave`, {
                    method: "POST",
                    credentials: "include",
                  }).catch(() => {});
                }
              }}
              className="h-full rounded-none border-0"
            />
          </div>
        </div>
      )}

      {/* ── LEFT SIDEBAR ────────────────────────────────────────── */}
      <aside className="w-full md:w-[270px] lg:w-[282px] bg-white border-b md:border-b-0 md:border-r border-[#EDEFEB] flex flex-col shrink-0 h-auto md:h-screen md:sticky md:top-0">
        {/* Top Scrollable Section */}
        <div className="flex-1 overflow-y-auto pt-5 pb-2">
          {/* Logo & Subtitle */}
          <div className="px-5 pb-4 border-b border-[#EDEFEB] mb-3">
            <img src={logoImg} alt="Susruta Hospital" className="h-9 w-auto max-w-[219px] object-contain" />
            <p className="text-xs font-semibold uppercase tracking-widest mt-1 text-[#42493E]">PATIENT PORTAL</p>
          </div>

          {/* Nav Links - Full Width Edge to Edge */}
          <nav className="space-y-0.5">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = sidebarTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSidebarTab(item.id)}
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
              onClick={() => setDonationPopup({ apptId: 0, qrObjectPath: phonepeQrRef.current })}
              className="w-full py-2 bg-[#D95B2F] hover:bg-[#C84F27] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
            >
              <Heart size={13} fill="currentColor" /> Donate &amp; Support
            </button>
          </div>

          {/* Patient Info & Logout Button */}
          <div>
            <button
              onClick={logout}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-[#FDF2ED] hover:bg-[#FDE8E1] text-[#D95B2F] rounded-xl font-bold text-xs tracking-wider transition-colors shadow-sm"
            >
              <LogOut size={16} className="text-[#D95B2F]" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ────────────────────────────────────── */}
      <main className={cn("flex-1 w-full min-w-0 md:h-screen md:overflow-y-auto", sidebarTab === "appointments" ? "bg-[#f8faf9] px-4 pb-8 pt-4 md:pl-[18px] md:pr-2" : sidebarTab === "docs" ? "p-[14px]" : "p-5 md:p-8 xl:p-10")}>

        {/* Direct Call Alert Banner */}
        {directCall && !videoCallDirectId && (
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
              onClick={() => {
                setVideoCallDirectId(directCall.id);
                fetch(`${BASE}/api/direct-calls/${directCall.id}/patient-joined`, {
                  method: "POST",
                  credentials: "include",
                }).catch(() => {});
              }}
              className="bg-white hover:bg-emerald-50 text-emerald-800 px-6 py-3 rounded-xl font-extrabold text-sm shadow-md transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Video size={16} /> Answer Call Now
            </button>
          </div>
        )}

        {/* Live Video Consultation Alert Banner */}
        {onlineAppts.some(a => a.joinEnabled) && (
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
                if (live) setVideoCallApptId(live.id);
              }}
              className="bg-white hover:bg-emerald-50 text-emerald-800 px-6 py-3 rounded-xl font-extrabold text-sm shadow-md transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
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

        {/* ── 1. DASHBOARD TAB ── */}
        {(sidebarTab === "dashboard" || sidebarTab === "prescriptions") && previewPrescription && <MedicalDocumentPreview key={previewPrescription.objectPath} doc={previewPrescription} onClose={() => setPreviewPrescription(null)} />}

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
                  <span className="text-gray-400">
                    Last updated: Today, {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 w-full">
              {/* Card 1: Upcoming Appointments */}
              <div className="bg-white p-6 rounded-2xl border border-[#EDEFEB] shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold font-sans text-gray-800 text-sm">Upcoming Appointments</h3>
                    <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                      <Calendar size={18} />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2 mt-3">
                    <span className="text-5xl font-extrabold text-gray-900 font-sans">{upcomingCount}</span>
                    
                  </div>
                </div>
              </div>

              {/* Card 2: Total Visits */}
              <div className="bg-white p-6 rounded-2xl border border-[#EDEFEB] shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold font-sans text-gray-800 text-sm">Total Visits</h3>
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                      <RotateCcw size={18} />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2 mt-3">
                    <span className="text-5xl font-extrabold text-emerald-700 font-sans">{pastAppts.length}</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Prescriptions */}
              <div className="bg-white p-6 rounded-2xl border border-[#EDEFEB] shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold font-sans text-gray-800 text-sm">Prescriptions</h3>
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                      <FileText size={18} />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2 mt-3">
                    <span className="text-5xl font-extrabold text-amber-700 font-sans">{prescriptions.length}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 2: My upcoming Appointments */}
            <div className="bg-white rounded-2xl border border-[#EDEFEB] shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold font-sans text-gray-900">My upcoming Appointments</h2>
                <button
                  onClick={() => setSidebarTab("appointments")}
                  className="px-4 py-1.5 rounded-xl border border-[#EDEFEB] text-xs font-bold font-sans text-gray-600 bg-white hover:bg-gray-50 transition-colors"
                >
                  View All
                </button>
              </div>

              <div className="space-y-3">
                {allAppointments.filter(a => isUpcoming(a.date, a.data.status)).length > 0 ? (
                  allAppointments.filter(a => isUpcoming(a.date, a.data.status)).map((item, i) => {
                    const isOnline = item.type === "online";
                    const date = item.date;
                    const status = item.data.status;
                    return (
                      <div key={i} className="bg-gray-50/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 border border-[#EDEFEB]">
                        <div className="flex items-center gap-3.5">
                          <div className="w-11 h-11 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                            <User size={20} />
                          </div>
                          <div>
                            <p className="font-bold text-base font-sans text-gray-900">Dr. P. Murali Krishna</p>
                            <p className="text-xs font-sans text-gray-500 mt-0.5">{isOnline ? "General Ayurveda (Online)" : "In-Person Consultation"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 ml-auto sm:ml-0">
                          <span className="text-xs font-bold font-sans text-gray-700 whitespace-nowrap">
                            {fmtDateShort(date)} • {isOnline ? ((item.data as OnlineAppt).slot?.startTime ? (item.data as OnlineAppt).slot.startTime : "10:00 AM") : "02:30 PM"}
                          </span>
                          {isOnline && (item.data as OnlineAppt).joinEnabled ? (
                            <button
                              onClick={() => setVideoCallApptId(item.data.id)}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-bold transition-all shadow-md animate-pulse flex items-center gap-1.5"
                            >
                              <Video size={13} /> Join Call
                            </button>
                          ) : (
                            <span className={cn(
                              "text-xs font-bold font-sans px-3 py-1 rounded-full border capitalize",
                              status === "confirmed"
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                : "bg-amber-100 text-amber-800 border-amber-200"
                            )}>
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
                    <p className="font-bold text-sm font-sans text-gray-700">No upcoming appointments scheduled</p>
                    <p className="text-xs font-sans text-gray-500 mt-1 mb-3">Book a consultation with Dr. P. Murali Krishna</p>
                    
                  </div>
                )}
              </div>
            </div>

            {/* Row 3: Recent Prescriptions */}
            <div className="bg-white rounded-2xl border border-[#EDEFEB] shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold font-sans text-gray-900">Recent Prescriptions</h2>
                <button
                  onClick={() => setSidebarTab("prescriptions")}
                  className="px-4 py-1.5 rounded-xl border border-[#EDEFEB] text-xs font-bold font-sans text-gray-600 bg-white hover:bg-gray-50 transition-colors"
                >
                  View All
                </button>
              </div>

              <div className="space-y-4 divide-y divide-gray-100">
                {prescriptions.length > 0 ? (
                  prescriptions.map((appt, i) => {
                    const photoPath = appt.prescription?.photoObjectPath;
                    const firstDoc = photoPath
                      ? { name: "Prescription Document", objectPath: photoPath, contentType: "" }
                      : appt.documents?.[0] || null;

                    return (
                      <div key={i} className={`flex items-center justify-between flex-wrap gap-2 ${i > 0 ? "pt-4" : ""}`}>
                        <div>
                          <p className="font-bold text-sm font-sans text-gray-900">
                            Prescription — {fmtDateShort(appt.slot.date)}
                          </p>
                          <p className="text-xs font-sans text-gray-500 mt-0.5">
                            Prescribed by Dr. P. Murali Krishna
                          </p>
                        </div>
                        {firstDoc && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setPreviewPrescription(firstDoc)}
                              className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold font-sans transition-colors inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye size={12} /> View
                            </button>
                            <a
                              href={`${BASE}/api/storage${firstDoc.objectPath}`}
                              download
                              className="px-3 py-1 bg-[#D95B2F]/10 hover:bg-[#D95B2F]/20 text-[#D95B2F] rounded-lg text-xs font-bold font-sans transition-colors inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Download size={12} /> Download
                            </a>
                          </div>
                        )}
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
            </div>
          </div>
        )}

        {/* ── 2. APPOINTMENTS TAB ── */}
        {sidebarTab === "appointments" && (
          <div className="w-full p-6 animate-in fade-in duration-200">
            <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
              <h1 className="text-3xl font-bold leading-7 text-[#20392b]">My Appointments</h1>
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
              <h2 id="upcoming-appointments-heading" className="mb-[18px] flex items-center gap-3 text-[20px] font-bold leading-5 text-[#242424]"> Upcoming Appointments</h2>
              <div className="space-y-3">
                {upcomingAppointments.map(item => (
                  <div key={item.type + item.data.id} className="flex min-h-16 flex-wrap items-center gap-4 rounded-[13px] border border-[#ffb29b] bg-white py-[11px] pl-[18px] pr-[17px]">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f6eae6] text-[#b9380d]">{item.type === "online" ? <Video size={17} fill="currentColor" strokeWidth={1.5} /> : <MapPin size={17} />}</div>
                    <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 sm:ml-[19px]"><p className="text-base font-bold text-black">{fmtDateShort(item.date)}</p><p className="text-sm text-black">{appointmentTime(item)} · {item.type === "online" ? "Online Consultation" : "Offline Consultation"}</p></div>
                    <div className="ml-auto flex items-center gap-1.5"><AppointmentStatus status={item.data.status} /><AppointmentActions item={item} onJoin={setVideoCallApptId} /></div>
                  </div>
                ))}
                {upcomingCount === 0 && <p className="rounded-[13px] border border-[#eee8e3] p-5 text-sm text-gray-500">No upcoming appointments scheduled</p>}
              </div>
            </section>
            <section aria-labelledby="past-appointments-heading" className="mt-[23px]">
              <h2 id="past-appointments-heading" className="mb-3 flex items-center gap-1.5 text-[20px] font-bold leading-5 text-[#263248]"> Past Appointments</h2>
              <div className="overflow-x-auto rounded-[13px] border border-[#eee8e3] bg-white">
                <table className="w-full min-w-[700px] table-fixed border-collapse text-left text-[14px] text-[#202420]">
                  <colgroup><col className="w-[17%]" /><col className="w-[26%]" /><col className="w-[23.5%]" /><col className="w-[18%]" /><col className="w-[15.5%]" /></colgroup>
                  <thead className="bg-[#FAF7F4] text-[16px]"><tr>{["Date", "Time", "Type", "Status", "Action"].map(label => <th key={label} scope="col" className="h-11 px-[18px] font-medium">{label}</th>)}</tr></thead>
                  <tbody>
                    {pastAppts.map(item => <tr key={item.type + item.data.id} className="h-[54px] border-t border-[#f1efec]">
                      <td className="px-[18px] py-3 font-medium">{fmtDateShort(item.date)}</td>
                      <td className="whitespace-nowrap px-[18px] py-3">{appointmentTime(item)}</td>
                      <td className="px-[18px] py-3 text-[14px]">{item.type === "online" ? "Online Consultation" : "Offline Consultation"}</td>
                      <td className="px-[18px]  py-3"><AppointmentStatus status={item.data.status} /></td>
                      <td className="px-[18px] py-3"><AppointmentActions item={item} onJoin={setVideoCallApptId} /></td>
                    </tr>)}
                    {pastAppts.length === 0 && <tr><td colSpan={5} className="p-5 text-center text-sm text-gray-500">No past appointments</td></tr>}
                  </tbody>
                </table>
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
                  <input type="search" value={prescriptionSearch} onChange={event => setPrescriptionSearch(event.target.value)} aria-label="Search prescriptions by title, date or doctor" placeholder="Search title, date, doctor..." className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-[#777]" />
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
              <div className="space-y-3">
                {filteredPrescriptions.map(appt => {
                  const photoPath = appt.prescription?.photoObjectPath;
                  return (
                    <div key={appt.id} className="flex min-h-[65px] flex-wrap items-center justify-between gap-3 rounded-[13px] border border-[#e3eaf3] bg-white px-4 py-2.5">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#e3eaf3] bg-[#f1f5f9] text-[#3d4e66]">
                          <FileText size={17} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[16px] font-bold leading-4 text-[#172238]">{photoPath ? "Prescription Document" : "Digital Prescription"}</p>
                          <p className="mt-1 text-[12px] leading-4 text-[#7c8ca4]"><span className="text-[#27364c]">{fmtDateShort(appt.slot.date)}</span> · {PRESCRIPTION_PRESCRIBER}</p>
                        </div>
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-2">
                        {photoPath ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setPreviewPrescription({ name: "Prescription Document", objectPath: photoPath, contentType: "" })}
                              className="inline-flex items-center gap-1 rounded-md border border-[#e3eaf3] bg-white px-2 py-1 text-[12px] font-medium text-[#d95b2f] transition-colors hover:bg-orange-50"
                            >
                              <Eye size={11} /> View
                            </button>
                            <a
                              href={`${BASE}/api/storage${photoPath}`}
                              download
                              className="inline-flex items-center gap-1 rounded-md border border-[#e3eaf3] bg-white px-2 py-1 text-[12px] font-medium text-[#27364c] transition-colors hover:bg-gray-50"
                            >
                              <Download size={10} /> Download
                            </a>
                          </>
                        ) : (
                          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-lg">Issued</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── 4. MY DOCS TAB ── */}
        {sidebarTab === "docs" && (
          <div className="w-full p-7 animate-in fade-in duration-200">
            {previewDoc && <MedicalDocumentPreview key={previewDoc.id} doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
            <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
              <h1 className="text-[30px] font-bold leading-7 text-[#20392b]">Medical Documents</h1>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex h-[44px] w-full items-center gap-4 rounded-xl border border-[#cfd5c9] bg-white px-3.5 sm:w-[298px]">
                  <Search size={17} className="shrink-0 text-[#62685f]" />
                  <input type="search" value={documentSearch} onChange={event => setDocumentSearch(event.target.value)} aria-label="Search documents by file name, patient ID or uploaded date" placeholder="Search file, patient ID, date..." className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-[#777]" />
                </label>
              <MedicalDocumentUploader
                mode="popover"
                isUploading={uploadingCount > 0}
                onUploadFiles={uploadPatientDocs}
              />
              </div>
            </div>
            <section aria-labelledby="recent-documents-heading">
              <h2 id="recent-documents-heading" className="mb-3 text-[20px] font-bold text-[#172238]">Recent Documents</h2>
              <div className="space-y-3">
                {filteredPatientDocs.map(doc => (
                  <div key={doc.id} className="flex min-h-[65px] flex-wrap items-center justify-between gap-3 rounded-[13px] border border-[#e3eaf3] bg-white px-4 py-2.5">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#e3eaf3] bg-[#f1f5f9] text-[#3d4e66]">
                        {doc.contentType.startsWith("image/") ? <ImageIcon size={17} /> : <FileText size={17} />}
                      </div>
                      <div className="min-w-0">
                        <p title={doc.name} className="truncate text-[16px] font-bold leading-4 text-[#172238]">{doc.name}</p>
                        <p className="mt-1 text-[12px] leading-3 text-[#7c8ca4]">Uploaded: <span className="text-[#27364c]">{doc.createdAt ? new Date(doc.createdAt).toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short", year: "numeric" }) : "Date unavailable"}</span></p>
                      </div>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <button type="button" onClick={() => setPreviewDoc(doc)} className="inline-flex items-center gap-1 rounded-md border border-[#e3eaf3] bg-white px-2 py-1 text-[12px] font-medium text-[#d95b2f] transition-colors hover:bg-orange-50"><Eye size={11} /> View</button>
                      <a href={BASE + "/api/storage" + doc.objectPath} download={doc.name} className="inline-flex items-center gap-1 rounded-md border border-[#e3eaf3] bg-white px-2 py-1 text-[12px] font-medium text-[#27364c] transition-colors hover:bg-gray-50"><Download size={10} /> Download</a>
                      <button type="button" onClick={() => setConfirmDeleteDoc(doc)} aria-label={"Delete " + doc.name} title="Delete document" className="rounded p-1 text-[#9d9894] transition-colors hover:bg-red-50 hover:text-red-600"><Trash2 size={12} /></button>
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
                Are you sure you want to remove <strong className="text-gray-900">"{confirmDeleteDoc.name}"</strong>? This document will be permanently deleted from your medical records.
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
