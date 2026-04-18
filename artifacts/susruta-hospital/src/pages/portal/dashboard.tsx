import React, { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Clock, LogOut, Video, FileText, User,
  RefreshCw, AlertCircle, CheckCircle2, XCircle,
  Download, Heart, QrCode, ChevronDown, ChevronUp, X
} from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type DocFile = { name: string; objectPath: string; contentType: string; size: number };
type OnlineAppt = {
  id: number; status: string; reason?: string; createdAt: string;
  joinEnabled: boolean; joinEnabledAt: string | null;
  documents: DocFile[];
  slot: { id: number; date: string; startTime: string; endTime: string };
  prescription: { photoObjectPath: string | null; notes: string | null; updatedAt: string } | null;
};
type Patient = { id: number; patientCode: string | null; name: string; email: string; phone?: string };

function fmtTime(t: string) {
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

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending:   { label: "Awaiting Approval", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  confirmed: { label: "Confirmed",         color: "bg-blue-100 text-blue-700 border-blue-200" },
  completed: { label: "Completed",         color: "bg-green-100 text-green-700 border-green-200" },
  cancelled: { label: "Cancelled",         color: "bg-gray-100 text-gray-500 border-gray-200" },
};

// ── Join Meeting Popup ─────────────────────────────────────────
function JoinPopup({ meetingLink, onClose }: { meetingLink: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center relative"
      >
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5 animate-pulse">
          <Video size={36} className="text-green-600" />
        </div>
        <h2 className="text-2xl font-extrabold text-[#1a3d2b] mb-2">Doctor is Ready!</h2>
        <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
          Dr. P. Murali Krishna is waiting for you. Please join the consultation now — your session has begun.
        </p>
        <a
          href={meetingLink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className="block w-full py-3.5 bg-green-600 hover:bg-green-700 text-white font-extrabold rounded-2xl text-base transition-colors shadow-lg mb-3"
        >
          Join Consultation Now →
        </a>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          I'll join in a moment
        </button>
      </motion.div>
    </div>
  );
}

// ── Donation Popup ─────────────────────────────────────────────
function DonationPopup({ qrObjectPath, onClose }: { qrObjectPath: string | null; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X size={18} />
        </button>
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <Heart size={30} className="text-red-500" />
        </div>
        <h2 className="text-xl font-extrabold text-[#1a3d2b] mb-3">Thank You for Consulting with Us</h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          Dr. Murali Krishna offers these online consultations <strong className="text-foreground">completely free of charge</strong> — his way of serving the community of Tirupati and beyond.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          Your kind donation, no matter how small, helps him continue treating underprivileged patients, running free health camps, and supporting countless good causes in Tirupati. 🙏
        </p>
        {qrObjectPath ? (
          <>
            <div className="bg-gray-50 rounded-2xl p-4 border border-border mb-4 inline-block mx-auto">
              <img
                src={`${BASE}/api/storage${qrObjectPath}`}
                alt="PhonePe UPI QR"
                className="w-40 h-40 object-contain mx-auto"
              />
            </div>
            <p className="text-xs text-muted-foreground mb-5">Scan with PhonePe, Google Pay, or any UPI app</p>
          </>
        ) : (
          <div className="bg-gray-50 rounded-2xl p-6 border border-border mb-5">
            <QrCode size={48} className="text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Payment QR will be set up soon</p>
          </div>
        )}
        <button
          onClick={onClose}
          className="w-full py-3 bg-[#1a3d2b] text-white font-bold rounded-2xl text-sm transition-colors hover:bg-[#1a3d2b]/90"
        >
          Close
        </button>
      </motion.div>
    </div>
  );
}

// ── Appointment Card ───────────────────────────────────────────
function ApptCard({ appt, joinMeetingLink, onJoinClick }: {
  appt: OnlineAppt;
  joinMeetingLink: string | null;
  onJoinClick: () => void;
}) {
  const [open, setOpen] = useState(appt.joinEnabled);
  const sm = STATUS_META[appt.status] ?? STATUS_META.confirmed;
  const canJoin = appt.joinEnabled && !!joinMeetingLink;

  return (
    <div className={cn(
      "bg-white rounded-2xl border shadow-sm overflow-hidden transition-all",
      canJoin ? "border-green-400 ring-2 ring-green-200" : "border-border"
    )}>
      <button className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/20 transition-colors"
        onClick={() => setOpen(v => !v)}>
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
          canJoin ? "bg-green-100" : "bg-blue-50")}>
          <Video size={18} className={canJoin ? "text-green-600" : "text-blue-600"} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-sm">{fmtDateShort(appt.slot.date)}</p>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${sm.color}`}>
              {sm.label}
            </span>
            {canJoin && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-600 text-white animate-pulse">
                🟢 LIVE – Join Now
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            <Clock size={10} className="inline mr-1" />
            {fmtTime(appt.slot.startTime)} – {fmtTime(appt.slot.endTime)}
            {appt.documents.length > 0 && ` · ${appt.documents.length} doc(s)`}
          </p>
        </div>
        {open ? <ChevronUp size={16} className="text-muted-foreground shrink-0" /> : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
            className="overflow-hidden">
            <div className="border-t border-border px-5 pb-5 pt-4 space-y-4">
              {/* Join button */}
              {canJoin ? (
                <a href={joinMeetingLink!} target="_blank" rel="noopener noreferrer" onClick={onJoinClick}
                  className="flex items-center justify-center gap-2 w-full py-3.5 bg-green-600 hover:bg-green-700 text-white font-extrabold rounded-2xl text-sm transition-colors shadow-lg">
                  <Video size={16} /> Join Consultation Now →
                </a>
              ) : appt.status === "confirmed" || appt.status === "pending" ? (
                <div className="flex items-center gap-2 w-full py-3 bg-gray-100 text-gray-400 font-bold rounded-2xl text-sm justify-center border border-gray-200 cursor-not-allowed">
                  <Video size={15} />
                  {appt.status === "pending" ? "Awaiting admin approval" : "Waiting for doctor — we'll notify you when ready"}
                </div>
              ) : null}

              {/* Reason */}
              {appt.reason && (
                <p className="text-sm text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
                  <span className="font-medium text-foreground">Reason:</span> {appt.reason}
                </p>
              )}

              {/* Documents */}
              {appt.documents.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <FileText size={11} /> Uploaded Documents
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {appt.documents.map((d, i) => (
                      <a key={i} href={`${BASE}/api/storage${d.objectPath}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-1.5 font-medium hover:bg-blue-100 flex items-center gap-1.5">
                        <FileText size={11} /> {d.name}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────
export default function PatientDashboard() {
  const [, nav] = useLocation();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appts, setAppts] = useState<OnlineAppt[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"appointments" | "prescriptions">("appointments");
  const [joinPopup, setJoinPopup] = useState<{ apptId: number; meetingLink: string } | null>(null);
  const [donationPopup, setDonationPopup] = useState<{ apptId: number; qrObjectPath: string | null } | null>(null);
  const [joinMeetingLink, setJoinMeetingLink] = useState<string | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  async function apiFetch(path: string) {
    const r = await fetch(`${BASE}/api/patient${path}`, { credentials: "include" });
    if (r.status === 401) { nav("/portal"); return null; }
    return r.json();
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    const [me, myAppts, settings] = await Promise.all([
      apiFetch("/me"),
      fetch(`${BASE}/api/online-appointments/mine`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
      fetch(`${BASE}/api/admin/settings`).then(r => r.ok ? r.json() : {}),
    ]);
    if (!me) return;
    setPatient(me);
    setAppts(myAppts ?? []);
    setJoinMeetingLink(settings?.meetingLink ?? null);
    setLoading(false);
  }, []);

  // SSE for real-time join / session-end notifications
  useEffect(() => {
    const es = new EventSource(`${BASE}/api/patient/sse`, { withCredentials: true });
    sseRef.current = es;

    es.addEventListener("join_enabled", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      // Play chime
      playChime();
      // Update the appointment in state
      setAppts(prev => prev.map(a => a.id === data.apptId ? { ...a, joinEnabled: true } : a));
      setJoinMeetingLink(data.meetingLink);
      setJoinPopup({ apptId: data.apptId, meetingLink: data.meetingLink });
    });

    es.addEventListener("session_ended", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setAppts(prev => prev.map(a => a.id === data.apptId ? { ...a, joinEnabled: false, status: "completed" } : a));
      setJoinPopup(null);
      setDonationPopup({ apptId: data.apptId, qrObjectPath: data.qrObjectPath });
    });

    es.onerror = () => {
      // Silently retry — browser handles reconnection
    };

    return () => { es.close(); };
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function logout() {
    await fetch(`${BASE}/api/patient/logout`, { method: "POST", credentials: "include" });
    nav("/portal");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f9f6] flex items-center justify-center">
        <div className="text-center">
          <img src={logoImg} alt="Logo" className="h-14 mx-auto mb-4 opacity-70" />
          <p className="text-muted-foreground text-sm animate-pulse">Loading your portal…</p>
        </div>
      </div>
    );
  }

  const prescriptions = appts.filter(a => a.prescription?.photoObjectPath);

  return (
    <div className="min-h-screen bg-[#f5f9f6]">
      {/* Popups */}
      <AnimatePresence>
        {joinPopup && (
          <JoinPopup
            meetingLink={joinPopup.meetingLink}
            onClose={() => setJoinPopup(null)}
          />
        )}
        {donationPopup && (
          <DonationPopup
            qrObjectPath={donationPopup.qrObjectPath}
            onClose={() => setDonationPopup(null)}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-white border-b border-border shadow-sm sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src={logoImg} alt="Susruta Hospital" className="h-9" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground leading-none">Patient Portal</p>
            <p className="font-bold text-sm text-foreground">{patient?.name}</p>
          </div>
          {patient?.patientCode && (
            <div className="bg-[#1a3d2b] text-white px-3 py-1.5 rounded-xl text-center">
              <p className="text-[9px] font-semibold uppercase tracking-wider opacity-70">Patient ID</p>
              <p className="font-extrabold text-base leading-none">{patient.patientCode}</p>
            </div>
          )}
          <button onClick={() => loadData()} className="p-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted/40">
            <RefreshCw size={16} />
          </button>
          <button onClick={logout} className="p-2 text-muted-foreground hover:text-red-500 rounded-xl hover:bg-red-50">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Patient Code Banner */}
        {patient?.patientCode && (
          <div className="bg-[#1a3d2b] text-white rounded-2xl p-4 flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <User size={24} className="opacity-70" />
            </div>
            <div>
              <p className="text-xs opacity-70 uppercase tracking-wider">Welcome back</p>
              <p className="font-bold text-lg">{patient.name}</p>
              <p className="text-xs opacity-80 mt-0.5">
                Your Patient ID: <span className="font-extrabold text-base ml-1">{patient.patientCode}</span>
                <span className="opacity-60 ml-1.5">· mention this when visiting in person</span>
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 bg-white rounded-2xl p-1.5 border border-border shadow-sm">
          {[
            { key: "appointments", label: "My Consultations", icon: <Calendar size={14} /> },
            { key: "prescriptions", label: "Prescriptions", icon: <FileText size={14} /> },
          ].map(t => (
            <button key={t.key}
              onClick={() => setTab(t.key as any)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
                tab === t.key
                  ? "bg-[#1a3d2b] text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              )}>
              {t.icon} {t.label}
              {t.key === "appointments" && appts.some(a => a.joinEnabled) && (
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              )}
            </button>
          ))}
        </div>

        {/* Appointments Tab */}
        {tab === "appointments" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-foreground">Online Consultations</h2>
              <button
                onClick={() => nav("/portal/online-book")}
                className="text-xs bg-[#1a3d2b] text-white font-semibold px-3 py-1.5 rounded-xl hover:bg-[#1a3d2b]/90 flex items-center gap-1.5">
                + Book Consultation
              </button>
            </div>

            {appts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-border p-8 text-center">
                <Calendar size={36} className="text-muted-foreground/30 mx-auto mb-3" />
                <p className="font-semibold text-muted-foreground text-sm">No consultations yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Book your first online consultation with Dr. Murali Krishna</p>
                <button onClick={() => nav("/portal/online-book")}
                  className="text-sm bg-[#1a3d2b] text-white font-semibold px-5 py-2 rounded-xl hover:bg-[#1a3d2b]/90">
                  Book Now
                </button>
              </div>
            ) : (
              appts.map(appt => (
                <ApptCard
                  key={appt.id}
                  appt={appt}
                  joinMeetingLink={joinMeetingLink}
                  onJoinClick={() => setJoinPopup(null)}
                />
              ))
            )}
          </div>
        )}

        {/* Prescriptions Tab */}
        {tab === "prescriptions" && (
          <div className="space-y-3">
            <h2 className="font-bold text-foreground">Prescriptions from Dr. Murali Krishna</h2>
            {prescriptions.length === 0 ? (
              <div className="bg-white rounded-2xl border border-border p-8 text-center">
                <FileText size={36} className="text-muted-foreground/30 mx-auto mb-3" />
                <p className="font-semibold text-muted-foreground text-sm">No prescriptions yet</p>
                <p className="text-xs text-muted-foreground mt-1">After your consultation, the doctor will upload your prescription here.</p>
              </div>
            ) : (
              prescriptions.map(appt => (
                <div key={appt.id} className="bg-white rounded-2xl border border-border shadow-sm p-5">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <p className="font-bold text-sm text-foreground">{fmtDate(appt.slot.date)}</p>
                      <p className="text-xs text-muted-foreground">{fmtTime(appt.slot.startTime)} – {fmtTime(appt.slot.endTime)}</p>
                      {appt.prescription?.notes && (
                        <p className="text-sm text-muted-foreground mt-2 bg-muted/40 rounded-xl px-3 py-2">
                          <span className="font-medium text-foreground">Note:</span> {appt.prescription.notes}
                        </p>
                      )}
                    </div>
                    <a
                      href={`${BASE}/api/storage${appt.prescription!.photoObjectPath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="flex items-center gap-1.5 text-xs bg-[#1a3d2b] text-white font-semibold px-3 py-2 rounded-xl hover:bg-[#1a3d2b]/90 shrink-0"
                    >
                      <Download size={12} /> Download
                    </a>
                  </div>
                  <div className="bg-gray-50 rounded-xl overflow-hidden border border-border">
                    <img
                      src={`${BASE}/api/storage${appt.prescription!.photoObjectPath}`}
                      alt="Prescription"
                      className="w-full max-h-[400px] object-contain"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Issued {new Date(appt.prescription!.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {/* Footer note */}
        <p className="text-center text-xs text-muted-foreground pb-4">
          Keep this portal open during your appointment time — we'll notify you when the doctor is ready.
        </p>
      </div>
    </div>
  );
}
