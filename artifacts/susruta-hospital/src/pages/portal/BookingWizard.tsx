import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, MapPin, Video, Calendar, Clock, ArrowRight, ArrowLeft,
  CheckCircle2, AlertCircle, Upload, FileText, Trash2,
  Loader2, Leaf,
} from "lucide-react";
import { patientApi } from "@/lib/patient-api";
import { dualSlotTime } from "@/lib/ist";
import {
  useListOpenMonths,
  useGetAvailability,
  useGetSlots,
} from "@workspace/api-client-react";
import { getDaysInMonth, startOfMonth, getDay, format, parseISO } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ────────────────────────────────────────────────────────
type OnlineSlot = { id: number; date: string; startTime: string; endTime: string; intervalMinutes: number };
type DateGroup = { date: string; slots: OnlineSlot[] };
type UploadedDoc = { name: string; objectPath: string; contentType: string; size: number };
type SavedDoc = { id: number; name: string; objectPath: string; contentType: string; size: number; createdAt: string };

// ── Helpers ──────────────────────────────────────────────────────
function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/** Render IST + local time range for a slot (start…end). Shows local only if timezone differs. */
function SlotTimeRange({ date, start, end, selected }: { date: string; start: string; end: string; selected?: boolean }) {
  const s = dualSlotTime(date, start);
  const e = dualSlotTime(date, end);
  const dim = selected ? "text-white/70" : "text-gray-500";
  const bold = selected ? "text-white" : "text-gray-900";
  return (
    <>
      <p className={`text-sm font-bold ${bold}`}>{s.ist} <span className={`text-[10px] font-normal ${dim}`}>IST</span></p>
      <p className={`text-xs mt-0.5 ${dim}`}>to {e.ist} IST</p>
      {s.local && (
        <p className={`text-[10px] mt-0.5 ${dim}`}>{s.local} – {e.local} <span className="opacity-70">local</span></p>
      )}
    </>
  );
}

/** Inline text label for a time range: "8:00 – 8:15 AM IST" (+ local if needed) */
function slotRangeText(date: string, start: string, end: string): { ist: string; local: string | null } {
  const s = dualSlotTime(date, start);
  const e = dualSlotTime(date, end);
  return { ist: `${s.ist} – ${e.ist} IST`, local: s.local ? `${s.local} – ${e.local} local` : null };
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}
function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
function toYMD(d: Date) { return format(d, "yyyy-MM-dd"); }

// ── Calendar grid ────────────────────────────────────────────────
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
function CalendarGrid({ month, openMonths, availability, selectedDate, onSelect }: {
  month: string; openMonths: string[]; availability: any;
  selectedDate: string | null; onSelect: (d: string) => void;
}) {
  const [year, mon] = month.split("-").map(Number);
  const firstDay = getDay(startOfMonth(new Date(year, mon - 1, 1)));
  const daysInMonth = getDaysInMonth(new Date(year, mon - 1));
  const today = toYMD(new Date());
  const isMonthOpen = openMonths.includes(month);
  const blockedDates: string[] = availability?.blockedDates ?? [];
  const blockedDays: number[] = availability?.blockedDays ?? [];

  const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) =>
    i < firstDay ? null : i - firstDay + 1
  );

  return (
    <div className="grid grid-cols-7 gap-1">
      {DAYS.map(d => (
        <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
      ))}
      {cells.map((day, i) => {
        if (!day) return <div key={`e${i}`} />;
        const dateStr = `${month}-${String(day).padStart(2, "0")}`;
        const isPast = dateStr < today;
        const isBlocked = !isMonthOpen || blockedDates.includes(dateStr) ||
          blockedDays.includes(getDay(new Date(dateStr + "T12:00:00")));
        const isDisabled = isPast || isBlocked;
        const isSelected = dateStr === selectedDate;
        const isToday = dateStr === today;
        return (
          <button key={dateStr} disabled={isDisabled} onClick={() => onSelect(dateStr)}
            className={[
              "w-full aspect-square rounded-xl text-sm font-medium transition-all",
              isSelected ? "bg-[#1a3d2b] text-white shadow-md scale-105"
                : isDisabled ? "text-gray-300 cursor-not-allowed"
                : isToday ? "bg-[#1a3d2b]/10 text-[#1a3d2b] font-bold ring-1 ring-[#1a3d2b]/30 hover:bg-[#1a3d2b]/20"
                : "hover:bg-[#1a3d2b]/10 text-gray-800",
            ].join(" ")}
          >
            {day}
          </button>
        );
      })}
    </div>
  );
}

// ── Step progress bar ────────────────────────────────────────────
function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-6">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={label}>
            <div className={`flex items-center gap-1.5 text-xs font-bold shrink-0 ${active ? "text-[#1a3d2b]" : done ? "text-emerald-600" : "text-gray-300"}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${active ? "bg-[#1a3d2b] text-white" : done ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                {done ? <CheckCircle2 size={12} /> : i + 1}
              </div>
              <span className="hidden sm:block">{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 rounded-full ${done ? "bg-emerald-400" : "bg-gray-100"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Error banner ─────────────────────────────────────────────────
function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm mb-4">
      <AlertCircle size={15} className="shrink-0" /> {msg}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN WIZARD
// ══════════════════════════════════════════════════════════════════
type WizardType = "offline" | "online";
type OfflineStep = "date" | "slots" | "confirm" | "done";
type OnlineStep = "slots" | "docs" | "confirm" | "done";

interface Props {
  patient: { id: number; name: string; phone?: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function BookingWizard({ patient, onClose, onSuccess }: Props) {
  const [wizType, setWizType] = useState<WizardType | null>(null);

  // ── Offline state ────────────────────────────────────────────
  const [offlineStep, setOfflineStep] = useState<OfflineStep>("date");
  const [monthIdx, setMonthIdx] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [offlineError, setOfflineError] = useState("");

  const { data: openMonthsRaw = [] } = useListOpenMonths();
  const openMonths = (openMonthsRaw as any[]).filter(m => m.isOpen).map(m => m.month as string);
  const currentMonth = openMonths[monthIdx] ?? "";
  const { data: availability } = useGetAvailability({ month: currentMonth }, { query: { enabled: !!currentMonth } });
  const { data: slotsData } = useGetSlots({ date: selectedDate ?? "" }, { query: { enabled: !!selectedDate } });
  const offlineSlots: string[] = ((slotsData as any[] ?? []).filter((s: any) => s.available).map((s: any) => s.time as string));

  async function submitOffline() {
    if (!selectedDate || !selectedSlot || !patient) return;
    setOfflineError("");
    const effectivePhone = patient.phone ?? phone.trim();
    if (effectivePhone.length < 6) { setOfflineError("Please enter a valid phone number."); return; }
    setSubmitting(true);
    try {
      await patientApi.bookAppointment({
        date: selectedDate,
        timeSlot: selectedSlot,
        reason: reason.trim() || undefined,
        patientName: patient.name,
        patientPhone: effectivePhone,
      });
      setOfflineStep("done");
    } catch (err: any) {
      setOfflineError(err?.message ?? "Booking failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Online state ─────────────────────────────────────────────
  const [onlineStep, setOnlineStep] = useState<OnlineStep>("slots");
  const [dateGroups, setDateGroups] = useState<DateGroup[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineSlot, setOnlineSlot] = useState<OnlineSlot | null>(null);
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [onlineReason, setOnlineReason] = useState("");
  const [booking, setBooking] = useState(false);
  const [onlineError, setOnlineError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [savedDocs, setSavedDocs] = useState<SavedDoc[]>([]);
  const [savedDocsLoading, setSavedDocsLoading] = useState(false);

  useEffect(() => {
    if (wizType === "online" && onlineStep === "docs") {
      setSavedDocsLoading(true);
      fetch(`${BASE}/api/patient/documents`, { credentials: "include" })
        .then(r => r.json())
        .then(data => { setSavedDocs(Array.isArray(data) ? data : []); })
        .catch(() => {})
        .finally(() => setSavedDocsLoading(false));
    }
  }, [wizType, onlineStep]);

  function handleTypeSelect(type: WizardType) {
    setWizType(type);
    if (type === "online" && dateGroups.length === 0) {
      setOnlineLoading(true);
      fetch(`${BASE}/api/online-slots/available`, { credentials: "include" })
        .then(r => r.json()).then(setDateGroups)
        .catch(() => setOnlineError("Failed to load slots."))
        .finally(() => setOnlineLoading(false));
    }
  }

  async function uploadFiles(files: FileList) {
    setUploading(true);
    setOnlineError("");
    for (const file of Array.from(files)) {
      try {
        const r = await fetch(`${BASE}/api/storage/uploads/request-url`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, contentType: file.type, size: file.size }),
        });
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error((d as any)?.message || "Upload URL error"); }
        const { uploadURL, objectPath } = await r.json();
        const up = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!up.ok) throw new Error("Upload failed");
        // Save to patient's document library so doctor can see it anytime
        const saveRes = await fetch(`${BASE}/api/patient/documents`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, objectPath, contentType: file.type, size: file.size }),
        });
        const saved = await saveRes.json().catch(() => null);
        if (saved?.id) {
          setSavedDocs(prev => [...prev, {
            id: saved.id,
            name: file.name,
            objectPath,
            contentType: file.type,
            size: file.size,
            createdAt: saved.createdAt ?? new Date().toISOString(),
          }]);
        }
      } catch {
        setOnlineError(`Failed to upload "${file.name}". Please try again.`);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submitOnline() {
    if (!onlineSlot) return;
    setBooking(true); setOnlineError("");
    try {
      const r = await fetch(`${BASE}/api/online-appointments`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: onlineSlot.id, reason: onlineReason.trim() || undefined, documents: [] }),
      });
      const data = await r.json();
      if (!r.ok) throw data;
      setOnlineStep("done");
    } catch (err: any) {
      if (err?.error === "slot_taken") setOnlineError("This slot was just booked. Please pick another.");
      else setOnlineError(err?.message || "Booking failed. Please try again.");
    } finally {
      setBooking(false);
    }
  }

  // ── Modal shell ──────────────────────────────────────────────
  const isDone = (wizType === "offline" && offlineStep === "done") || (wizType === "online" && onlineStep === "done");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="bg-white w-full max-w-3xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{ height: "90vh", maxHeight: "90vh" }}
      >
        {/* Modal header */}
        <div className="bg-[#1a3d2b] px-6 py-5 flex items-center gap-3 shrink-0">
          <div className="flex-1">
            <p className="text-white/60 text-xs font-medium uppercase tracking-wider">
              {wizType === null ? "Appointment" : wizType === "offline" ? "In-Person Visit" : "Online Consultation"}
            </p>
            <p className="text-white font-bold text-base leading-tight">
              {isDone ? "Booking Confirmed!" : "Book an Appointment"}
            </p>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8">
          <AnimatePresence mode="wait">

            {/* ── STEP 0: Type selection ──────────────────────── */}
            {wizType === null && (
              <motion.div key="type" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                <p className="text-xl font-bold text-gray-900 mb-1">How would you like to consult?</p>
                <p className="text-sm text-gray-500 mb-6">Choose your preferred appointment type</p>

                <div className="space-y-3">
                  {/* In-Person */}
                  <button onClick={() => handleTypeSelect("offline")}
                    className="w-full bg-white border-2 border-gray-200 hover:border-[#1a3d2b] hover:bg-[#1a3d2b]/5 rounded-2xl p-6 text-left transition-all group">
                    <div className="flex items-start gap-5">
                      <div className="bg-green-100 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-green-200 transition-colors" style={{ width: 64, height: 64 }}>
                        <MapPin size={30} className="text-green-700" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-xl">In-Person Visit</p>
                        <p className="text-gray-500 text-base mt-1.5 leading-relaxed">
                          Visit the clinic in Tirupati. Book a time slot and get hands-on Ayurvedic treatment.
                        </p>
                        <p className="text-sm text-green-700 font-semibold mt-2.5">📍 119, Ramulavari North Mada Street</p>
                      </div>
                    </div>
                  </button>

                  {/* Online */}
                  <button onClick={() => handleTypeSelect("online")}
                    className="w-full bg-white border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 rounded-2xl p-6 text-left transition-all group">
                    <div className="flex items-start gap-5">
                      <div className="bg-blue-100 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-blue-200 transition-colors" style={{ width: 64, height: 64 }}>
                        <Video size={30} className="text-blue-700" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-xl">Online Consultation</p>
                        <p className="text-gray-500 text-base mt-1.5 leading-relaxed">
                          Video call with Dr. Murali Krishna from the comfort of your home. Sunday slots only.
                        </p>
                        <p className="text-sm text-blue-700 font-semibold mt-2.5">🎥 Requires uploading medical reports</p>
                      </div>
                    </div>
                  </button>
                </div>
              </motion.div>
            )}

            {/* ══════════════════════════════════════════════════
                IN-PERSON FLOW
            ══════════════════════════════════════════════════ */}

            {/* OFFLINE: Date picker */}
            {wizType === "offline" && offlineStep === "date" && (
              <motion.div key="offline-date" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                <StepBar steps={["Choose Date", "Choose Time", "Confirm"]} current={0} />
                <p className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Calendar size={20} className="text-[#1a3d2b]" /> Pick a Date
                </p>

                {openMonths.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
                    <AlertCircle size={24} className="mx-auto mb-2 text-amber-500" />
                    <p className="text-sm font-semibold text-amber-800">No months are open for booking yet.</p>
                    <p className="text-xs text-amber-700 mt-1">Please check back later or call the clinic directly.</p>
                  </div>
                ) : (
                  <>
                    {/* Month nav */}
                    <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 mb-4">
                      <div className="flex items-center justify-between mb-4">
                        <button disabled={monthIdx === 0}
                          onClick={() => { setMonthIdx(m => m - 1); setSelectedDate(null); }}
                          className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors font-bold text-lg">
                          ‹
                        </button>
                        <p className="font-bold text-gray-900 text-base">
                          {currentMonth ? format(parseISO(currentMonth + "-01"), "MMMM yyyy") : ""}
                        </p>
                        <button disabled={monthIdx >= openMonths.length - 1}
                          onClick={() => { setMonthIdx(m => m + 1); setSelectedDate(null); }}
                          className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors font-bold text-lg">
                          ›
                        </button>
                      </div>
                      {currentMonth && (
                        <CalendarGrid month={currentMonth} openMonths={openMonths} availability={availability}
                          selectedDate={selectedDate} onSelect={d => setSelectedDate(d)} />
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <button onClick={() => setWizType(null)}
                        className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                        <ArrowLeft size={15} /> Back
                      </button>
                      <button disabled={!selectedDate}
                        onClick={() => { setSelectedSlot(null); setOfflineStep("slots"); }}
                        className="flex items-center gap-2 px-6 py-2.5 bg-[#1a3d2b] text-white rounded-xl font-bold hover:bg-[#1a3d2b]/90 transition-colors disabled:opacity-40 text-sm">
                        Next — Choose Time <ArrowRight size={15} />
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {/* OFFLINE: Time slot picker */}
            {wizType === "offline" && offlineStep === "slots" && (
              <motion.div key="offline-slots" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                <StepBar steps={["Choose Date", "Choose Time", "Confirm"]} current={1} />
                <p className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                  <Clock size={20} className="text-[#1a3d2b]" /> Choose a Time
                </p>
                <p className="text-sm text-gray-500 mb-4">{selectedDate && format(parseISO(selectedDate), "EEEE, d MMMM yyyy")}</p>

                {offlineSlots.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-2xl border border-gray-200">
                    <Clock size={28} className="mx-auto mb-2 text-gray-300" />
                    <p className="text-sm text-gray-500 font-medium">No time slots available for this date.</p>
                    <p className="text-xs text-gray-400 mt-1">Please pick a different date.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {offlineSlots.map(slot => (
                      <button key={slot} onClick={() => setSelectedSlot(slot)}
                        className={[
                          "py-3 rounded-xl text-sm font-bold border transition-all",
                          selectedSlot === slot
                            ? "bg-[#1a3d2b] text-white border-[#1a3d2b] shadow-md"
                            : "border-gray-200 text-gray-800 hover:border-[#1a3d2b]/50 hover:bg-[#1a3d2b]/5",
                        ].join(" ")}>
                        {slot}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <button onClick={() => setOfflineStep("date")}
                    className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                    <ArrowLeft size={15} /> Back
                  </button>
                  <button disabled={!selectedSlot}
                    onClick={() => setOfflineStep("confirm")}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[#1a3d2b] text-white rounded-xl font-bold hover:bg-[#1a3d2b]/90 transition-colors disabled:opacity-40 text-sm">
                    Review Booking <ArrowRight size={15} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* OFFLINE: Confirm */}
            {wizType === "offline" && offlineStep === "confirm" && (
              <motion.div key="offline-confirm" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                <StepBar steps={["Choose Date", "Choose Time", "Confirm"]} current={2} />
                <p className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <CheckCircle2 size={20} className="text-[#1a3d2b]" /> Confirm Booking
                </p>

                {/* Summary card */}
                <div className="bg-[#1a3d2b]/5 border border-[#1a3d2b]/10 rounded-2xl p-4 mb-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <MapPin size={15} className="text-[#1a3d2b] shrink-0" />
                    <p className="text-sm font-semibold text-gray-800">In-Person Visit · Tirupati Clinic</p>
                  </div>
                  <p className="text-base font-bold text-[#1a3d2b] ml-6">
                    {selectedDate && format(parseISO(selectedDate), "EEEE, d MMMM yyyy")}
                  </p>
                  <p className="text-sm font-semibold text-gray-700 ml-6">at {selectedSlot}</p>
                </div>

                {/* Patient info */}
                <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 mb-4">
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">Booking as</p>
                  <p className="text-base font-bold text-gray-900">{patient?.name}</p>
                  {patient?.phone && <p className="text-sm text-gray-500">{patient.phone}</p>}
                </div>

                {!patient?.phone && (
                  <div className="mb-4">
                    <label className="text-sm font-semibold text-gray-700 block mb-1.5">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/30 focus:border-[#1a3d2b] transition-all" />
                  </div>
                )}

                <div className="mb-4">
                  <label className="text-sm font-semibold text-gray-700 block mb-1.5">
                    Reason for Visit <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)}
                    placeholder="e.g. Joint pain, digestive issues, general consultation…"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base resize-none focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/30 focus:border-[#1a3d2b] transition-all" />
                </div>

                {offlineError && <ErrorBanner msg={offlineError} />}

                <div className="flex items-center justify-between gap-3">
                  <button onClick={() => setOfflineStep("slots")}
                    className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                    <ArrowLeft size={15} /> Back
                  </button>
                  <button onClick={submitOffline} disabled={submitting}
                    className="flex items-center gap-2 px-6 py-3 bg-[#1a3d2b] text-white rounded-xl font-bold hover:bg-[#1a3d2b]/90 transition-colors disabled:opacity-60 text-sm shadow-lg">
                    {submitting ? <><Loader2 size={15} className="animate-spin" /> Booking…</> : "Confirm Appointment →"}
                  </button>
                </div>
              </motion.div>
            )}

            {/* OFFLINE: Done */}
            {wizType === "offline" && offlineStep === "done" && (
              <motion.div key="offline-done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="text-center py-6">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 size={40} className="text-emerald-600" />
                </div>
                <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Appointment Requested!</h2>
                <p className="text-gray-500 text-sm mb-1">
                  Your appointment on <strong className="text-gray-800">{selectedDate && format(parseISO(selectedDate), "EEEE, d MMMM")}</strong>
                </p>
                <p className="text-gray-500 text-sm mb-6">at <strong className="text-gray-800">{selectedSlot}</strong> has been submitted.</p>
                <p className="text-xs text-gray-400 mb-8 max-w-xs mx-auto leading-relaxed">
                  The clinic will confirm your booking shortly. You can track the status in your dashboard.
                </p>
                <button onClick={() => { onSuccess(); onClose(); }}
                  className="w-full bg-[#1a3d2b] text-white font-bold py-4 rounded-2xl hover:bg-[#1a3d2b]/90 transition-colors text-base">
                  Back to Dashboard
                </button>
              </motion.div>
            )}

            {/* ══════════════════════════════════════════════════
                ONLINE FLOW
            ══════════════════════════════════════════════════ */}

            {/* ONLINE: Slot picker */}
            {wizType === "online" && onlineStep === "slots" && (
              <motion.div key="online-slots" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                <StepBar steps={["Choose Slot", "Upload Docs", "Confirm"]} current={0} />
                <p className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                  <Video size={20} className="text-blue-600" /> Choose a Slot
                </p>
                <p className="text-sm text-gray-500 mb-4">Video consultation · Sunday slots only</p>

                {onlineError && <ErrorBanner msg={onlineError} />}

                {onlineLoading ? (
                  <div className="flex items-center gap-2 text-gray-500 py-10 justify-center">
                    <Loader2 size={16} className="animate-spin" /> Loading available slots…
                  </div>
                ) : dateGroups.length === 0 ? (
                  <div className="text-center py-10 bg-gray-50 rounded-2xl border border-gray-200">
                    <Video size={32} className="mx-auto mb-3 text-gray-300" />
                    <p className="text-sm font-semibold text-gray-500">No online slots available right now.</p>
                    <p className="text-xs text-gray-400 mt-1">New Sunday slots are added weekly. Check back soon.</p>
                  </div>
                ) : (
                  <div className="space-y-3 mb-4">
                    {dateGroups.map(group => (
                      <div key={group.date} className="bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-200">
                          <p className="font-bold text-gray-900 text-sm">{fmtDate(group.date)}</p>
                          <p className="text-xs text-gray-500">{group.slots.length} slots available</p>
                        </div>
                        <div className="p-3 grid grid-cols-2 gap-2">
                          {group.slots.map(slot => {
                            const sel = onlineSlot?.id === slot.id;
                            return (
                              <button key={slot.id} onClick={() => setOnlineSlot(slot)}
                                className={[
                                  "rounded-xl border px-3 py-3 text-left transition-all",
                                  sel ? "bg-blue-600 border-blue-600 text-white shadow-md"
                                    : "bg-white border-gray-200 hover:border-blue-400 hover:bg-blue-50",
                                ].join(" ")}>
                                <SlotTimeRange date={group.date} start={slot.startTime} end={slot.endTime} selected={sel} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <button onClick={() => setWizType(null)}
                    className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                    <ArrowLeft size={15} /> Back
                  </button>
                  {onlineSlot && (
                    <button onClick={() => setOnlineStep("docs")}
                      className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors text-sm">
                      Next — Upload Docs <ArrowRight size={15} />
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* ONLINE: Docs step */}
            {wizType === "online" && onlineStep === "docs" && (
              <motion.div key="online-docs" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="flex flex-col h-full">
                <StepBar steps={["Choose Slot", "Documents", "Confirm"]} current={1} />
                <p className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                  <FileText size={20} className="text-blue-600" /> Medical Documents
                </p>

                {onlineError && <ErrorBanner msg={onlineError} />}

                {savedDocsLoading ? (
                  <div className="flex items-center gap-2 text-gray-400 text-sm py-6">
                    <Loader2 size={14} className="animate-spin" /> Loading your documents…
                  </div>
                ) : savedDocs.length > 0 ? (
                  /* ── Has existing docs ── */
                  <div className="flex-1 flex flex-col min-h-0">
                    {/* Info banner */}
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 mb-4 flex items-start gap-3">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-800">Dr. Murali Krishna can already see these</p>
                        <p className="text-xs text-emerald-600 mt-0.5">All your uploaded documents are always visible to the doctor — no need to do anything.</p>
                      </div>
                    </div>

                    {/* Doc list */}
                    <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                      {savedDocs.map(doc => (
                        <div key={doc.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl px-3 py-2.5">
                          <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                            <FileText size={14} className="text-blue-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-800 truncate">{doc.name}</p>
                            <p className="text-[10px] text-gray-400">{fmtBytes(doc.size)}</p>
                          </div>
                          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                        </div>
                      ))}
                    </div>

                    {/* Add more */}
                    <div className="mb-4">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Add More (optional)</p>
                      <div onClick={() => fileRef.current?.click()}
                        className="border-2 border-dashed border-gray-200 rounded-2xl p-4 text-center bg-gray-50 hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer">
                        {uploading
                          ? <div className="flex items-center justify-center gap-2 text-blue-600 text-sm"><Loader2 size={14} className="animate-spin" /> Uploading…</div>
                          : <><Upload size={18} className="mx-auto mb-1 text-gray-300" /><p className="text-xs text-gray-400">Tap to upload more documents</p></>}
                        <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.docx"
                          className="hidden" onChange={e => e.target.files && uploadFiles(e.target.files)} />
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="mb-4">
                      <label className="text-sm font-semibold text-gray-700 block mb-1.5">Reason for Consultation <span className="text-gray-400 font-normal">(optional)</span></label>
                      <textarea rows={2} value={onlineReason} onChange={e => setOnlineReason(e.target.value)}
                        placeholder="Brief summary of your health concerns…"
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all" />
                    </div>

                    <div className="flex items-center justify-between gap-3 mt-auto">
                      <button onClick={() => setOnlineStep("slots")} className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                        <ArrowLeft size={15} /> Back
                      </button>
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setOnlineError(""); setOnlineStep("confirm"); }}
                          className="px-4 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl font-semibold hover:bg-gray-50 transition-colors">
                          Skip
                        </button>
                        <button disabled={uploading} onClick={() => { setOnlineError(""); setOnlineStep("confirm"); }}
                          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-60 text-sm">
                          Continue <ArrowRight size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── No docs yet ── */
                  <div className="flex-1 flex flex-col min-h-0">
                    <p className="text-sm text-gray-500 mb-4">You haven't uploaded any documents yet. Adding your reports or test results helps the doctor prepare for your consultation — you can also skip this now.</p>

                    {/* Upload zone */}
                    <div onClick={() => fileRef.current?.click()}
                      className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center bg-gray-50 hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer mb-3 flex-1 flex flex-col items-center justify-center">
                      {uploading
                        ? <div className="flex items-center gap-2 text-blue-600 text-sm"><Loader2 size={16} className="animate-spin" /> Uploading…</div>
                        : <>
                            <Upload size={32} className="mx-auto mb-2.5 text-gray-300" />
                            <p className="font-semibold text-gray-600 text-sm mb-0.5">Tap to upload documents</p>
                            <p className="text-xs text-gray-400">PDF, JPG, PNG, DOCX · Max 10 MB each</p>
                          </>}
                      <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.docx"
                        className="hidden" onChange={e => e.target.files && uploadFiles(e.target.files)} />
                    </div>

                    {/* Newly added this session */}
                    {savedDocs.length > 0 && (
                      <div className="space-y-1.5 mb-3">
                        {savedDocs.map(doc => (
                          <div key={doc.id} className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                            <FileText size={13} className="text-emerald-600 shrink-0" />
                            <p className="flex-1 text-xs font-medium text-gray-800 truncate">{doc.name}</p>
                            <p className="text-[10px] text-gray-400 shrink-0">{fmtBytes(doc.size)}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reason */}
                    <div className="mb-4">
                      <label className="text-sm font-semibold text-gray-700 block mb-1.5">Reason for Consultation <span className="text-gray-400 font-normal">(optional)</span></label>
                      <textarea rows={2} value={onlineReason} onChange={e => setOnlineReason(e.target.value)}
                        placeholder="Brief summary of your health concerns…"
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all" />
                    </div>

                    <div className="flex items-center justify-between gap-3 mt-auto">
                      <button onClick={() => setOnlineStep("slots")} className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                        <ArrowLeft size={15} /> Back
                      </button>
                      <div className="flex items-center gap-2">
                        <button disabled={uploading} onClick={() => { setOnlineError(""); setOnlineStep("confirm"); }}
                          className="px-4 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors">
                          Skip
                        </button>
                        <button disabled={uploading} onClick={() => { setOnlineError(""); setOnlineStep("confirm"); }}
                          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-60 text-sm">
                          Continue <ArrowRight size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ONLINE: Confirm */}
            {wizType === "online" && onlineStep === "confirm" && onlineSlot && (
              <motion.div key="online-confirm" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                <StepBar steps={["Choose Slot", "Documents", "Confirm"]} current={2} />
                <p className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <CheckCircle2 size={20} className="text-blue-600" /> Confirm Booking
                </p>

                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Video size={15} className="text-blue-600 shrink-0" />
                    <p className="text-sm font-semibold text-gray-800">Online Video Consultation</p>
                  </div>
                  <p className="text-base font-bold text-blue-700 ml-6">{fmtDate(onlineSlot.date)}</p>
                  {(() => {
                    const r = slotRangeText(onlineSlot.date, onlineSlot.startTime, onlineSlot.endTime);
                    return (
                      <>
                        <p className="text-sm font-semibold text-gray-700 ml-6">{r.ist}</p>
                        {r.local && <p className="text-xs text-gray-500 ml-6">{r.local}</p>}
                      </>
                    );
                  })()}
                  <p className="text-xs text-gray-500 ml-6">
                    {savedDocs.length > 0
                      ? `${savedDocs.length} document(s) on file — visible to doctor`
                      : "No documents — you can upload them from your dashboard"}
                  </p>
                </div>

                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 text-sm text-emerald-800 flex items-start gap-2 mb-4">
                  <Leaf size={14} className="shrink-0 mt-0.5" />
                  <p>After the consultation, Dr. Murali Krishna will issue your Ayurvedic prescription. You can view it in your dashboard.</p>
                </div>

                {onlineError && <ErrorBanner msg={onlineError} />}

                <div className="flex items-center justify-between gap-3">
                  <button onClick={() => setOnlineStep("docs")}
                    className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                    <ArrowLeft size={15} /> Back
                  </button>
                  <button onClick={submitOnline} disabled={booking}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-60 text-sm shadow-lg">
                    {booking ? <><Loader2 size={15} className="animate-spin" /> Booking…</> : "Confirm Booking →"}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ONLINE: Done */}
            {wizType === "online" && onlineStep === "done" && onlineSlot && (
              <motion.div key="online-done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="text-center py-6">
                <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 size={40} className="text-blue-600" />
                </div>
                <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Booking Confirmed!</h2>
                <p className="text-gray-500 text-sm mb-1">
                  Your online consultation on <strong className="text-gray-800">{fmtDate(onlineSlot.date)}</strong>
                </p>
                {(() => {
                  const r = slotRangeText(onlineSlot.date, onlineSlot.startTime, onlineSlot.endTime);
                  return (
                    <>
                      <p className="text-gray-500 text-sm mb-1">
                        from <strong className="text-gray-800">{r.ist}</strong> is booked.
                      </p>
                      {r.local && <p className="text-gray-400 text-xs mb-5">{r.local}</p>}
                    </>
                  );
                })()}
                <p className="text-xs text-gray-400 mb-8 max-w-xs mx-auto leading-relaxed">
                  Dr. Murali Krishna will review your documents before the session. Keep your dashboard open on the day — you'll hear a chime when he's ready.
                </p>
                <button onClick={() => { onSuccess(); onClose(); }}
                  className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl hover:bg-blue-700 transition-colors text-base">
                  Back to Dashboard
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
