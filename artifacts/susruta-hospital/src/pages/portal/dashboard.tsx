import React, { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Clock, LogOut, Video, FileText, User,
  RefreshCw, CheckCircle2, XCircle, MapPin,
  Download, Heart, QrCode, ChevronDown, ChevronUp, X, Plus,
  Stethoscope, AlertCircle, Phone
} from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";
import { cn } from "@/lib/utils";

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
  } catch {}
}

// Status configs
const ONLINE_STATUS: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Awaiting Approval", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  confirmed: { label: "Confirmed",         cls: "bg-blue-100 text-blue-700 border-blue-200" },
  completed: { label: "Completed",         cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled",         cls: "bg-gray-100 text-gray-500 border-gray-200" },
};
const PHYSICAL_STATUS: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Pending",   cls: "bg-amber-100 text-amber-700 border-amber-200" },
  confirmed: { label: "Confirmed", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", cls: "bg-gray-100 text-gray-500 border-gray-200" },
  rescheduled: { label: "Rescheduled", cls: "bg-purple-100 text-purple-700 border-purple-200" },
};

// ── Join Meeting Popup ──────────────────────────────────────────
function JoinPopup({ meetingLink, onClose }: { meetingLink: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
          <div className="w-14 h-14 rounded-full bg-emerald-200 flex items-center justify-center animate-pulse">
            <Video size={28} className="text-emerald-700" />
          </div>
        </div>
        <h2 className="text-2xl font-extrabold text-foreground mb-2">Doctor is Ready!</h2>
        <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
          Dr. P. Murali Krishna is waiting for you. Your consultation session has begun.
        </p>
        <a href={meetingLink} target="_blank" rel="noopener noreferrer" onClick={onClose}
          className="block w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl text-base transition-colors shadow-lg mb-3">
          Join Consultation Now →
        </a>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          I'll join in a moment
        </button>
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
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
          <X size={16} />
        </button>
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <Heart size={30} className="text-red-500" />
        </div>
        <h2 className="text-xl font-extrabold text-foreground mb-3">Thank You for Consulting with Us</h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-3">
          Dr. Murali Krishna offers online consultations <strong className="text-foreground">completely free of charge</strong> — his way of serving the community of Tirupati and beyond.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed mb-5">
          Your kind donation helps him continue treating underprivileged patients, running free health camps, and supporting countless causes in Tirupati. 🙏
        </p>
        {qrObjectPath ? (
          <>
            <div className="bg-gray-50 rounded-2xl p-4 border border-border mb-3 inline-block">
              <img src={`${BASE}/api/storage${qrObjectPath}`} alt="PhonePe UPI QR" className="w-44 h-44 object-contain mx-auto" />
            </div>
            <p className="text-xs text-muted-foreground mb-5">Scan with PhonePe, Google Pay, or any UPI app</p>
          </>
        ) : (
          <div className="bg-gray-50 rounded-2xl p-6 border border-border mb-5">
            <QrCode size={48} className="text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Payment QR will be available soon</p>
          </div>
        )}
        <button onClick={onClose}
          className="w-full py-3 bg-[#1a3d2b] text-white font-bold rounded-2xl text-sm hover:bg-[#1a3d2b]/90 transition-colors">
          Close
        </button>
      </motion.div>
    </div>
  );
}

// ── Online Appointment Card ─────────────────────────────────────
function OnlineApptCard({ appt, joinMeetingLink, onJoinClick }: {
  appt: OnlineAppt; joinMeetingLink: string | null; onJoinClick: () => void;
}) {
  const [open, setOpen] = useState(appt.joinEnabled);
  const sm = ONLINE_STATUS[appt.status] ?? ONLINE_STATUS.confirmed;
  const canJoin = appt.joinEnabled && !!joinMeetingLink;

  return (
    <div className={cn(
      "bg-white rounded-2xl border overflow-hidden transition-all shadow-sm",
      canJoin ? "border-emerald-400 ring-2 ring-emerald-200" : "border-border"
    )}>
      <button className="w-full flex items-center gap-3.5 px-4 py-4 text-left hover:bg-muted/20 transition-colors"
        onClick={() => setOpen(v => !v)}>
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
          canJoin ? "bg-emerald-100" : "bg-blue-50")}>
          <Video size={18} className={canJoin ? "text-emerald-600" : "text-blue-500"} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
              Online
            </span>
            <span className={cn("text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border", sm.cls)}>
              {sm.label}
            </span>
            {canJoin && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-600 text-white animate-pulse">
                🟢 Live — Join Now
              </span>
            )}
          </div>
          <p className="font-semibold text-sm text-foreground">{fmtDate(appt.slot.date)}</p>
          <p className="text-xs text-muted-foreground">
            {fmtTime(appt.slot.startTime)} – {fmtTime(appt.slot.endTime)}
            {appt.documents.length > 0 && ` · ${appt.documents.length} doc(s)`}
          </p>
        </div>
        {open ? <ChevronUp size={15} className="text-muted-foreground shrink-0" /> : <ChevronDown size={15} className="text-muted-foreground shrink-0" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
            className="overflow-hidden">
            <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
              {canJoin ? (
                <a href={joinMeetingLink!} target="_blank" rel="noopener noreferrer" onClick={onJoinClick}
                  className="flex items-center justify-center gap-2 w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-colors shadow-sm">
                  <Video size={15} /> Join Consultation Now →
                </a>
              ) : (appt.status === "confirmed" || appt.status === "pending") ? (
                <div className="flex items-center gap-2 w-full py-2.5 bg-gray-50 text-gray-400 font-medium rounded-xl text-xs justify-center border border-gray-100">
                  <Clock size={13} />
                  {appt.status === "pending" ? "Awaiting admin approval" : "Keep this page open — you'll be notified when the doctor is ready"}
                </div>
              ) : null}

              {appt.reason && (
                <p className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2.5">
                  <span className="font-semibold text-foreground">Reason: </span>{appt.reason}
                </p>
              )}

              {appt.documents.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Uploaded Documents</p>
                  <div className="flex flex-wrap gap-1.5">
                    {appt.documents.map((d, i) => (
                      <a key={i} href={`${BASE}/api/storage${d.objectPath}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs bg-blue-50 border border-blue-100 text-blue-700 rounded-lg px-2.5 py-1.5 font-medium hover:bg-blue-100 flex items-center gap-1.5 transition-colors">
                        <FileText size={10} /> {d.name}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {appt.prescription?.photoObjectPath && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <FileText size={14} />
                    <span className="text-xs font-semibold">Prescription available</span>
                  </div>
                  <a href={`${BASE}/api/storage${appt.prescription.photoObjectPath}`} target="_blank" rel="noopener noreferrer" download
                    className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-emerald-700 flex items-center gap-1 transition-colors">
                    <Download size={11} /> View
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Physical Appointment Card ───────────────────────────────────
function PhysicalApptCard({ appt }: { appt: PhysicalAppt }) {
  const [open, setOpen] = useState(false);
  const sm = PHYSICAL_STATUS[appt.status] ?? PHYSICAL_STATUS.pending;

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
      <button className="w-full flex items-center gap-3.5 px-4 py-4 text-left hover:bg-muted/20 transition-colors"
        onClick={() => setOpen(v => !v)}>
        <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
          <MapPin size={18} className="text-green-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">
              In-Person
            </span>
            <span className={cn("text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border", sm.cls)}>
              {sm.label}
            </span>
          </div>
          <p className="font-semibold text-sm text-foreground">{fmtDate(appt.date)}</p>
          <p className="text-xs text-muted-foreground">{appt.timeSlot}</p>
        </div>
        {open ? <ChevronUp size={15} className="text-muted-foreground shrink-0" /> : <ChevronDown size={15} className="text-muted-foreground shrink-0" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
            className="overflow-hidden">
            <div className="border-t border-border px-4 pb-4 pt-3 space-y-2.5">
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-xl px-3 py-2.5">
                <MapPin size={12} className="text-green-600 mt-0.5 shrink-0" />
                <span>119, Ramulavari North Mada Street, Tirupati</span>
              </div>
              {appt.reason && (
                <p className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2.5">
                  <span className="font-semibold text-foreground">Reason: </span>{appt.reason}
                </p>
              )}
              {appt.status === "confirmed" && (
                <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                  <Phone size={12} className="shrink-0" />
                  Please arrive 10 minutes before your scheduled time.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────
export default function PatientDashboard() {
  const [, nav] = useLocation();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [onlineAppts, setOnlineAppts] = useState<OnlineAppt[]>([]);
  const [physicalAppts, setPhysicalAppts] = useState<PhysicalAppt[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"appointments" | "prescriptions">("appointments");
  const [apptFilter, setApptFilter] = useState<"all" | "online" | "physical">("all");
  const [joinPopup, setJoinPopup] = useState<{ apptId: number; meetingLink: string } | null>(null);
  const [donationPopup, setDonationPopup] = useState<{ apptId: number; qrObjectPath: string | null } | null>(null);
  const [joinMeetingLink, setJoinMeetingLink] = useState<string | null>(null);
  const sseRef = useRef<EventSource | null>(null);

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

  // SSE — real-time join / session-end notifications
  useEffect(() => {
    const es = new EventSource(`${BASE}/api/patient/sse`, { withCredentials: true });
    sseRef.current = es;
    es.addEventListener("join_enabled", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      playChime();
      setOnlineAppts(prev => prev.map(a => a.id === data.apptId ? { ...a, joinEnabled: true } : a));
      setJoinMeetingLink(data.meetingLink);
      setJoinPopup({ apptId: data.apptId, meetingLink: data.meetingLink });
    });
    es.addEventListener("session_ended", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setOnlineAppts(prev => prev.map(a => a.id === data.apptId ? { ...a, joinEnabled: false, status: "completed" } : a));
      setJoinPopup(null);
      setDonationPopup({ apptId: data.apptId, qrObjectPath: data.qrObjectPath });
    });
    return () => es.close();
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
          <div className="w-5 h-5 border-2 border-[#1a3d2b] border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  const hasLiveAppt = onlineAppts.some(a => a.joinEnabled);
  const prescriptions = onlineAppts.filter(a => a.prescription?.photoObjectPath);

  // Combine and filter appointments
  const allAppointments = [
    ...onlineAppts.map(a => ({ type: "online" as const, date: a.slot.date, data: a })),
    ...physicalAppts.map(a => ({ type: "physical" as const, date: a.date, data: a })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const filteredAppts = apptFilter === "all" ? allAppointments
    : allAppointments.filter(a => a.type === apptFilter);

  return (
    <div className="min-h-screen bg-[#f4f7f5]">
      {/* Popups */}
      <AnimatePresence>
        {joinPopup && <JoinPopup meetingLink={joinPopup.meetingLink} onClose={() => setJoinPopup(null)} />}
        {donationPopup && <DonationPopup qrObjectPath={donationPopup.qrObjectPath} onClose={() => setDonationPopup(null)} />}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-white border-b border-border shadow-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src={logoImg} alt="Susruta Hospital" className="h-8 w-auto object-contain shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="hidden sm:block text-[10px] text-muted-foreground leading-none font-medium uppercase tracking-wide">Patient Portal</p>
            <p className="font-bold text-sm text-foreground truncate">{patient?.name}</p>
          </div>
          {patient?.patientCode && (
            <div className="bg-[#1a3d2b] text-white px-2.5 py-1.5 rounded-xl text-center shrink-0">
              <p className="text-[8px] font-bold uppercase tracking-widest opacity-60 leading-none hidden sm:block">Patient ID</p>
              <p className="font-black text-sm leading-tight font-mono">{patient.patientCode}</p>
            </div>
          )}
          {hasLiveAppt && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />}
          <button onClick={loadData}
            className="flex items-center gap-1.5 px-2.5 py-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted/40 transition-colors text-xs font-medium shrink-0"
            title="Refresh">
            <RefreshCw size={14} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button onClick={logout}
            className="flex items-center gap-1.5 px-2.5 py-2 text-muted-foreground hover:text-red-600 rounded-xl hover:bg-red-50 transition-colors text-xs font-medium border border-border shrink-0"
            title="Logout">
            <LogOut size={14} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-5">
        <div className="lg:grid lg:grid-cols-[300px_1fr] lg:gap-6 space-y-4 lg:space-y-0">

          {/* ── LEFT SIDEBAR (desktop) / TOP SECTION (mobile) ── */}
          <div className="space-y-4">
            {/* Welcome card */}
            <div className="bg-[#1a3d2b] rounded-2xl px-5 py-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                  <Stethoscope size={20} className="text-white/80" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white/60 text-xs font-medium">Welcome back</p>
                  <p className="text-white font-bold text-base truncate">{patient?.name}</p>
                </div>
              </div>
              {patient?.patientCode && (
                <div className="bg-white/10 rounded-xl px-4 py-3 mb-4">
                  <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mb-0.5">Your Patient ID</p>
                  <p className="text-white font-black text-2xl font-mono tracking-wider">{patient.patientCode}</p>
                  <p className="text-white/50 text-[10px] mt-0.5">Mention this ID when visiting in person</p>
                </div>
              )}
              <button
                onClick={() => nav("/portal/book")}
                className="w-full flex items-center justify-center gap-1.5 bg-white text-[#1a3d2b] font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-white/90 transition-colors shadow-sm">
                <Plus size={14} /> Book Appointment
              </button>
            </div>

            {/* Live session alert */}
            {hasLiveAppt && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-emerald-600 rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3">
                  <Video size={18} className="text-white animate-pulse shrink-0" />
                  <div>
                    <p className="text-white font-bold text-sm">Doctor is ready!</p>
                    <p className="text-white/80 text-xs">Join your consultation now</p>
                  </div>
                </div>
                {joinMeetingLink && (
                  <a href={joinMeetingLink} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 bg-white text-emerald-700 font-extrabold text-xs px-3 py-2 rounded-xl hover:bg-white/90 transition-colors">
                    Join →
                  </a>
                )}
              </motion.div>
            )}

            {/* Info note (desktop only) */}
            <p className="hidden lg:block text-xs text-muted-foreground text-center">
              Keep this portal open during your appointment — you'll be notified when the doctor is ready.
            </p>
          </div>

          {/* ── RIGHT MAIN CONTENT ── */}
          <div className="space-y-4">
            {/* Tab bar */}
            <div className="flex gap-1.5 bg-white rounded-2xl p-1.5 border border-border shadow-sm">
              {[
                { key: "appointments", label: "My Appointments", icon: <Calendar size={13} /> },
                { key: "prescriptions", label: "Prescriptions", icon: <FileText size={13} /> },
              ].map(t => (
                <button key={t.key}
                  onClick={() => setTab(t.key as any)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all",
                    tab === t.key
                      ? "bg-[#1a3d2b] text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  )}>
                  {t.icon}
                  {t.label}
                  {t.key === "appointments" && hasLiveAppt && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </button>
              ))}
            </div>

            {/* ── Appointments Tab ── */}
            {tab === "appointments" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {(["all", "online", "physical"] as const).map(f => (
                      <button key={f} onClick={() => setApptFilter(f)}
                        className={cn(
                          "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all",
                          apptFilter === f
                            ? "bg-foreground text-white border-foreground"
                            : "bg-white text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
                        )}>
                        {f === "all" ? "All" : f === "online" ? "Online" : "In-Person"}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => nav("/portal/book")}
                    className="flex items-center gap-1 text-xs font-semibold text-[#1a3d2b] hover:underline">
                    <Plus size={12} /> New
                  </button>
                </div>

                {filteredAppts.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-border p-8 text-center">
                    <Calendar size={36} className="text-muted-foreground/20 mx-auto mb-3" />
                    <p className="font-semibold text-foreground text-sm mb-1">No appointments yet</p>
                    <p className="text-xs text-muted-foreground mb-4">Book your first appointment with Dr. P. Murali Krishna</p>
                    <button onClick={() => nav("/portal/book")}
                      className="text-sm bg-[#1a3d2b] text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-[#1a3d2b]/90 transition-colors">
                      Book Appointment
                    </button>
                  </div>
                ) : (
                  filteredAppts.map((item) => (
                    item.type === "online" ? (
                      <OnlineApptCard
                        key={`online-${(item.data as OnlineAppt).id}`}
                        appt={item.data as OnlineAppt}
                        joinMeetingLink={joinMeetingLink}
                        onJoinClick={() => setJoinPopup(null)}
                      />
                    ) : (
                      <PhysicalApptCard
                        key={`physical-${(item.data as PhysicalAppt).id}`}
                        appt={item.data as PhysicalAppt}
                      />
                    )
                  ))
                )}
              </div>
            )}

            {/* ── Prescriptions Tab ── */}
            {tab === "prescriptions" && (
              <div className="space-y-4">
                {prescriptions.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-border p-8 text-center">
                    <FileText size={36} className="text-muted-foreground/20 mx-auto mb-3" />
                    <p className="font-semibold text-foreground text-sm mb-1">No prescriptions yet</p>
                    <p className="text-xs text-muted-foreground">After your online consultation, the doctor will upload your prescription here.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {prescriptions.map(appt => (
                      <div key={appt.id} className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
                          <div>
                            <p className="font-bold text-sm text-foreground">{fmtDate(appt.slot.date)}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{fmtTime(appt.slot.startTime)} – {fmtTime(appt.slot.endTime)}</p>
                          </div>
                          <a href={`${BASE}/api/storage${appt.prescription!.photoObjectPath}`}
                            target="_blank" rel="noopener noreferrer" download
                            className="flex items-center gap-1.5 text-xs bg-[#1a3d2b] text-white font-semibold px-3.5 py-2 rounded-xl hover:bg-[#1a3d2b]/90 shrink-0 transition-colors">
                            <Download size={12} /> Download
                          </a>
                        </div>
                        {appt.prescription?.notes && (
                          <div className="px-4 pt-3">
                            <p className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2.5">
                              <span className="font-semibold text-foreground">Note: </span>{appt.prescription.notes}
                            </p>
                          </div>
                        )}
                        <div className="p-4">
                          <img src={`${BASE}/api/storage${appt.prescription!.photoObjectPath}`}
                            alt="Prescription" className="w-full max-h-[380px] object-contain rounded-xl border border-border bg-gray-50" />
                          <p className="text-[11px] text-muted-foreground mt-2 text-right">
                            Issued {new Date(appt.prescription!.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="lg:hidden text-center text-xs text-muted-foreground pb-4">
              Keep this portal open during your appointment — you'll be notified when the doctor is ready.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
