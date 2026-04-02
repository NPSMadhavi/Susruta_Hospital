import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Stethoscope, LogOut, ChevronDown, ChevronUp, FileText, Plus, Trash2,
  Save, CheckCircle2, AlertCircle, Loader2, User, Calendar, Clock,
  Download, StickyNote, Pill, RefreshCw
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

type MedicineRow = { medicine: string; instructions: string };
type Document = { name: string; objectPath: string; contentType: string; size: number };
type Prescription = { id: number; medicines: MedicineRow[]; doctorNotes?: string | null; createdAt: string; updatedAt: string };
type Slot = { id: number; date: string; startTime: string; endTime: string };
type Patient = { id: number; name: string; email: string; phone?: string };
type Appointment = {
  id: number; status: string; reason?: string;
  documents: Document[]; createdAt: string;
  slot: Slot; patient: Patient;
  prescription: Prescription | null;
};

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}
function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};

function AppointmentCard({ appt, onUpdated }: { appt: Appointment; onUpdated: (a: Appointment) => void }) {
  const [open, setOpen] = useState(false);
  const [medicines, setMedicines] = useState<MedicineRow[]>(
    appt.prescription?.medicines?.length ? appt.prescription.medicines : [{ medicine: "", instructions: "" }]
  );
  const [notes, setNotes] = useState<string>(appt.prescription?.doctorNotes ?? "");
  const [savingRx, setSavingRx] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [rxResult, setRxResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [notesResult, setNotesResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (appt.prescription) {
      setMedicines(appt.prescription.medicines.length > 0 ? appt.prescription.medicines : [{ medicine: "", instructions: "" }]);
      setNotes(appt.prescription.doctorNotes ?? "");
    }
  }, [appt.prescription]);

  function addRow() { setMedicines(m => [...m, { medicine: "", instructions: "" }]); }
  function removeRow(i: number) { setMedicines(m => m.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, k: keyof MedicineRow) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setMedicines(m => m.map((row, idx) => idx === i ? { ...row, [k]: e.target.value } : row));
  }

  async function savePrescription() {
    const valid = medicines.filter(m => m.medicine.trim());
    if (valid.length === 0) { setRxResult({ ok: false, msg: "Add at least one medicine before saving." }); return; }
    setSavingRx(true);
    setRxResult(null);
    try {
      await doctorFetch(`/appointments/${appt.id}/prescription`, {
        method: "PUT",
        body: JSON.stringify({ medicines: valid }),
      });
      setRxResult({ ok: true, msg: "Prescription saved successfully." });
      onUpdated({ ...appt, status: "completed", prescription: { ...appt.prescription!, medicines: valid } });
    } catch {
      setRxResult({ ok: false, msg: "Failed to save prescription." });
    } finally {
      setSavingRx(false);
    }
  }

  async function saveNotes() {
    setSavingNotes(true);
    setNotesResult(null);
    try {
      await doctorFetch(`/appointments/${appt.id}/notes`, {
        method: "PUT",
        body: JSON.stringify({ notes }),
      });
      setNotesResult({ ok: true, msg: "Notes saved." });
    } catch {
      setNotesResult({ ok: false, msg: "Failed to save notes." });
    } finally {
      setSavingNotes(false);
    }
  }

  const inputCls = "w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white";
  const statusColor = STATUS_COLORS[appt.status] ?? STATUS_COLORS["confirmed"];

  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <User size={20} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-foreground">{appt.patient.name}</p>
            <span className={cn("text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border", statusColor)}>
              {appt.status}
            </span>
            {appt.prescription && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 flex items-center gap-1">
                <Pill size={9} /> Rx Saved
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-3">
            <span className="flex items-center gap-1"><Calendar size={11} /> {fmtDate(appt.slot.date)}</span>
            <span className="flex items-center gap-1"><Clock size={11} /> {fmtTime(appt.slot.startTime)} – {fmtTime(appt.slot.endTime)}</span>
          </p>
          <p className="text-xs text-muted-foreground">{appt.patient.email} {appt.patient.phone && `· ${appt.patient.phone}`}</p>
        </div>
        <div className="shrink-0 text-muted-foreground">
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="p-5 space-y-6">
              {/* Reason */}
              {appt.reason && (
                <div className="bg-muted/40 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Reason for Consultation</p>
                  <p className="text-sm text-foreground">{appt.reason}</p>
                </div>
              )}

              {/* Documents */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <FileText size={12} /> Patient Documents ({appt.documents.length})
                </p>
                {appt.documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents uploaded</p>
                ) : (
                  <div className="space-y-2">
                    {appt.documents.map((doc, i) => (
                      <a key={i}
                        href={`${BASE}/api/storage${doc.objectPath}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 hover:bg-blue-100 transition-colors group"
                      >
                        <FileText size={15} className="text-blue-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-blue-800 truncate">{doc.name}</p>
                          <p className="text-xs text-blue-500">{fmtBytes(doc.size)} · {doc.contentType}</p>
                        </div>
                        <Download size={14} className="text-blue-400 group-hover:text-blue-700 transition-colors shrink-0" />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Prescription notepad */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Pill size={12} /> Prescription
                </p>
                <div className="space-y-2">
                  {medicines.map((row, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start">
                      <input
                        value={row.medicine} onChange={updateRow(i, "medicine")}
                        placeholder={`Medicine ${i + 1}`}
                        className={inputCls}
                      />
                      <input
                        value={row.instructions} onChange={updateRow(i, "instructions")}
                        placeholder="Dosage & instructions"
                        className={inputCls}
                      />
                      <button onClick={() => removeRow(i)} disabled={medicines.length === 1}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 mt-0.5">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <button onClick={addRow}
                    className="flex items-center gap-1.5 text-sm text-primary font-semibold hover:text-primary/80 transition-colors">
                    <Plus size={14} /> Add Medicine
                  </button>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <button onClick={savePrescription} disabled={savingRx}
                    className="flex items-center gap-2 px-4 py-2 bg-[#1a3d2b] text-white rounded-xl text-sm font-bold hover:bg-[#1a3d2b]/90 transition-colors disabled:opacity-60">
                    {savingRx ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {savingRx ? "Saving…" : "Save Prescription"}
                  </button>
                  {rxResult && (
                    <span className={cn("flex items-center gap-1.5 text-sm", rxResult.ok ? "text-green-700" : "text-red-600")}>
                      {rxResult.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                      {rxResult.msg}
                    </span>
                  )}
                </div>
              </div>

              {/* Private doctor notes */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <StickyNote size={12} /> Private Notes <span className="text-[10px] normal-case font-normal">(not visible to patient)</span>
                </p>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Internal notes for this patient…"
                  className={cn(inputCls, "resize-none")}
                />
                <div className="flex items-center gap-3 mt-2">
                  <button onClick={saveNotes} disabled={savingNotes}
                    className="flex items-center gap-2 px-4 py-2 bg-muted border border-border text-foreground rounded-xl text-sm font-semibold hover:bg-muted/80 transition-colors disabled:opacity-60">
                    {savingNotes ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {savingNotes ? "Saving…" : "Save Notes"}
                  </button>
                  {notesResult && (
                    <span className={cn("flex items-center gap-1.5 text-sm", notesResult.ok ? "text-green-700" : "text-red-600")}>
                      {notesResult.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                      {notesResult.msg}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function DoctorAppointments() {
  const [, navigate] = useLocation();
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "confirmed" | "completed">("all");

  const load = useCallback(async () => {
    try {
      const data = await doctorFetch("/appointments");
      setAppts(data);
    } catch (err: any) {
      if (err?.error === "unauthorized") navigate("/doctor");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  async function logout() {
    await doctorFetch("/logout", { method: "POST" });
    navigate("/doctor");
  }

  function updateAppt(updated: Appointment) {
    setAppts(prev => prev.map(a => a.id === updated.id ? updated : a));
  }

  const shown = filter === "all" ? appts : appts.filter(a => a.status === filter);
  const confirmedCount = appts.filter(a => a.status === "confirmed").length;
  const completedCount = appts.filter(a => a.status === "completed").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50/40 via-white to-white">
      {/* Header */}
      <header className="bg-white border-b border-border/50 shadow-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Susruta Hospital" className="h-9 w-auto object-contain" />
            <div className="hidden sm:block">
              <p className="text-xs text-muted-foreground">Doctor Portal</p>
              <p className="text-sm font-bold text-foreground">Dr. P. Murali Krishna</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading}
              className="p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <button onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted rounded-xl transition-colors font-medium">
              <LogOut size={15} /> Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Welcome banner */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="bg-[#1a3d2b] text-white rounded-3xl p-6 flex items-center justify-between overflow-hidden relative">
          <div className="absolute right-0 top-0 w-48 h-full opacity-10"
            style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
          <div>
            <p className="text-green-300 text-sm font-medium flex items-center gap-1.5 mb-1">
              <Stethoscope size={13} /> Doctor Portal
            </p>
            <h1 className="text-xl font-serif font-bold">Welcome, Dr. Murali Krishna</h1>
            <p className="text-white/60 text-sm mt-1">Manage online consultation appointments</p>
          </div>
          <div className="grid grid-cols-2 gap-3 shrink-0">
            <div className="text-center bg-white/10 rounded-2xl p-3 border border-white/10">
              <p className="text-2xl font-bold font-serif">{confirmedCount}</p>
              <p className="text-xs text-white/60">Pending</p>
            </div>
            <div className="text-center bg-white/10 rounded-2xl p-3 border border-white/10">
              <p className="text-2xl font-bold font-serif">{completedCount}</p>
              <p className="text-xs text-white/60">Done</p>
            </div>
          </div>
        </motion.div>

        {/* Filter tabs */}
        <div className="bg-muted/50 rounded-2xl p-1 flex">
          {([["all", "All Appointments"], ["confirmed", "Pending Consult"], ["completed", "Completed"]] as const).map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              className={cn(
                "flex-1 py-2 text-sm font-semibold rounded-xl transition-all",
                filter === val ? "bg-white shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
              )}>
              {label}
              {val !== "all" && (
                <span className={cn("ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                  val === "confirmed" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700")}>
                  {val === "confirmed" ? confirmedCount : completedCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Appointments */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 size={18} className="animate-spin" /> Loading appointments…
          </div>
        ) : shown.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-border">
            <Stethoscope size={40} className="mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">No {filter !== "all" ? filter : ""} appointments yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map(appt => (
              <AppointmentCard key={appt.id} appt={appt} onUpdated={updateAppt} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
