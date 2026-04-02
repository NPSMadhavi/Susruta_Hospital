import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Calendar, Clock, CheckCircle2, XCircle, AlertCircle, LogOut,
  Plus, Leaf, ChevronRight, Bell, RefreshCw, User, Video, Pill, FileText, ChevronDown, ChevronUp
} from "lucide-react";
import { patientApi } from "@/lib/patient-api";
import logoImg from "@assets/logo_1773840200056.png";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type MedicineRow = { medicine: string; instructions: string };
type OnlineAppt = {
  id: number; status: string; reason?: string; createdAt: string;
  meetingLink: string | null;
  documents: { name: string; objectPath: string; contentType: string; size: number }[];
  slot: { id: number; date: string; startTime: string; endTime: string };
  prescription: { medicines: MedicineRow[]; updatedAt: string } | null;
};

function fmtTimeO(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function OnlineConsultationCard({ appt }: { appt: OnlineAppt }) {
  const [open, setOpen] = useState(false);
  const fmtD = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  const statusColor: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
    confirmed: "bg-blue-100 text-blue-700 border-blue-200",
    completed: "bg-green-100 text-green-700 border-green-200",
    cancelled: "bg-gray-100 text-gray-500 border-gray-200",
  };
  const statusLabel: Record<string, string> = {
    pending: "Awaiting Approval",
    confirmed: "Confirmed",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  const sc = statusColor[appt.status] ?? statusColor["confirmed"];

  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/20 transition-colors">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <Video size={18} className="text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-sm text-foreground">{fmtD(appt.slot.date)}</p>
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">Online</span>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${sc}`}>
              {statusLabel[appt.status] ?? appt.status}
            </span>
            {appt.prescription && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 flex items-center gap-1">
                <Pill size={9} /> Rx Ready
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            <Clock size={10} className="inline mr-1" />{fmtTimeO(appt.slot.startTime)} – {fmtTimeO(appt.slot.endTime)}
            {appt.documents.length > 0 && ` · ${appt.documents.length} doc(s)`}
          </p>
          {appt.meetingLink && appt.status === "confirmed" && (
            <a href={appt.meetingLink} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 mt-1.5 bg-blue-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
              <Video size={10} /> Join Meeting
            </a>
          )}
        </div>
        {open ? <ChevronUp size={16} className="text-muted-foreground shrink-0" /> : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-border px-5 pb-4 pt-3 space-y-4">
          {appt.reason && (
            <p className="text-sm text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
              <span className="font-medium text-foreground">Reason:</span> {appt.reason}
            </p>
          )}
          {appt.prescription ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Pill size={11} /> Prescription from Dr. Murali Krishna
              </p>
              <div className="space-y-1.5">
                {appt.prescription.medicines.map((m, i) => (
                  <div key={i} className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
                    <div className="w-5 h-5 rounded-full bg-green-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
                    <div>
                      <p className="text-sm font-bold text-foreground">{m.medicine}</p>
                      <p className="text-xs text-green-700">{m.instructions}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Issued {new Date(appt.prescription.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
            </div>
          ) : appt.status === "confirmed" ? (
            <div className="text-sm text-muted-foreground bg-muted/30 rounded-xl px-4 py-3 flex items-center gap-2">
              <Clock size={13} /> Prescription will appear here after your consultation.
            </div>
          ) : null}

          {appt.documents.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <FileText size={11} /> Uploaded Documents
              </p>
              <div className="flex flex-wrap gap-2">
                {appt.documents.map((d, i) => (
                  <a key={i} href={`${BASE}/api/storage${d.objectPath}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-1.5 font-medium hover:bg-blue-100 transition-colors flex items-center gap-1.5">
                    <FileText size={11} /> {d.name}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Patient = { id: number; name: string; email: string; phone?: string };
type Appt = {
  id: number; date: string; timeSlot: string; reason?: string; status: string;
  notes?: string; arrivedAt?: string; paymentStatus: string; paymentMode?: string;
  rescheduleDates?: string; rescheduleChosen?: string; followUpDate?: string; followUpConfirmed: boolean;
};

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "Pending Approval", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: <Clock size={13} /> },
  confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-700 border-blue-200", icon: <CheckCircle2 size={13} /> },
  reschedule_proposed: { label: "Reschedule Proposed", color: "bg-orange-100 text-orange-700 border-orange-200", icon: <RefreshCw size={13} /> },
  reschedule_accepted: { label: "Rescheduled", color: "bg-purple-100 text-purple-700 border-purple-200", icon: <RefreshCw size={13} /> },
  arrived: { label: "Arrived at Clinic", color: "bg-teal-100 text-teal-700 border-teal-200", icon: <CheckCircle2 size={13} /> },
  completed: { label: "Completed", color: "bg-green-100 text-green-700 border-green-200", icon: <CheckCircle2 size={13} /> },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700 border-red-200", icon: <XCircle size={13} /> },
  missed: { label: "Missed", color: "bg-gray-100 text-gray-600 border-gray-200", icon: <AlertCircle size={13} /> },
};

// Progress tracker — 4 stages of an appointment lifecycle
const TRACKER_STEPS = [
  { key: "requested", label: "Requested", statuses: ["pending", "reschedule_proposed"] },
  { key: "approved",  label: "Approved",  statuses: ["confirmed", "reschedule_accepted"] },
  { key: "arrived",   label: "Arrived",   statuses: ["arrived"] },
  { key: "completed", label: "Completed", statuses: ["completed"] },
];

function getStepIndex(status: string) {
  if (["completed"].includes(status)) return 3;
  if (["arrived"].includes(status)) return 2;
  if (["confirmed", "reschedule_accepted"].includes(status)) return 1;
  return 0; // pending, reschedule_proposed, cancelled, missed
}

function AppointmentTracker({ status }: { status: string }) {
  const isCancelled = status === "cancelled" || status === "missed";
  const activeIdx = getStepIndex(status);

  if (isCancelled) return null;

  return (
    <div className="py-3">
      <div className="flex items-center">
        {TRACKER_STEPS.map((step, idx) => {
          const done = idx < activeIdx;
          const active = idx === activeIdx;
          return (
            <React.Fragment key={step.key}>
              {/* Step circle */}
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                  ${done    ? "bg-primary text-white shadow-sm shadow-primary/30"
                  : active  ? "bg-primary text-white ring-4 ring-primary/20 shadow-md shadow-primary/30"
                            : "bg-muted border-2 border-border text-muted-foreground/40"}`}>
                  {done ? <CheckCircle2 size={14} /> : <span>{idx + 1}</span>}
                </div>
                <span className={`text-[10px] font-semibold whitespace-nowrap
                  ${done || active ? "text-primary" : "text-muted-foreground/40"}`}>
                  {step.label}
                </span>
              </div>
              {/* Connector line */}
              {idx < TRACKER_STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 mb-4 rounded-full transition-all
                  ${done ? "bg-primary" : "bg-border"}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      {/* Active step description */}
      <p className="text-xs text-center text-muted-foreground mt-1">
        {status === "pending" && "⏳ Waiting for clinic to review your request"}
        {status === "reschedule_proposed" && "📅 Clinic has proposed new dates — please choose one below"}
        {status === "reschedule_accepted" && "✅ Reschedule confirmed — your appointment is set"}
        {status === "confirmed" && "✅ Your appointment is confirmed! See you at the clinic"}
        {status === "arrived" && "🏥 You've checked in — currently at the clinic"}
        {status === "completed" && "🌿 Visit completed. Thank you for choosing Susruta Hospital"}
      </p>
    </div>
  );
}

function fmt(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function isUpcoming(a: Appt) {
  return ["confirmed", "pending", "reschedule_proposed", "reschedule_accepted"].includes(a.status) && a.date >= new Date().toISOString().slice(0, 10);
}
function isPast(a: Appt) { return ["completed", "arrived"].includes(a.status); }
function isMissed(a: Appt) { return a.status === "missed" || (["confirmed", "pending"].includes(a.status) && a.date < new Date().toISOString().slice(0, 10)); }

export default function PatientDashboard() {
  const [, navigate] = useLocation();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [onlineAppts, setOnlineAppts] = useState<OnlineAppt[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "past" | "missed">("upcoming");
  const [choosingReschedule, setChoosingReschedule] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(initial = false) {
      try {
        if (initial) {
          const [me, myAppts, myOnlineAppts] = await Promise.all([
            patientApi.me(),
            patientApi.getAppointments(),
            fetch(`${BASE}/api/online-appointments/mine`, { credentials: "include" }).then(r => r.json()).catch(() => []),
          ]);
          if (cancelled) return;
          setPatient(me);
          setAppts(myAppts);
          setOnlineAppts(myOnlineAppts);
        } else {
          const [myAppts, myOnlineAppts] = await Promise.all([
            patientApi.getAppointments(),
            fetch(`${BASE}/api/online-appointments/mine`, { credentials: "include" }).then(r => r.json()).catch(() => []),
          ]);
          if (cancelled) return;
          setAppts(myAppts);
          setOnlineAppts(myOnlineAppts);
        }
      } catch {
        if (initial) navigate("/portal");
      } finally {
        if (initial) setLoading(false);
      }
    }

    load(true);

    // Poll every 15s so status changes from admin appear without a manual refresh
    const interval = setInterval(() => load(false), 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  async function logout() {
    await patientApi.logout();
    navigate("/portal");
  }

  async function confirmFollowup(id: number) {
    const updated = await patientApi.confirmFollowup(id);
    setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, ...updated } : a)));
  }

  async function chooseReschedule(id: number, date: string) {
    const updated = await patientApi.chooseReschedule(id, date);
    setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, ...updated } : a)));
    setChoosingReschedule(null);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white">
      <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const upcoming = appts.filter(isUpcoming);
  const past = appts.filter(isPast);
  const missed = appts.filter(isMissed);
  const followUps = appts.filter((a) => a.followUpDate && !a.followUpConfirmed && isPast(a));
  const shown = { upcoming, past, missed }[tab];

  // Online appointments merged into tabs
  const onlineUpcoming = onlineAppts.filter((a) => ["pending", "confirmed"].includes(a.status));
  const onlinePast = onlineAppts.filter((a) => a.status === "completed");
  const shownOnline = tab === "upcoming" ? onlineUpcoming : tab === "past" ? onlinePast : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50/40 via-white to-white">
      {/* Header */}
      <header className="bg-white border-b border-border/50 shadow-sm sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <img src={logoImg} alt="Susruta Hospital" className="h-9 w-auto object-contain" />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-green-600 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Live
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-foreground">{patient?.name}</p>
              <p className="text-xs text-muted-foreground">{patient?.email}</p>
            </div>
            <button onClick={logout} className="ml-2 p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Welcome card */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="bg-[#1a3d2b] text-white rounded-3xl p-6 flex items-center justify-between overflow-hidden relative">
          <div className="absolute right-0 top-0 w-48 h-full opacity-10"
            style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
          <div>
            <p className="text-green-300 text-sm font-medium flex items-center gap-1.5 mb-1"><Leaf size={13} /> Patient Portal</p>
            <h1 className="text-xl font-serif font-bold">Welcome back, {patient?.name?.split(" ")[0]}!</h1>
            <p className="text-white/60 text-sm mt-1">Manage your Ayurvedic care journey</p>
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => navigate("/portal/book")}
              className="flex-shrink-0 bg-white text-[#1a3d2b] rounded-2xl px-4 py-2.5 text-sm font-bold hover:bg-green-50 transition-colors flex items-center gap-1.5 shadow-lg">
              <Plus size={15} /> Book
            </button>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Upcoming", count: upcoming.length + onlineUpcoming.length, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Completed", count: past.length + onlinePast.length, color: "text-green-600", bg: "bg-green-50" },
            { label: "Missed", count: missed.length, color: "text-red-500", bg: "bg-red-50" },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center`}>
              <div className={`text-2xl font-bold font-serif ${s.color}`}>{s.count}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Follow-up alerts */}
        {followUps.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
            <p className="text-amber-800 font-semibold flex items-center gap-2 text-sm">
              <Bell size={15} /> Follow-up Reminders
            </p>
            {followUps.map((a) => (
              <div key={a.id} className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm">
                <div>
                  <p className="text-sm font-medium">Follow-up suggested: <span className="text-amber-700 font-bold">{fmt(a.followUpDate!)}</span></p>
                  <p className="text-xs text-muted-foreground">From your visit on {fmt(a.date)}</p>
                </div>
                <button onClick={() => confirmFollowup(a.id)}
                  className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-amber-700 transition-colors">
                  Confirm
                </button>
              </div>
            ))}
          </motion.div>
        )}

        {/* Tabs */}
        <div className="bg-muted/50 rounded-2xl p-1 flex">
          {(["upcoming", "past", "missed"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all capitalize ${tab === t ? "bg-white shadow-sm text-primary" : "text-muted-foreground"}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Appointment cards */}
        <div className="space-y-3">
          {shown.length === 0 && shownOnline.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No {tab} appointments</p>
              {tab === "upcoming" && (
                <button onClick={() => navigate("/portal/book")}
                  className="mt-5 inline-flex items-center gap-2 bg-[#1a3d2b] text-white rounded-2xl px-5 py-2.5 text-sm font-bold hover:bg-[#1a3d2b]/90 transition-colors shadow-md">
                  <Plus size={15} /> Book an Appointment
                </button>
              )}
            </div>
          ) : (
            <>
            {shown.map((a) => {
              const meta = STATUS_META[a.status] ?? STATUS_META["pending"];
              const dates: string[] = a.rescheduleDates ? JSON.parse(a.rescheduleDates) : [];
              return (
                <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl border border-border shadow-sm p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-foreground">{fmt(a.date)}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock size={12} /> {a.timeSlot}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${meta.color}`}>
                      {meta.icon} {meta.label}
                    </span>
                  </div>

                  {/* Progress tracker */}
                  <div className="border-t border-b border-border/50 -mx-5 px-5">
                    <AppointmentTracker status={a.status} />
                  </div>

                  {a.reason && <p className="text-sm text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">{a.reason}</p>}
                  {a.notes && <p className="text-sm text-primary/80 bg-primary/5 rounded-xl px-3 py-2">Doctor's note: {a.notes}</p>}

                  {/* Payment info */}
                  {a.paymentStatus === "paid" && (
                    <div className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5">
                      <CheckCircle2 size={12} /> Payment received via {a.paymentMode?.toUpperCase()}
                    </div>
                  )}

                  {/* Reschedule picker */}
                  {a.status === "reschedule_proposed" && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                      <p className="text-sm font-semibold text-orange-800 mb-2">Admin has proposed new dates. Please choose one:</p>
                      <div className="flex flex-wrap gap-2">
                        {dates.map((d) => (
                          <button key={d} onClick={() => chooseReschedule(a.id, d)}
                            className="bg-white border border-orange-300 text-orange-800 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-orange-600 hover:text-white transition-colors">
                            {fmt(d)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
            {shownOnline.map((appt) => (
              <motion.div key={`online-${appt.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <OnlineConsultationCard appt={appt} />
              </motion.div>
            ))}
            </>
          )}
        </div>
      </div>

    </div>
  );
}
