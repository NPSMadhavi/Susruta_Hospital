import React, { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Clock, LogOut, Video, FileText, User,
  RefreshCw, CheckCircle2, XCircle, MapPin,
  Download, Heart, QrCode, X, Plus,
  Stethoscope, AlertCircle, Phone, ChevronDown, ChevronUp,
  Bell, ImageIcon
} from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";
import { cn } from "@/lib/utils";
import { BookingWizard } from "./BookingWizard";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ───────────────────────────────────────────────────────
type DocFile = { name: string; objectPath: string; contentType: string; size: number };
type OnlineAppt = {
  id: number; status: string; reason?: string; createdAt: string;
  joinEnabled: boolean; joinEnabledAt: string | null;
  documents: DocFile[];
  slot: { id: number; date: string; startTime: string; endTime: string };
  prescription: { photoObjectPath: string | null; notes: string | null; updatedAt: string } | null;
};
type PhysicalAppt = {
  id: number; date: string; timeSlot: string; status: string;
  reason?: string; followUpStatus?: string; patientName: string; patientPhone?: string;
};
type Patient = { id: number; patientCode: string | null; name: string; email: string; phone?: string };

// ── Helpers ─────────────────────────────────────────────────────
function fmtTime(t: string) {
  if (!t) return t;
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function fmtDateShort(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function isUpcoming(date: string, status: string) {
  const today = new Date().toISOString().slice(0, 10);
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
function JoinPopup({ apptId, meetingLink, onJoin, onClose }: {
  apptId: number; meetingLink: string;
  onJoin: (id: number) => void; onClose: () => void;
}) {
  function handleJoin() {
    onJoin(apptId);
    onClose();
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
        <a href={meetingLink} target="_blank" rel="noopener noreferrer" onClick={handleJoin}
          className="block w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl text-base transition-colors shadow-lg">
          Join Consultation Now →
        </a>
      </motion.div>
    </div>
  );
}

// ── Donation Popup ──────────────────────────────────────────────
function DonationPopup({ qrObjectPath, onClose }: { qrObjectPath: string | null; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
          <X size={18} />
        </button>
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <Heart size={30} className="text-red-500" />
        </div>
        <h2 className="text-xl font-extrabold text-gray-900 mb-3">Thank You for Consulting with Us</h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-3">
          Dr. Murali Krishna offers online consultations <strong className="text-gray-800">completely free of charge</strong> — his way of serving the community of Tirupati and beyond.
        </p>
        <p className="text-sm text-gray-500 leading-relaxed mb-5">
          Your kind donation helps him continue treating underprivileged patients, running free health camps, and supporting countless causes in Tirupati. 🙏
        </p>
        {qrObjectPath ? (
          <>
            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 mb-3 inline-block">
              <img src={`${BASE}/api/storage${qrObjectPath}`} alt="PhonePe UPI QR" className="w-44 h-44 object-contain mx-auto" />
            </div>
            <p className="text-xs text-gray-400 mb-5">Scan with PhonePe, Google Pay, or any UPI app</p>
          </>
        ) : (
          <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 mb-5">
            <QrCode size={48} className="text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-400">Payment QR will be available soon</p>
          </div>
        )}
        <button onClick={onClose}
          className="w-full py-3.5 bg-[#1a3d2b] text-white font-bold rounded-2xl text-sm hover:bg-[#1a3d2b]/90 transition-colors">
          Close
        </button>
      </motion.div>
    </div>
  );
}

// ── Hero Next Appointment ────────────────────────────────────────
function HeroAppointment({ appt, type, joinMeetingLink, onJoin }: {
  appt: OnlineAppt | PhysicalAppt;
  type: "online" | "physical";
  joinMeetingLink: string | null;
  onJoin: () => void;
}) {
  const isOnline = type === "online";
  const onlineAppt = isOnline ? appt as OnlineAppt : null;
  const physicalAppt = !isOnline ? appt as PhysicalAppt : null;
  const date = isOnline ? onlineAppt!.slot.date : physicalAppt!.date;
  const time = isOnline
    ? `${fmtTime(onlineAppt!.slot.startTime)} – ${fmtTime(onlineAppt!.slot.endTime)}`
    : physicalAppt!.timeSlot;
  const status = appt.status;
  const canJoin = isOnline && onlineAppt!.joinEnabled && !!joinMeetingLink;
  const sm = STATUS_CONFIG[status] ?? STATUS_CONFIG.confirmed;

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
        <p className="text-lg text-gray-500 font-semibold mt-1">{time}</p>

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
          {canJoin ? (
            <a href={joinMeetingLink!} target="_blank" rel="noopener noreferrer" onClick={onJoin}
              className="flex items-center justify-center gap-2 w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl text-lg transition-colors shadow-lg">
              <Video size={20} /> Join Consultation Now →
            </a>
          ) : isOnline && status === "confirmed" ? (
            <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
              <Clock size={18} className="text-blue-500 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-700 font-medium leading-snug">
                Keep this page open. You will hear a chime and see a pop-up when the doctor is ready to see you.
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
function ApptCard({ item, joinMeetingLink, onJoin }: {
  item: { type: "online" | "physical"; date: string; data: OnlineAppt | PhysicalAppt };
  joinMeetingLink: string | null;
  onJoin: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { type, data } = item;
  const isOnline = type === "online";
  const onlineAppt = isOnline ? data as OnlineAppt : null;
  const physicalAppt = !isOnline ? data as PhysicalAppt : null;
  const date = isOnline ? onlineAppt!.slot.date : physicalAppt!.date;
  const time = isOnline
    ? `${fmtTime(onlineAppt!.slot.startTime)} – ${fmtTime(onlineAppt!.slot.endTime)}`
    : physicalAppt!.timeSlot;
  const status = data.status;
  const sm = STATUS_CONFIG[status] ?? STATUS_CONFIG.confirmed;
  const canJoin = isOnline && onlineAppt!.joinEnabled && !!joinMeetingLink;
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
          <p className="text-sm text-gray-500">{time} · {isOnline ? "Video Consultation" : "In-Person"}</p>
        </div>

        {open ? <ChevronUp size={18} className="text-gray-400 shrink-0" /> : <ChevronDown size={18} className="text-gray-400 shrink-0" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="border-t border-gray-100 px-5 py-4 space-y-3 bg-gray-50">
              {canJoin && (
                <a href={joinMeetingLink!} target="_blank" rel="noopener noreferrer" onClick={onJoin}
                  className="flex items-center justify-center gap-2 w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-base transition-colors">
                  <Video size={16} /> Join Consultation Now →
                </a>
              )}
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
                      <a key={i} href={`${BASE}/api/storage${d.objectPath}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm bg-white border border-gray-200 text-gray-700 rounded-xl px-3 py-2 font-medium hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors">
                        <FileText size={13} /> {d.name}
                      </a>
                    ))}
                  </div>
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
  const [joinPopup, setJoinPopup] = useState<{ apptId: number; meetingLink: string } | null>(null);
  const [donationPopup, setDonationPopup] = useState<{ apptId: number; qrObjectPath: string | null } | null>(null);
  const [joinMeetingLink, setJoinMeetingLink] = useState<string | null>(null);
  const [showBooking, setShowBooking] = useState(false);
  const sseRef = useRef<EventSource | null>(null);
  const chimeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startChiming() {
    if (chimeIntervalRef.current) return;
    chimeIntervalRef.current = setInterval(() => playChime(), 15_000);
  }

  function stopChiming() {
    if (chimeIntervalRef.current) {
      clearInterval(chimeIntervalRef.current);
      chimeIntervalRef.current = null;
    }
    try { window.speechSynthesis?.cancel(); } catch {}
  }

  function handlePatientJoined(apptId: number) {
    stopChiming();
    fetch(`${BASE}/api/online-appointments/${apptId}/patient-joined`, {
      method: "POST", credentials: "include",
    }).catch(() => {});
  }

  async function patientFetch(path: string) {
    const r = await fetch(`${BASE}/api/patient${path}`, { credentials: "include" });
    if (r.status === 401) { nav("/portal"); return null; }
    return r.json();
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    const [me, myOnline, myPhysical, settings] = await Promise.all([
      patientFetch("/me"),
      fetch(`${BASE}/api/online-appointments/mine`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
      patientFetch("/appointments"),
      fetch(`${BASE}/api/admin/settings`).then(r => r.ok ? r.json() : {}),
    ]);
    if (!me) return;
    setPatient(me);
    setOnlineAppts(myOnline ?? []);
    setPhysicalAppts(myPhysical ?? []);
    setJoinMeetingLink((settings as any)?.meetingLink ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const es = new EventSource(`${BASE}/api/patient/sse`, { withCredentials: true });
    sseRef.current = es;
    es.addEventListener("join_enabled", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      playChime();
      startChiming();
      setOnlineAppts(prev => prev.map(a => a.id === data.apptId ? { ...a, joinEnabled: true } : a));
      setJoinMeetingLink(data.meetingLink);
      setJoinPopup({ apptId: data.apptId, meetingLink: data.meetingLink });
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
    <div className="min-h-screen bg-[#f4f7f5]">
      {/* Popups */}
      <AnimatePresence>
        {joinPopup && <JoinPopup apptId={joinPopup.apptId} meetingLink={joinPopup.meetingLink} onJoin={handlePatientJoined} onClose={() => setJoinPopup(null)} />}
        {donationPopup && <DonationPopup qrObjectPath={donationPopup.qrObjectPath} onClose={() => setDonationPopup(null)} />}
        {showBooking && (
          <BookingWizard
            patient={patient}
            onClose={() => setShowBooking(false)}
            onSuccess={() => loadData()}
          />
        )}
      </AnimatePresence>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="bg-[#1a3d2b] sticky top-0 z-30 shadow-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center gap-3">
          <img src={logoImg} alt="Susruta Hospital" className="h-9 w-auto object-contain shrink-0 brightness-0 invert" />
          <div className="hidden sm:block h-5 w-px bg-white/20" />
          <div className="hidden sm:block flex-1 min-w-0">
            <p className="text-white/50 text-[10px] font-medium uppercase tracking-wider leading-none">Patient Portal</p>
            <p className="text-white font-bold text-sm truncate">{patient?.name}</p>
          </div>
          <div className="flex-1 sm:flex-none" />

          {/* Patient ID badge */}
          {patient?.patientCode && (
            <div className="bg-white/15 border border-white/20 text-white px-3 py-1.5 rounded-xl text-center shrink-0">
              <p className="text-white/60 text-[9px] font-bold uppercase tracking-widest leading-none hidden sm:block">Patient ID</p>
              <p className="font-black text-base leading-tight font-mono tracking-wide">{patient.patientCode}</p>
            </div>
          )}

          {/* Live indicator */}
          {hasLiveAppt && (
            <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/30 rounded-lg px-2.5 py-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-300 text-xs font-bold hidden sm:inline">Live</span>
            </div>
          )}

          <button onClick={loadData} title="Refresh"
            className="p-2.5 text-white/50 hover:text-white rounded-xl hover:bg-white/10 transition-colors shrink-0">
            <RefreshCw size={16} />
          </button>
          <button onClick={logout} title="Logout"
            className="flex items-center gap-1.5 px-3 py-2 text-white/60 hover:text-white border border-white/20 hover:border-white/40 rounded-xl hover:bg-white/10 transition-colors text-sm font-medium shrink-0">
            <LogOut size={15} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 lg:py-8">
        <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-8 space-y-6 lg:space-y-0">

          {/* ── LEFT SIDEBAR ──────────────────────────────────── */}
          <div className="space-y-4">
            {/* Welcome + Patient ID */}
            <div className="bg-[#1a3d2b] rounded-3xl px-6 py-6 shadow-md">
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

            {/* Live alert */}
            {hasLiveAppt && liveAppt && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-emerald-600 rounded-3xl px-5 py-5 shadow-md">
                <div className="flex items-center gap-2 mb-3">
                  <Bell size={18} className="text-white animate-pulse" />
                  <p className="text-white font-black text-base">Doctor is Ready!</p>
                </div>
                <p className="text-emerald-100 text-sm mb-4">Dr. Murali Krishna is waiting for you right now.</p>
                {joinMeetingLink && (
                  <a href={joinMeetingLink} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3.5 bg-white text-emerald-700 font-bold rounded-2xl text-base hover:bg-emerald-50 transition-colors">
                    <Video size={18} /> Join Now →
                  </a>
                )}
              </motion.div>
            )}

            {/* Quick info */}
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

            {/* Hospital info */}
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
          </div>

          {/* ── MAIN CONTENT ───────────────────────────────────── */}
          <div className="space-y-6">

            {/* Next appointment hero */}
            {nextUpcoming && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Calendar size={12} /> Your Next Appointment
                </p>
                <HeroAppointment
                  appt={nextUpcoming.data}
                  type={nextUpcoming.type}
                  joinMeetingLink={joinMeetingLink}
                  onJoin={() => {}}
                />
              </div>
            )}

            {/* Upcoming appointments */}
            {allAppointments.filter(a => isUpcoming(a.date, a.data.status)).length > 1 && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Clock size={12} /> Other Upcoming Appointments
                </p>
                <div className="space-y-3">
                  {allAppointments.filter(a => isUpcoming(a.date, a.data.status)).slice(1).map((item, i) => (
                    <ApptCard key={i} item={item} joinMeetingLink={joinMeetingLink} onJoin={() => {}} />
                  ))}
                </div>
              </div>
            )}

            {/* No upcoming */}
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

            {/* Prescriptions */}
            {prescriptions.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <ImageIcon size={12} /> Your Prescriptions
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                  {prescriptions.map((appt, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                      <img
                        src={`${BASE}/api/storage${appt.prescription!.photoObjectPath}`}
                        alt="Prescription"
                        className="w-full h-32 object-cover bg-gray-50"
                      />
                      <div className="px-3 py-2.5">
                        <p className="text-xs font-semibold text-gray-700 truncate">{fmtDateShort(appt.slot.date)}</p>
                        <a href={`${BASE}/api/storage${appt.prescription!.photoObjectPath}`} download target="_blank" rel="noopener noreferrer"
                          className="mt-1.5 flex items-center gap-1 text-xs text-[#1a3d2b] font-bold hover:underline">
                          <Download size={11} /> Download
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Past appointments */}
            {pastAppts.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <CheckCircle2 size={12} /> Past Appointments
                </p>
                <div className="space-y-3">
                  {pastAppts.map((item, i) => (
                    <ApptCard key={i} item={item} joinMeetingLink={joinMeetingLink} onJoin={() => {}} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
