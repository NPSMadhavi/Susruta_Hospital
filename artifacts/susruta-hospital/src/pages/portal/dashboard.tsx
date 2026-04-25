import React, { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Clock, LogOut, Video, FileText, User,
  RefreshCw, CheckCircle2, MapPin,
  Download, Heart, QrCode, X,
  AlertCircle, Phone, ChevronDown, ChevronUp,
  Bell, ImageIcon, Loader2, Trash2, Upload, Camera, FolderOpen,
} from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";
import { cn } from "@/lib/utils";
import { todayIST, dualSlotTime, dualOfflineTime } from "@/lib/ist";
import { BookingWizard } from "./BookingWizard";
import { VideoCall, GuestLinkCard, CallDocumentUpload } from "@/components/VideoCall";

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
type Patient = { id: number; patientCode: string | null; name: string; email: string; phone?: string; emailVerified: boolean };

// ── Helpers ─────────────────────────────────────────────────────
const IST = "Asia/Kolkata";
function fmtDate(d: string) {
  return new Date(d + "T00:00:00+05:30").toLocaleDateString("en-IN", { timeZone: IST, weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function fmtDateShort(d: string) {
  return new Date(d + "T00:00:00+05:30").toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short", year: "numeric" });
}
function isUpcoming(date: string, status: string) {
  const today = todayIST();
  return date >= today && !["cancelled", "completed"].includes(status);
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
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.28);
      gain.gain.linearRampToValueAtTime(0.7, ctx.currentTime + i * 0.28 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.28 + 1.8);
      osc.start(ctx.currentTime + i * 0.28);
      osc.stop(ctx.currentTime + i * 0.28 + 1.8);
    });
    // Speak "Please join the call" after the chime finishes (~1.5s)
    setTimeout(() => {
      try {
        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance("Please join the call");
          utter.rate = 0.85;
          utter.pitch = 1.05;
          utter.volume = 1;
          window.speechSynthesis.speak(utter);
        }
      } catch {}
    }, 1500);
  } catch {}
}

const STATUS_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  pending:     { label: "Awaiting Approval", cls: "bg-amber-100 text-amber-700 border-amber-200",   dot: "bg-amber-400" },
  confirmed:   { label: "Confirmed",         cls: "bg-blue-100 text-blue-700 border-blue-200",       dot: "bg-blue-500" },
  completed:   { label: "Completed",         cls: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  cancelled:   { label: "Cancelled",         cls: "bg-gray-100 text-gray-500 border-gray-200",       dot: "bg-gray-400" },
  rescheduled: { label: "Rescheduled",       cls: "bg-purple-100 text-purple-700 border-purple-200", dot: "bg-purple-500" },
};

// ── Join Popup ──────────────────────────────────────────────────
function JoinPopup({ apptId, onJoin, onClose }: {
  apptId: number;
  onJoin: (id: number) => void; onClose: () => void;
}) {
  function handleJoin() {
    onJoin(apptId); // handlePatientJoined already calls setJoinPopup(null)
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

        {/* ── Screen 1: Appeal ── */}
        {screen === "appeal" && (
          <>
            <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-colors z-10">
              <X size={18} />
            </button>
            <div className="bg-gradient-to-br from-[#1a3d2b] to-[#2a5a40] rounded-t-3xl px-6 pt-8 pb-6 text-center">
              <div className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center mx-auto mb-3">
                <Heart size={28} className="text-red-300" fill="currentColor" />
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
              <p className="text-sm text-gray-700 font-semibold">Your contribution — however small — will:</p>
              <ul className="space-y-2">
                {["Fund free treatment for those who cannot afford it", "Keep this service accessible to all", "Help Dr. Murali Krishna's mission reach more lives"].map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">{i + 1}</span>
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-center text-sm text-gray-500 font-medium">A little from you means everything to someone else. 🙏</p>
              <button onClick={() => setScreen("donate")}
                className="w-full py-4 bg-[#1a3d2b] text-white font-extrabold rounded-2xl text-base hover:bg-[#1a3d2b]/90 transition-colors shadow-lg">
                Yes, I want to donate ❤️
              </button>
              <button onClick={onClose} className="w-full py-2.5 text-gray-400 text-sm hover:text-gray-600 transition-colors">
                Maybe next time
              </button>
            </div>
          </>
        )}

        {/* ── Screen 2: Payment ── */}
        {screen === "donate" && (
          <>
            <button onClick={onClose} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors z-10">
              <X size={18} />
            </button>
            <div className="bg-gradient-to-br from-[#1a3d2b] to-[#2a5a40] rounded-t-3xl px-6 pt-7 pb-5 text-center">
              <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">Step 2 of 2</p>
              <h2 className="text-lg font-extrabold text-white">Scan &amp; Confirm Your Donation</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* QR */}
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

              {/* Patient ID instruction */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800">
                <p className="font-bold mb-1">📝 Important — In the UPI "Message / Note" field, please type:</p>
                <p className="font-black text-amber-900 text-base font-mono tracking-widest text-center py-1">
                  {patientCode || "Your Patient ID"}
                </p>
                <p className="text-xs text-amber-700 mt-1">This helps us match your payment and send a proper receipt.</p>
              </div>

              {/* Amount */}
              <div>
                <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">How much are you donating? (₹)</label>
                <input
                  type="number" min="1" placeholder="e.g. 500"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base font-semibold focus:outline-none focus:border-[#1a3d2b] focus:ring-2 focus:ring-[#1a3d2b]/20"
                />
              </div>

              {/* Last 6 digits */}
              <div>
                <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Transaction ID — Last 6 digits <span className="text-red-500">*</span></label>
                <input
                  type="text" maxLength={6} placeholder="e.g. 892341"
                  value={lastSix} onChange={e => setLastSix(e.target.value.replace(/\D/g, ""))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base font-mono font-semibold tracking-widest focus:outline-none focus:border-[#1a3d2b] focus:ring-2 focus:ring-[#1a3d2b]/20"
                />
                <p className="text-xs text-gray-400 mt-1">After payment, check the transaction receipt in your UPI app for the last 6 digits of the Transaction ID / UTR.</p>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm">
                  <AlertCircle size={14} className="shrink-0" /> {error}
                </div>
              )}

              <button onClick={handleDonate} disabled={submitting}
                className="w-full py-4 bg-[#1a3d2b] text-white font-extrabold rounded-2xl text-base hover:bg-[#1a3d2b]/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg">
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Heart size={16} fill="currentColor" />}
                {submitting ? "Recording donation…" : "I have donated ✓"}
              </button>
            </div>
          </>
        )}

        {/* ── Screen 3: Receipt ── */}
        {screen === "receipt" && (
          <div className="px-6 py-10 text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
              <Heart size={36} className="text-emerald-600" fill="currentColor" />
            </div>
            <h2 className="text-2xl font-extrabold text-[#1a3d2b] mb-3">Thank You! 🙏</h2>
            <p className="text-base text-gray-600 leading-relaxed mb-3">
              Your generosity has been recorded. Dr. Murali Krishna and the entire Susruta Hospital team are deeply grateful.
            </p>
            <p className="text-sm text-gray-500 leading-relaxed mb-2">
              A thank-you letter will be sent to your registered email once your donation is confirmed.
            </p>
            <div className="bg-gray-50 rounded-2xl border border-gray-100 px-5 py-4 text-left text-sm space-y-1.5 my-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Your Donation Summary</p>
              {patientCode && <p className="text-gray-700"><span className="font-semibold">Patient ID:</span> {patientCode}</p>}
              <p className="text-gray-700"><span className="font-semibold">Amount:</span> ₹{amount}</p>
              <p className="text-gray-700"><span className="font-semibold">Transaction (last 6):</span> xxxxxx{lastSix}</p>
              <p className="text-gray-700"><span className="font-semibold">Date:</span> {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
            </div>
            <p className="text-sm text-emerald-700 font-semibold italic mb-6">
              "May your good deed return to you as health, happiness, and abundance." 🌿
            </p>
            <button onClick={onClose}
              className="w-full py-3.5 bg-[#1a3d2b] text-white font-bold rounded-2xl text-sm hover:bg-[#1a3d2b]/90 transition-colors">
              Close
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Hero Next Appointment ────────────────────────────────────────
function HeroAppointment({ appt, type, videoCallApptId, onJoin, onCallEnded }: {
  appt: OnlineAppt | PhysicalAppt;
  type: "online" | "physical";
  videoCallApptId: number | null;
  onJoin: () => void;
  onCallEnded: () => void;
}) {
  const isOnline = type === "online";
  const onlineAppt = isOnline ? appt as OnlineAppt : null;
  const physicalAppt = !isOnline ? appt as PhysicalAppt : null;
  const date = isOnline ? onlineAppt!.slot.date : physicalAppt!.date;
  const timeIST = isOnline
    ? (() => {
        const s = dualSlotTime(date, onlineAppt!.slot.startTime);
        const e = dualSlotTime(date, onlineAppt!.slot.endTime);
        return { ist: `${s.ist} – ${e.ist} IST`, local: s.local ? `${s.local} – ${e.local} local` : null };
      })()
    : (() => {
        const r = dualOfflineTime(date, physicalAppt!.timeSlot);
        return { ist: r.display + " IST", local: r.local };
      })();
  const status = appt.status;
  const canJoin = isOnline && onlineAppt!.joinEnabled;
  const isInCall = canJoin && videoCallApptId === onlineAppt!.id;
  // Online bookings are always auto-confirmed — show "Booked" not "Awaiting Approval"
  const sm = (status === "pending" && isOnline)
    ? { label: "Booked", cls: "bg-blue-100 text-blue-700 border-blue-200", dot: "bg-blue-500" }
    : (STATUS_CONFIG[status] ?? STATUS_CONFIG.confirmed);

  return (
    <div className={cn(
      "rounded-3xl overflow-hidden border-2 shadow-md",
      canJoin ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-white"
    )}>
      {/* Coloured top strip */}
      <div className={cn("px-6 py-3 flex items-center gap-2", canJoin ? "bg-emerald-600" : isOnline ? "bg-blue-600" : "bg-[#1a3d2b]")}>
        {canJoin ? <Bell size={16} className="text-white animate-pulse" /> : isOnline ? <Video size={16} className="text-white" /> : <MapPin size={16} className="text-white" />}
        <span className="text-white text-sm font-bold">
          {canJoin ? "🟢 Doctor is Ready — Join Now!" : isOnline ? "Online Video Consultation" : "In-Person Visit"}
        </span>
      </div>

      <div className="px-6 pt-5 pb-6">
        {/* Date big */}
        <p className="text-3xl font-extrabold text-gray-900 leading-tight">
          {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <p className="text-lg text-gray-500 font-semibold mt-1">{timeIST.ist}</p>
        {timeIST.local && <p className="text-sm text-gray-400 mt-0.5">{timeIST.local}</p>}

        <div className="flex flex-wrap gap-2 mt-4">
          <span className={cn("text-sm font-bold px-3 py-1 rounded-full border", sm.cls)}>
            {sm.label}
          </span>
          {isOnline && (
            <span className="text-sm font-bold px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
              Video Consultation
            </span>
          )}
          {!isOnline && (
            <span className="text-sm font-bold px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-100">
              Clinic Visit
            </span>
          )}
        </div>

        {/* Action */}
        <div className="mt-5">
          {isInCall ? (
            <>
              <VideoCall apptId={onlineAppt!.id} role="patient" onCallEnded={onCallEnded} autoJoin />
              <CallDocumentUpload apptId={onlineAppt!.id} />
              <GuestLinkCard apptId={onlineAppt!.id} guestToken={onlineAppt!.guestToken} />
            </>
          ) : canJoin ? (
            <>
              <button onClick={onJoin}
                className="flex items-center justify-center gap-2 w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl text-lg transition-colors shadow-lg">
                <Video size={20} /> Join Video Call →
              </button>
              <GuestLinkCard apptId={onlineAppt!.id} guestToken={onlineAppt!.guestToken} />
            </>
          ) : isOnline && (status === "confirmed" || status === "pending") ? (
            <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
              <Clock size={18} className="text-blue-500 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-700 font-medium leading-snug">
                Your booking is confirmed. Keep this page open on the day — you will hear a chime when the doctor is ready.
              </p>
            </div>
          ) : !isOnline ? (
            <div className="flex items-start gap-3 bg-green-50 border border-green-100 rounded-2xl px-4 py-3">
              <MapPin size={18} className="text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-green-800 font-semibold">119, Ramulavari North Mada Street</p>
                <p className="text-sm text-green-700">Tirupati · Please arrive 10 minutes early</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Appointment Card (history list) ─────────────────────────────
function ApptCard({ item, videoCallApptId, onJoin, onCallEnded, onDocumentsChange }: {
  item: { type: "online" | "physical"; date: string; data: OnlineAppt | PhysicalAppt };
  videoCallApptId: number | null;
  onJoin: () => void;
  onCallEnded: () => void;
  onDocumentsChange?: (apptId: number, docs: any[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null);

  async function deleteDocument(apptId: number, objectPath: string) {
    setDeletingDoc(objectPath);
    try {
      const r = await fetch(`${BASE}/api/online-appointments/${apptId}/documents`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath }),
      });
      if (r.ok) {
        const { documents } = await r.json();
        onDocumentsChange?.(apptId, documents);
      }
    } catch {}
    setDeletingDoc(null);
  }
  const { type, data } = item;
  const isOnline = type === "online";
  const onlineAppt = isOnline ? data as OnlineAppt : null;
  const physicalAppt = !isOnline ? data as PhysicalAppt : null;
  const date = isOnline ? onlineAppt!.slot.date : physicalAppt!.date;
  const timeIST = isOnline
    ? (() => {
        const s = dualSlotTime(date, onlineAppt!.slot.startTime);
        const e = dualSlotTime(date, onlineAppt!.slot.endTime);
        return { ist: `${s.ist} – ${e.ist} IST`, local: s.local ? `${s.local} – ${e.local} local` : null };
      })()
    : (() => {
        const r = dualOfflineTime(date, physicalAppt!.timeSlot);
        return { ist: r.display + " IST", local: r.local };
      })();
  const status = data.status;
  const canJoin = isOnline && onlineAppt!.joinEnabled;
  const sm = (status === "pending" && isOnline)
    ? { label: "Booked", cls: "bg-blue-100 text-blue-700 border-blue-200", dot: "bg-blue-500" }
    : (STATUS_CONFIG[status] ?? STATUS_CONFIG.confirmed);
  const upcoming = isUpcoming(date, status);

  return (
    <div className={cn(
      "bg-white rounded-2xl border overflow-hidden transition-all",
      canJoin ? "border-emerald-400 ring-2 ring-emerald-100" : "border-gray-200"
    )}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors">
        {/* Icon */}
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
          canJoin ? "bg-emerald-100" : isOnline ? "bg-blue-50" : "bg-green-50"
        )}>
          {isOnline
            ? <Video size={20} className={canJoin ? "text-emerald-600" : "text-blue-500"} />
            : <MapPin size={20} className="text-green-600" />}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full border", sm.cls)}>{sm.label}</span>
            {canJoin && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-600 text-white animate-pulse">🟢 Live</span>}
          </div>
          <p className="font-bold text-base text-gray-900">{fmtDateShort(date)}</p>
          <p className="text-sm text-gray-500">{timeIST.ist} · {isOnline ? "Video Consultation" : "In-Person"}</p>
          {timeIST.local && <p className="text-xs text-gray-400">{timeIST.local}</p>}
        </div>

        {open ? <ChevronUp size={18} className="text-gray-400 shrink-0" /> : <ChevronDown size={18} className="text-gray-400 shrink-0" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="border-t border-gray-100 px-5 py-4 space-y-3 bg-gray-50">
              {canJoin && videoCallApptId === onlineAppt!.id ? (
                <>
                  <VideoCall apptId={onlineAppt!.id} role="patient" onCallEnded={onCallEnded} autoJoin />
                  <CallDocumentUpload apptId={onlineAppt!.id} />
                  <GuestLinkCard apptId={onlineAppt!.id} guestToken={onlineAppt!.guestToken} />
                </>
              ) : canJoin ? (
                <>
                  <button onClick={onJoin}
                    className="flex items-center justify-center gap-2 w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-base transition-colors">
                    <Video size={16} /> Join Video Call →
                  </button>
                  <GuestLinkCard apptId={onlineAppt!.id} guestToken={onlineAppt!.guestToken} />
                </>
              ) : null}
              {isOnline && upcoming && !canJoin && status === "confirmed" && (
                <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                  <Clock size={14} className="shrink-0" />
                  Keep this page open — you'll be notified when the doctor is ready.
                </div>
              )}
              {!isOnline && (
                <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                  <MapPin size={14} className="mt-0.5 shrink-0" />
                  <span>119, Ramulavari North Mada Street, Tirupati</span>
                </div>
              )}
              {(data as any).reason && (
                <p className="text-sm text-gray-600 bg-white border border-gray-100 rounded-xl px-4 py-3">
                  <span className="font-semibold text-gray-800">Reason: </span>{(data as any).reason}
                </p>
              )}
              {isOnline && (onlineAppt!.documents.length > 0) && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Your Documents</p>
                  <div className="flex flex-wrap gap-2">
                    {onlineAppt!.documents.map((d, i) => (
                      <div key={i} className="flex items-center gap-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <a href={`${BASE}/api/storage${d.objectPath}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-sm text-gray-700 px-3 py-2 font-medium hover:bg-blue-50 hover:text-blue-700 transition-colors">
                          <FileText size={13} className="shrink-0" />
                          <span className="max-w-[160px] truncate">{d.name}</span>
                        </a>
                        <button
                          onClick={() => deleteDocument(onlineAppt!.id, d.objectPath)}
                          disabled={deletingDoc === d.objectPath}
                          title="Delete this document"
                          className="px-2 py-2 text-gray-300 hover:text-red-500 hover:bg-red-50 border-l border-gray-200 transition-colors disabled:opacity-50 shrink-0"
                        >
                          {deletingDoc === d.objectPath
                            ? <Loader2 size={12} className="animate-spin" />
                            : <Trash2 size={12} />
                          }
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">Click the document name to view · trash icon to delete</p>
                </div>
              )}
              {isOnline && onlineAppt!.prescription?.photoObjectPath && (
                <div className="flex items-center justify-between bg-white border border-emerald-100 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <ImageIcon size={16} />
                    <span className="text-sm font-semibold">Prescription available</span>
                  </div>
                  <a href={`${BASE}/api/storage${onlineAppt!.prescription.photoObjectPath}`} target="_blank" rel="noopener noreferrer" download
                    className="text-sm bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-emerald-700 flex items-center gap-1 transition-colors">
                    <Download size={13} /> Download
                  </a>
                </div>
              )}
              {isOnline && onlineAppt!.prescription?.notes && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">Doctor's Notes</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{onlineAppt!.prescription.notes}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────
export default function PatientDashboard() {
  const [, nav] = useLocation();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [onlineAppts, setOnlineAppts] = useState<OnlineAppt[]>([]);
  const [physicalAppts, setPhysicalAppts] = useState<PhysicalAppt[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinPopup, setJoinPopup] = useState<{ apptId: number } | null>(null);
  const [donationPopup, setDonationPopup] = useState<{ apptId: number; qrObjectPath: string | null } | null>(null);
  const [videoCallApptId, setVideoCallApptId] = useState<number | null>(null);
  const [showBooking, setShowBooking] = useState(false);
  const [mainTab, setMainTab] = useState<"appointments" | "prescriptions" | "docs">("appointments");
  const [patientDocs, setPatientDocs] = useState<PatientDoc[]>([]);
  const [docsUploading, setDocsUploading] = useState(false);
  const [docsError, setDocsError] = useState("");
  const docFileRef = useRef<HTMLInputElement>(null);
  const docCamRef = useRef<HTMLInputElement>(null);
  const [verifyResending, setVerifyResending] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  const [mobileTab, setMobileTab] = useState<"home" | "appointments" | "prescriptions" | "docs">("home");
  const sseRef = useRef<EventSource | null>(null);
  const chimeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldChimeRef = useRef(false);
  const phonepeQrRef = useRef<string | null>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);

  function startChiming() {
    shouldChimeRef.current = true;
    if (chimeIntervalRef.current) clearInterval(chimeIntervalRef.current);
    chimeIntervalRef.current = setInterval(() => {
      if (shouldChimeRef.current) playChime();
    }, 15_000);
  }

  function stopChiming() {
    shouldChimeRef.current = false;
    if (chimeIntervalRef.current) {
      clearInterval(chimeIntervalRef.current);
      chimeIntervalRef.current = null;
    }
    try { window.speechSynthesis?.cancel(); } catch {}
  }

  function handlePatientJoined(apptId: number) {
    stopChiming();
    setVideoCallApptId(apptId);
    setJoinPopup(null);
    setMainTab("appointments");
    fetch(`${BASE}/api/online-appointments/${apptId}/patient-joined`, {
      method: "POST", credentials: "include",
    }).catch(() => {});
    // Scroll to the video call section (critical on mobile where it's below the sidebar)
    setTimeout(() => {
      mainContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  }

  function handleCallEnded(apptId: number) {
    setVideoCallApptId(null);
    // Immediately clear joinEnabled locally so the sidebar Live card disappears
    setOnlineAppts(prev => prev.map(a => a.id === apptId ? { ...a, joinEnabled: false } : a));
    setDonationPopup(prev => prev ?? { apptId, qrObjectPath: phonepeQrRef.current });
  }

  async function patientFetch(path: string, opts?: RequestInit) {
    const r = await fetch(`${BASE}/api/patient${path}`, { credentials: "include", ...opts });
    if (r.status === 401) { nav("/portal"); return null; }
    return r.json();
  }

  async function resendVerificationEmail() {
    setVerifyResending(true);
    try {
      await patientFetch("/auth/resend-verification", { method: "POST" });
      setVerifySent(true);
    } catch {}
    setVerifyResending(false);
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    const [me, myOnline, myPhysical, settings, myDocs] = await Promise.all([
      patientFetch("/me"),
      fetch(`${BASE}/api/online-appointments/mine`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
      patientFetch("/appointments"),
      fetch(`${BASE}/api/admin/settings`).then(r => r.ok ? r.json() : {}),
      fetch(`${BASE}/api/patient/documents`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
    ]);
    if (!me) return;
    setPatient(me);
    setOnlineAppts(myOnline ?? []);
    setPhysicalAppts(myPhysical ?? []);
    setPatientDocs(myDocs ?? []);
    phonepeQrRef.current = settings?.phonepeQrObjectPath ?? null;
    setLoading(false);
  }, []);

  async function uploadPatientDoc(file: File) {
    setDocsUploading(true); setDocsError("");
    try {
      // Camera photos on some Android devices report an empty type — fall back to JPEG
      const contentType = file.type || "image/jpeg";
      // Camera photos may lack a proper extension — append one based on content type
      let fileName = file.name || "document";
      if (!fileName.includes(".")) {
        const ext = contentType === "application/pdf" ? "pdf"
          : contentType.startsWith("image/png") ? "png"
          : "jpg";
        fileName = `${fileName}.${ext}`;
      }
      const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fileName, contentType, size: file.size }),
      });
      if (!urlRes.ok) throw new Error("Could not get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();
      const putRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
      if (!putRes.ok) throw new Error("File upload failed — please try again");
      const saveRes = await fetch(`${BASE}/api/patient/documents`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fileName, objectPath, contentType, size: file.size }),
      });
      if (!saveRes.ok) throw new Error("Could not save document");
      const doc = await saveRes.json();
      setPatientDocs(prev => [doc, ...prev]);
    } catch (e: any) { setDocsError(e.message || "Upload failed"); }
    finally { setDocsUploading(false); }
  }

  async function deletePatientDoc(id: number) {
    if (!confirm("Remove this document?")) return;
    const res = await fetch(`${BASE}/api/patient/documents/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) setPatientDocs(prev => prev.filter(d => d.id !== id));
  }

  useEffect(() => {
    const es = new EventSource(`${BASE}/api/patient/sse`, { withCredentials: true });
    sseRef.current = es;
    es.addEventListener("join_enabled", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      playChime();
      startChiming();
      setOnlineAppts(prev => prev.map(a =>
        a.id === data.apptId
          ? { ...a, joinEnabled: true, liveKitRoomName: data.roomName ?? a.liveKitRoomName, guestToken: data.guestToken ?? a.guestToken }
          : a
      ));
      setJoinPopup({ apptId: data.apptId });
    });
    es.addEventListener("session_ended", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      stopChiming();
      setOnlineAppts(prev => prev.map(a => a.id === data.apptId ? { ...a, joinEnabled: false, status: "completed" } : a));
      setJoinPopup(null);
      setDonationPopup({ apptId: data.apptId, qrObjectPath: data.qrObjectPath });
    });
    return () => { es.close(); stopChiming(); };
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function logout() {
    await fetch(`${BASE}/api/patient/logout`, { method: "POST", credentials: "include" });
    nav("/portal");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f7f5] flex items-center justify-center">
        <div className="text-center">
          <img src={logoImg} alt="Logo" className="h-12 mx-auto mb-4 opacity-60" />
          <div className="w-6 h-6 border-2 border-[#1a3d2b] border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  // Combine all appointments sorted: upcoming first, then past
  const allAppointments = [
    ...onlineAppts.map(a => ({ type: "online" as const, date: a.slot.date, data: a })),
    ...physicalAppts.map(a => ({ type: "physical" as const, date: a.date, data: a })),
  ].sort((a, b) => {
    const aUp = isUpcoming(a.date, a.data.status);
    const bUp = isUpcoming(b.date, b.data.status);
    if (aUp && !bUp) return -1;
    if (!aUp && bUp) return 1;
    return aUp ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
  });

  const nextUpcoming = allAppointments.find(a => isUpcoming(a.date, a.data.status));
  const upcomingCount = allAppointments.filter(a => isUpcoming(a.date, a.data.status)).length;
  const pastAppts = allAppointments.filter(a => !isUpcoming(a.date, a.data.status));
  const prescriptions = onlineAppts.filter(a => a.prescription?.photoObjectPath);
  const hasLiveAppt = onlineAppts.some(a => a.joinEnabled);
  const liveAppt = onlineAppts.find(a => a.joinEnabled);

  return (
    <div className="min-h-[100dvh] bg-[#f4f7f5] overflow-x-hidden">
      {/* Popups — shared between mobile & desktop */}
      <AnimatePresence>
        {joinPopup && <JoinPopup apptId={joinPopup.apptId} onJoin={handlePatientJoined} onClose={() => setJoinPopup(null)} />}
        {donationPopup && <DonationPopup qrObjectPath={donationPopup.qrObjectPath} apptId={donationPopup.apptId} patientCode={patient?.patientCode} onClose={() => setDonationPopup(null)} />}
        {showBooking && (
          <BookingWizard
            patient={patient}
            onClose={() => setShowBooking(false)}
            onSuccess={() => loadData()}
          />
        )}
      </AnimatePresence>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="bg-[#1a3d2b] sticky top-0 z-30 shadow-none sm:shadow-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center gap-3">
          <img src={logoImg} alt="Susruta Hospital" className="h-9 w-auto object-contain shrink-0 brightness-0 invert" />
          <div className="hidden sm:block h-5 w-px bg-white/20" />
          {/* flex-1 here fills the center on desktop; hidden on mobile so no gap */}
          <div className="hidden sm:block sm:flex-1 min-w-0">
            <p className="text-white/50 text-[10px] font-medium uppercase tracking-wider leading-none">Patient Portal</p>
            <p className="text-white font-bold text-sm truncate">{patient?.name}</p>
          </div>

          {/* Patient ID badge — only on desktop; sidebar card shows it on mobile */}
          {patient?.patientCode && (
            <div className="hidden sm:block ml-auto bg-white/15 border border-white/20 text-white px-3 py-1.5 rounded-xl text-center shrink-0">
              <p className="text-white/60 text-[9px] font-bold uppercase tracking-widest leading-none">Patient ID</p>
              <p className="font-black text-base leading-tight font-mono tracking-wide">{patient.patientCode}</p>
            </div>
          )}

          {/* Live indicator — desktop only; on mobile the sidebar card shows this */}
          {hasLiveAppt && (
            <div className="hidden sm:flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/30 rounded-lg px-2.5 py-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-300 text-xs font-bold">Live</span>
            </div>
          )}

          <button onClick={loadData} title="Refresh"
            className="ml-auto sm:ml-0 p-2.5 text-white/50 hover:text-white rounded-xl hover:bg-white/10 transition-colors shrink-0">
            <RefreshCw size={16} />
          </button>
          <button onClick={logout} title="Logout"
            className="flex items-center gap-1.5 px-3 py-2 text-white/60 hover:text-white border border-white/20 hover:border-white/40 rounded-xl hover:bg-white/10 transition-colors text-sm font-medium shrink-0">
            <LogOut size={15} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════
          MOBILE LAYOUT  (hidden on md+)
      ══════════════════════════════════════════════════════ */}
      {/* Fixed-height mobile shell — fills exactly the space below the sticky header */}
      <div className="md:hidden fixed left-0 right-0 bottom-0 flex flex-col overflow-hidden bg-[#f4f7f5]" style={{ top: "64px" }}>
        {/* Scrollable content — nav height is ~64px, pb ensures content isn't hidden */}
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-0 overscroll-contain">
          <AnimatePresence mode="wait">

            {/* ── Home tab ── */}
            {mobileTab === "home" && (
              <motion.div key="m-home" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">

                {/* Email verification banner */}
                {patient && !patient.emailVerified && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex flex-col gap-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-amber-900 font-semibold text-sm">Email not verified</p>
                        <p className="text-amber-700 text-xs mt-0.5">Check your inbox for the verification link.</p>
                      </div>
                    </div>
                    {verifySent ? (
                      <span className="text-xs font-semibold text-emerald-700">✓ Verification email sent!</span>
                    ) : (
                      <button onClick={resendVerificationEmail} disabled={verifyResending}
                        className="self-start flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded-xl px-3 py-1.5 disabled:opacity-60">
                        {verifyResending ? <RefreshCw size={11} className="animate-spin" /> : <Bell size={11} />}
                        Resend Verification
                      </button>
                    )}
                  </div>
                )}

                {/* Live alert — top priority */}
                {hasLiveAppt && liveAppt && (
                  <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
                    className="bg-emerald-600 rounded-3xl px-5 py-5 shadow-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                      <p className="text-white font-black text-lg">Doctor is Ready!</p>
                    </div>
                    <p className="text-emerald-100 text-sm mb-4 leading-snug">Dr. Murali Krishna is waiting for your video call right now.</p>
                    <button onClick={() => { handlePatientJoined(liveAppt.id); setMobileTab("appointments"); }}
                      className="flex items-center justify-center gap-2 w-full py-4 bg-white text-emerald-700 font-extrabold rounded-2xl text-base active:scale-95 transition-transform">
                      <Video size={20} /> Join Video Call →
                    </button>
                  </motion.div>
                )}

                {/* Patient card */}
                <div className="bg-[#1a3d2b] rounded-3xl px-5 py-5 shadow-md">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                      <User size={22} className="text-white/80" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white/50 text-xs font-medium">Hello!</p>
                      <p className="text-white font-bold text-lg leading-tight truncate">{patient?.name}</p>
                    </div>
                    <button onClick={loadData} className="p-2 text-white/40 hover:text-white rounded-xl active:bg-white/10">
                      <RefreshCw size={15} />
                    </button>
                  </div>

                  {patient?.patientCode && (
                    <div className="bg-white/12 border border-white/10 rounded-2xl px-4 py-4 mb-4">
                      <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-1">Your Patient ID</p>
                      <p className="text-white font-black text-4xl font-mono tracking-widest">{patient.patientCode}</p>
                      <p className="text-white/40 text-xs mt-1">Mention this when visiting the clinic</p>
                    </div>
                  )}

                  <button onClick={() => setShowBooking(true)}
                    className="w-full flex items-center justify-center gap-2 bg-white text-[#1a3d2b] font-bold text-base px-4 py-3.5 rounded-2xl active:bg-white/90 transition-colors shadow-sm">
                    <Calendar size={18} /> Book an Appointment
                  </button>
                </div>

                {/* Summary stats */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Upcoming", value: upcomingCount, color: "text-[#1a3d2b]" },
                    { label: "Total Visits", value: allAppointments.length, color: "text-gray-700" },
                    { label: "Prescriptions", value: prescriptions.length, color: "text-gray-700" },
                  ].map(s => (
                    <div key={s.label} className="bg-white rounded-2xl border border-gray-200 px-3 py-4 text-center shadow-sm">
                      <p className={cn("font-black text-2xl", s.color)}>{s.value}</p>
                      <p className="text-gray-500 text-[11px] font-medium mt-0.5 leading-tight">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Hospital info */}
                <div className="bg-white rounded-3xl px-5 py-4 border border-gray-200 shadow-sm">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Susruta Hospital</p>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 text-sm text-gray-600">
                      <MapPin size={15} className="text-[#1a3d2b] shrink-0 mt-0.5" />
                      <span>119, Ramulavari North Mada Street, Tirupati</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone size={15} className="text-[#1a3d2b] shrink-0" />
                      <span>Contact via booking</span>
                    </div>
                  </div>
                </div>

                {/* Donate button */}
                <button onClick={() => setDonationPopup({ apptId: 0, qrObjectPath: phonepeQrRef.current })}
                  className="w-full bg-gradient-to-br from-rose-50 to-red-50 border border-rose-200 rounded-3xl px-5 py-4 text-left active:from-rose-100 transition-all shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
                      <Heart size={18} className="text-red-500" fill="currentColor" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-gray-800">Support Dr. Murali Krishna</p>
                      <p className="text-xs text-gray-500 mt-0.5">Help extend free care to those in need</p>
                    </div>
                  </div>
                </button>

                {/* Logout */}
                <button onClick={logout}
                  className="w-full flex items-center justify-center gap-2 py-3 border border-gray-200 rounded-2xl text-sm font-medium text-gray-500 bg-white active:bg-gray-50 transition-colors">
                  <LogOut size={15} /> Sign Out
                </button>
              </motion.div>
            )}

            {/* ── Appointments tab ── */}
            {mobileTab === "appointments" && (
              <motion.div key="m-appts" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5" ref={mainContentRef}>
                {/* Live alert at top of appointments too */}
                {hasLiveAppt && liveAppt && (
                  <div className="bg-emerald-600 rounded-3xl px-4 py-4 shadow-md">
                    <div className="flex items-center gap-2 mb-2">
                      <Bell size={16} className="text-white animate-pulse" />
                      <p className="text-white font-black">Doctor is Ready!</p>
                    </div>
                    <button onClick={() => handlePatientJoined(liveAppt.id)}
                      className="flex items-center justify-center gap-2 w-full py-3.5 bg-white text-emerald-700 font-bold rounded-2xl text-base active:scale-95 transition-transform">
                      <Video size={18} /> Join Video Call →
                    </button>
                  </div>
                )}

                {nextUpcoming && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Calendar size={12} /> Your Next Appointment
                    </p>
                    <HeroAppointment
                      appt={nextUpcoming.data}
                      type={nextUpcoming.type}
                      videoCallApptId={videoCallApptId}
                      onJoin={() => { if (nextUpcoming.type === "online") handlePatientJoined((nextUpcoming.data as any).id); }}
                      onCallEnded={() => handleCallEnded((nextUpcoming.data as any).id)}
                    />
                  </div>
                )}

                {allAppointments.filter(a => isUpcoming(a.date, a.data.status)).length > 1 && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Clock size={12} /> Other Upcoming
                    </p>
                    <div className="space-y-3">
                      {allAppointments.filter(a => isUpcoming(a.date, a.data.status)).slice(1).map((item, i) => (
                        <ApptCard key={i} item={item} videoCallApptId={videoCallApptId}
                          onJoin={() => { if (item.type === "online") handlePatientJoined((item.data as any).id); }}
                          onCallEnded={() => handleCallEnded((item.data as any).id)}
                          onDocumentsChange={(apptId, docs) => setOnlineAppts(prev => prev.map(a => a.id === apptId ? { ...a, documents: docs } : a))} />
                      ))}
                    </div>
                  </div>
                )}

                {upcomingCount === 0 && (
                  <div className="bg-white rounded-3xl border border-gray-200 px-6 py-12 text-center shadow-sm">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                      <Calendar size={28} className="text-gray-300" />
                    </div>
                    <p className="text-lg font-bold text-gray-500 mb-1">No upcoming appointments</p>
                    <p className="text-sm text-gray-400 mb-5">Book a consultation with Dr. Murali Krishna</p>
                    <button onClick={() => setShowBooking(true)}
                      className="inline-flex items-center gap-2 bg-[#1a3d2b] text-white font-bold px-6 py-3 rounded-2xl text-base active:bg-[#1a3d2b]/90 transition-colors">
                      <Calendar size={16} /> Book an Appointment
                    </button>
                  </div>
                )}

                {pastAppts.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <CheckCircle2 size={12} /> Past Appointments
                    </p>
                    <div className="space-y-3">
                      {pastAppts.map((item, i) => (
                        <ApptCard key={i} item={item} videoCallApptId={videoCallApptId}
                          onJoin={() => { if (item.type === "online") handlePatientJoined((item.data as any).id); }}
                          onCallEnded={() => handleCallEnded((item.data as any).id)}
                          onDocumentsChange={(apptId, docs) => setOnlineAppts(prev => prev.map(a => a.id === apptId ? { ...a, documents: docs } : a))} />
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Prescriptions tab ── */}
            {mobileTab === "prescriptions" && (
              <motion.div key="m-rx" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {prescriptions.length === 0 ? (
                  <div className="bg-white rounded-3xl border border-gray-200 px-6 py-14 text-center shadow-sm">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                      <ImageIcon size={28} className="text-gray-300" />
                    </div>
                    <p className="text-lg font-bold text-gray-500 mb-1">No prescriptions yet</p>
                    <p className="text-sm text-gray-400">Prescriptions from your online consultations will appear here.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {prescriptions.map((appt, i) => (
                      <div key={i} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                        <img src={`${BASE}/api/storage${appt.prescription!.photoObjectPath}`} alt="Prescription"
                          className="w-full h-40 object-cover bg-gray-50" />
                        <div className="px-3 py-3">
                          <p className="text-xs font-semibold text-gray-700 truncate">{fmtDateShort(appt.slot.date)}</p>
                          {appt.prescription?.notes && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{appt.prescription.notes}</p>
                          )}
                          <a href={`${BASE}/api/storage${appt.prescription!.photoObjectPath}`}
                            download target="_blank" rel="noopener noreferrer"
                            className="mt-2 flex items-center gap-1 text-xs text-[#1a3d2b] font-bold">
                            <Download size={11} /> Download
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── My Docs tab ── */}
            {mobileTab === "docs" && (
              <motion.div key="m-docs" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className={cn("flex flex-col items-center justify-center gap-2 py-5 px-3 bg-[#1a3d2b] text-white rounded-2xl text-sm font-semibold cursor-pointer active:scale-95 transition-transform text-center", docsUploading && "opacity-60 pointer-events-none")}>
                    {docsUploading ? <Loader2 size={22} className="animate-spin" /> : <Camera size={22} />}
                    <span>Take Photo</span>
                    <input ref={docCamRef} type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) { uploadPatientDoc(f); e.target.value = ""; } }} />
                  </label>
                  <label className={cn("flex flex-col items-center justify-center gap-2 py-5 px-3 bg-white border-2 border-gray-200 text-gray-600 rounded-2xl text-sm font-semibold cursor-pointer active:scale-95 transition-transform text-center", docsUploading && "opacity-60 pointer-events-none")}>
                    <Upload size={22} />
                    <span>Upload File</span>
                    <input ref={docFileRef} type="file" accept="image/*,application/pdf" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) { uploadPatientDoc(f); e.target.value = ""; } }} />
                  </label>
                </div>
                {docsError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-red-700">
                    <AlertCircle size={14} /> {docsError}
                  </div>
                )}
                {patientDocs.length === 0 ? (
                  <div className="bg-white rounded-3xl border border-gray-200 px-6 py-14 text-center shadow-sm">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                      <FolderOpen size={28} className="text-gray-300" />
                    </div>
                    <p className="text-lg font-bold text-gray-500 mb-1">No documents yet</p>
                    <p className="text-sm text-gray-400">Upload your reports, lab results, or scans above.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {patientDocs.map((doc) => {
                      const isImg = doc.contentType.startsWith("image/");
                      const url = `${BASE}/api/storage${doc.objectPath}`;
                      return (
                        <div key={doc.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            {isImg
                              ? <img src={url} alt={doc.name} className="w-full h-32 object-cover bg-gray-50" />
                              : <div className="w-full h-32 bg-blue-50 flex items-center justify-center">
                                  <FileText size={32} className="text-blue-400" />
                                </div>
                            }
                          </a>
                          <div className="px-3 py-2.5">
                            <p className="text-xs font-semibold text-gray-700 truncate mb-0.5">{doc.name}</p>
                            {doc.createdAt && (
                              <p className="text-[10px] text-gray-400">
                                {new Date(doc.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <a href={url} download target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-[#1a3d2b] font-bold">
                                <Download size={11} /> Save
                              </a>
                              <button onClick={() => deletePatientDoc(doc.id)}
                                className="flex items-center gap-1 text-xs text-red-400 font-medium ml-auto">
                                <Trash2 size={11} /> Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* ── Mobile Bottom Navigation Bar ── */}
        <nav className="shrink-0 bg-white border-t border-gray-100 shadow-[0_-2px_12px_rgba(0,0,0,0.07)] flex" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          {([ 
            { id: "home",          label: "Home",         icon: User,      badge: 0 },
            { id: "appointments",  label: "Appointments", icon: Calendar,  badge: upcomingCount },
            { id: "prescriptions", label: "Prescriptions",icon: ImageIcon, badge: prescriptions.length },
            { id: "docs",          label: "My Docs",      icon: FolderOpen,badge: patientDocs.length },
          ] as const).map(tab => {
            const Icon = tab.icon;
            const active = mobileTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setMobileTab(tab.id as typeof mobileTab)}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 relative transition-colors">
                <div className="relative">
                  <Icon size={22} className={cn("transition-colors", active ? "text-[#1a3d2b]" : "text-gray-400")} />
                  {tab.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-emerald-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-1 leading-none">
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span className={cn("text-[10px] font-semibold transition-colors leading-tight", active ? "text-[#1a3d2b] font-bold" : "text-gray-400")}>
                  {tab.label}
                </span>
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#1a3d2b] rounded-full" />
                )}
              </button>
            );
          })}
        </nav>
      </div>
      {/* end MOBILE */}

      {/* ══════════════════════════════════════════════════════
          DESKTOP LAYOUT  (hidden on mobile, shown md+)
      ══════════════════════════════════════════════════════ */}
      <div className="hidden md:block">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-0 pb-6 sm:py-6 lg:py-8">
          <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-8 space-y-6 lg:space-y-0">

            {/* ── LEFT SIDEBAR ── */}
            <div className="space-y-4">
              <div className="bg-[#1a3d2b] rounded-b-3xl sm:rounded-3xl px-6 py-6 shadow-md">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-13 h-13 rounded-2xl bg-white/10 flex items-center justify-center shrink-0" style={{ width: 52, height: 52 }}>
                    <User size={24} className="text-white/80" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white/50 text-xs font-medium">Hello!</p>
                    <p className="text-white font-bold text-lg leading-tight truncate">{patient?.name}</p>
                  </div>
                </div>
                {patient?.patientCode && (
                  <div className="bg-white/12 border border-white/10 rounded-2xl px-4 py-4 mb-5">
                    <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-1">Your Patient ID</p>
                    <p className="text-white font-black text-3xl font-mono tracking-widest">{patient.patientCode}</p>
                    <p className="text-white/40 text-xs mt-1.5">Tell this number when visiting the clinic</p>
                  </div>
                )}
                <button onClick={() => setShowBooking(true)}
                  className="w-full flex items-center justify-center gap-2 bg-white text-[#1a3d2b] font-bold text-base px-4 py-3.5 rounded-2xl hover:bg-white/90 transition-colors shadow-sm">
                  <Calendar size={18} /> Book an Appointment
                </button>
              </div>

              {hasLiveAppt && liveAppt && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  className="bg-emerald-600 rounded-3xl px-5 py-5 shadow-md">
                  <div className="flex items-center gap-2 mb-3">
                    <Bell size={18} className="text-white animate-pulse" />
                    <p className="text-white font-black text-base">Doctor is Ready!</p>
                  </div>
                  <p className="text-emerald-100 text-sm mb-4">Dr. Murali Krishna is waiting for you right now.</p>
                  <button onClick={() => handlePatientJoined(liveAppt.id)}
                    className="flex items-center justify-center gap-2 w-full py-3.5 bg-white text-emerald-700 font-bold rounded-2xl text-base hover:bg-emerald-50 transition-colors">
                    <Video size={18} /> Join Video Call →
                  </button>
                </motion.div>
              )}

              <div className="bg-white rounded-3xl px-5 py-5 border border-gray-200 shadow-sm space-y-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Your Summary</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 font-medium">Upcoming</span>
                  <span className="font-black text-[#1a3d2b] text-lg">{upcomingCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 font-medium">Total Visits</span>
                  <span className="font-black text-gray-700 text-lg">{allAppointments.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 font-medium">Prescriptions</span>
                  <span className="font-black text-gray-700 text-lg">{prescriptions.length}</span>
                </div>
              </div>

              <div className="bg-white rounded-3xl px-5 py-5 border border-gray-200 shadow-sm">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Susruta Hospital</p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm text-gray-600">
                    <MapPin size={15} className="text-[#1a3d2b] shrink-0 mt-0.5" />
                    <span>119, Ramulavari North Mada Street, Tirupati</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone size={15} className="text-[#1a3d2b] shrink-0" />
                    <span>Contact via booking</span>
                  </div>
                </div>
              </div>

              <button onClick={() => setDonationPopup({ apptId: 0, qrObjectPath: phonepeQrRef.current })}
                className="w-full bg-gradient-to-br from-rose-50 to-red-50 border border-rose-200 rounded-3xl px-5 py-4 text-left hover:from-rose-100 hover:to-red-100 hover:border-rose-300 transition-all shadow-sm group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center shrink-0 group-hover:bg-red-200 transition-colors">
                    <Heart size={18} className="text-red-500" fill="currentColor" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-800">Support Dr. Murali Krishna</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-snug">Help extend free care to those in need</p>
                  </div>
                </div>
              </button>
            </div>

            {/* ── MAIN CONTENT ── */}
            <div ref={mainContentRef}>
              {patient && !patient.emailVerified && (
                <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-amber-900 font-semibold text-sm">Email not verified</p>
                      <p className="text-amber-700 text-xs mt-0.5">Please verify your email address to enable all features. Check your inbox for the verification link.</p>
                    </div>
                  </div>
                  {verifySent ? (
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 shrink-0">Email sent! Check your inbox.</span>
                  ) : (
                    <button onClick={resendVerificationEmail} disabled={verifyResending}
                      className="flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl px-3 py-2 transition-colors shrink-0 disabled:opacity-60">
                      {verifyResending ? <RefreshCw size={12} className="animate-spin" /> : <Bell size={12} />}
                      Resend Verification
                    </button>
                  )}
                </div>
              )}

              {/* Desktop tab bar */}
              <div className="flex gap-1 bg-white rounded-2xl border border-gray-200 p-1 shadow-sm mb-5">
                {([
                  { id: "appointments",  label: "My Appointments", icon: Calendar,   badge: upcomingCount },
                  { id: "prescriptions", label: "Prescriptions",   icon: ImageIcon,  badge: prescriptions.length },
                  { id: "docs",          label: "My Docs",         icon: FolderOpen, badge: patientDocs.length },
                ] as const).map(tab => {
                  const Icon = tab.icon;
                  const active = mainTab === tab.id;
                  return (
                    <button key={tab.id} onClick={() => setMainTab(tab.id as typeof mainTab)}
                      className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all",
                        active ? "bg-[#1a3d2b] text-white shadow-sm" : "text-gray-500 hover:text-gray-800")}>
                      <Icon size={15} /> {tab.label}
                      {tab.badge > 0 && (
                        <span className={cn("text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center",
                          active ? "bg-white/20 text-white" : "bg-[#1a3d2b]/10 text-[#1a3d2b]")}>{tab.badge}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <AnimatePresence mode="wait">
                {mainTab === "appointments" ? (
                  <motion.div key="appts" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-6">
                    {nextUpcoming && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <Calendar size={12} /> Your Next Appointment
                        </p>
                        <HeroAppointment appt={nextUpcoming.data} type={nextUpcoming.type} videoCallApptId={videoCallApptId}
                          onJoin={() => { if (nextUpcoming.type === "online") handlePatientJoined((nextUpcoming.data as any).id); }}
                          onCallEnded={() => handleCallEnded((nextUpcoming.data as any).id)} />
                      </div>
                    )}
                    {allAppointments.filter(a => isUpcoming(a.date, a.data.status)).length > 1 && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <Clock size={12} /> Other Upcoming
                        </p>
                        <div className="space-y-3">
                          {allAppointments.filter(a => isUpcoming(a.date, a.data.status)).slice(1).map((item, i) => (
                            <ApptCard key={i} item={item} videoCallApptId={videoCallApptId}
                              onJoin={() => { if (item.type === "online") handlePatientJoined((item.data as any).id); }}
                              onCallEnded={() => handleCallEnded((item.data as any).id)}
                              onDocumentsChange={(apptId, docs) => setOnlineAppts(prev => prev.map(a => a.id === apptId ? { ...a, documents: docs } : a))} />
                          ))}
                        </div>
                      </div>
                    )}
                    {upcomingCount === 0 && (
                      <div className="bg-white rounded-3xl border border-gray-200 px-6 py-10 text-center shadow-sm">
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                          <Calendar size={28} className="text-gray-300" />
                        </div>
                        <p className="text-lg font-bold text-gray-500 mb-1">No upcoming appointments</p>
                        <p className="text-sm text-gray-400 mb-5">Book an appointment with Dr. Murali Krishna</p>
                        <button onClick={() => setShowBooking(true)}
                          className="inline-flex items-center gap-2 bg-[#1a3d2b] text-white font-bold px-6 py-3 rounded-2xl text-base hover:bg-[#1a3d2b]/90 transition-colors">
                          <Calendar size={16} /> Book an Appointment
                        </button>
                      </div>
                    )}
                    {pastAppts.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <CheckCircle2 size={12} /> Past Appointments
                        </p>
                        <div className="space-y-3">
                          {pastAppts.map((item, i) => (
                            <ApptCard key={i} item={item} videoCallApptId={videoCallApptId}
                              onJoin={() => { if (item.type === "online") handlePatientJoined((item.data as any).id); }}
                              onCallEnded={() => handleCallEnded((item.data as any).id)}
                              onDocumentsChange={(apptId, docs) => setOnlineAppts(prev => prev.map(a => a.id === apptId ? { ...a, documents: docs } : a))} />
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ) : mainTab === "prescriptions" ? (
                  <motion.div key="rx" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                    {prescriptions.length === 0 ? (
                      <div className="bg-white rounded-3xl border border-gray-200 px-6 py-12 text-center shadow-sm">
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                          <ImageIcon size={28} className="text-gray-300" />
                        </div>
                        <p className="text-lg font-bold text-gray-500 mb-1">No prescriptions yet</p>
                        <p className="text-sm text-gray-400">Prescriptions from your online consultations will appear here.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {prescriptions.map((appt, i) => (
                          <div key={i} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                            <img src={`${BASE}/api/storage${appt.prescription!.photoObjectPath}`} alt="Prescription"
                              className="w-full h-36 object-cover bg-gray-50" />
                            <div className="px-3 py-3">
                              <p className="text-xs font-semibold text-gray-700 truncate">{fmtDateShort(appt.slot.date)}</p>
                              {appt.prescription?.notes && (
                                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{appt.prescription.notes}</p>
                              )}
                              <a href={`${BASE}/api/storage${appt.prescription!.photoObjectPath}`}
                                download target="_blank" rel="noopener noreferrer"
                                className="mt-2 flex items-center gap-1 text-xs text-[#1a3d2b] font-bold hover:underline">
                                <Download size={11} /> Download
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ) : mainTab === "docs" ? (
                  <motion.div key="docs" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                    <div className="grid grid-cols-2 gap-3 mb-5">
                      <label className={cn("flex flex-col items-center justify-center gap-2 py-4 px-3 bg-[#1a3d2b] text-white rounded-2xl text-sm font-semibold cursor-pointer hover:bg-[#1a3d2b]/90 transition-colors text-center active:scale-95", docsUploading && "opacity-60 pointer-events-none")}>
                        {docsUploading ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
                        <span>Take Photo</span>
                        <input ref={docCamRef} type="file" accept="image/*" capture="environment" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) { uploadPatientDoc(f); e.target.value = ""; } }} />
                      </label>
                      <label className={cn("flex flex-col items-center justify-center gap-2 py-4 px-3 bg-white border-2 border-gray-200 text-gray-600 rounded-2xl text-sm font-semibold cursor-pointer hover:border-[#1a3d2b]/30 hover:text-[#1a3d2b] transition-colors text-center active:scale-95", docsUploading && "opacity-60 pointer-events-none")}>
                        <Upload size={20} />
                        <span>Upload File</span>
                        <input ref={docFileRef} type="file" accept="image/*,application/pdf" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) { uploadPatientDoc(f); e.target.value = ""; } }} />
                      </label>
                    </div>
                    {docsError && (
                      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-red-700 mb-4">
                        <AlertCircle size={14} /> {docsError}
                      </div>
                    )}
                    {patientDocs.length === 0 ? (
                      <div className="bg-white rounded-3xl border border-gray-200 px-6 py-12 text-center shadow-sm">
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                          <FolderOpen size={28} className="text-gray-300" />
                        </div>
                        <p className="text-lg font-bold text-gray-500 mb-1">No documents yet</p>
                        <p className="text-sm text-gray-400">Upload your medical reports, lab results, or scans above.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {patientDocs.map((doc) => {
                          const isImg = doc.contentType.startsWith("image/");
                          const url = `${BASE}/api/storage${doc.objectPath}`;
                          return (
                            <div key={doc.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm group">
                              <a href={url} target="_blank" rel="noopener noreferrer">
                                {isImg
                                  ? <img src={url} alt={doc.name} className="w-full h-32 object-cover bg-gray-50" />
                                  : <div className="w-full h-32 bg-blue-50 flex items-center justify-center">
                                      <FileText size={36} className="text-blue-400" />
                                    </div>
                                }
                              </a>
                              <div className="px-3 py-2.5">
                                <p className="text-xs font-semibold text-gray-700 truncate mb-0.5">{doc.name}</p>
                                {doc.createdAt && (
                                  <p className="text-[10px] text-gray-400">
                                    {new Date(doc.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 mt-2">
                                  <a href={url} download target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs text-[#1a3d2b] font-bold hover:underline">
                                    <Download size={11} /> Download
                                  </a>
                                  <button onClick={() => deletePatientDoc(doc.id)}
                                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 font-medium ml-auto transition-colors">
                                    <Trash2 size={11} /> Remove
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
      {/* end DESKTOP */}

    </div>
  );
}
