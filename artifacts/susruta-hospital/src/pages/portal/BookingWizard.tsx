import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, MapPin, Video, Calendar, Clock, ArrowRight, ArrowLeft,
  CheckCircle2, AlertCircle, Upload, FileText, Trash2,
  Loader2, Leaf,
} from "lucide-react";
import { patientApi } from "@/lib/patient-api";
import { dualSlotTime, isSlotExceeded, isOfflineSessionExceeded } from "@/lib/ist";
import {
  useListOpenMonths,
  useGetAvailability,
  useGetSlots,
} from "@workspace/api-client-react";
import { getDaysInMonth, startOfMonth, getDay, format, parseISO } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ────────────────────────────────────────────────────────
type OnlineSlot = { id: number; date: string; startTime: string; endTime: string; intervalMinutes: number; slotNumber?: number; isBooked?: boolean; isExceeded?: boolean };
type DateGroup = { date: string; slots: OnlineSlot[] };
type UploadedDoc = { name: string; objectPath: string; contentType: string; size: number };

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
            <div className={`flex items-center gap-1.5 text-xs font-bold shrink-0 ${active ? "text-[#D95B2F]" : done ? "text-emerald-600" : "text-gray-300"}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${active ? "bg-[#D95B2F] text-white" : done ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-400"}`}>
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
  patient: { id: number; name: string; phone?: string; email?: string; emailVerified?: boolean } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function BookingWizard({ patient, onClose, onSuccess }: Props) {
  const [wizType, setWizType] = useState<WizardType | null>(null);
  const [wizardResending, setWizardResending] = useState(false);
  const [wizardResent, setWizardResent] = useState(false);

  async function handleResendVerificationInWizard() {
    setWizardResending(true);
    try {
      const res = await fetch(`${BASE}/api/patient/auth/resend-verification`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setWizardResent(true);
      } else {
        const d = await res.json();
        alert(d.message || "Failed to send verification email.");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setWizardResending(false);
    }
  }

  // ── Offline state ────────────────────────────────────────────
  const [offlineStep, setOfflineStep] = useState<OfflineStep>("date");
  const [monthIdx, setMonthIdx] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [offlineError, setOfflineError] = useState("");

  const currentMonthStr = useMemo(() => format(new Date(), "yyyy-MM"), []);

  const { data: openMonthsRaw = [] } = useListOpenMonths();
  // Available months: strictly starting from current month onwards, excluding any closed by admin
  const openMonths = useMemo(() => {
    const rawMap = new Map<string, boolean>();
    for (const m of (openMonthsRaw as any[])) {
      rawMap.set(m.month, m.isOpen);
    }
    const months: string[] = [];
    const [currYear, currMon] = currentMonthStr.split("-").map(Number);
    for (let i = 0; i < 12; i++) {
      const d = new Date(currYear, currMon - 1 + i, 1);
      const mStr = format(d, "yyyy-MM");
      const isOpen = rawMap.has(mStr) ? rawMap.get(mStr)! : true;
      if (isOpen) {
        months.push(mStr);
      }
    }
    return months;
  }, [openMonthsRaw, currentMonthStr]);

  const currentMonth = openMonths[monthIdx] ?? currentMonthStr;
  const { data: availability } = useGetAvailability({ month: currentMonth }, { query: { enabled: !!currentMonth } });

  // 2 slots based on admin offline slots (Morning 9 AM - 1 PM, Evening 4 PM - 7 PM)
  const [offlineSlotStatus, setOfflineSlotStatus] = useState<{
    morning: { label: string; total: number; booked: number; remaining: number; isAvailable: boolean };
    evening: { label: string; total: number; booked: number; remaining: number; isAvailable: boolean };
  } | null>(null);
  const [loadingOfflineSlots, setLoadingOfflineSlots] = useState(false);

  useEffect(() => {
    if (!selectedDate) {
      setOfflineSlotStatus(null);
      return;
    }
    let cancelled = false;
    setLoadingOfflineSlots(true);
    fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/appointments/offline/slots-status?date=${selectedDate}`, {
      credentials: "include",
    })
      .then(res => res.json())
      .then(data => {
        if (!cancelled) {
          setOfflineSlotStatus({
            morning: data.morning ?? { label: "10 AM - 1 PM", total: 12, booked: 0, remaining: 12, isAvailable: true },
            evening: data.evening ?? { label: "6 PM - 10 PM", total: 16, booked: 0, remaining: 16, isAvailable: true },
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOfflineSlotStatus({
            morning: { label: "10 AM - 1 PM", total: 12, booked: 0, remaining: 12, isAvailable: true },
            evening: { label: "6 PM - 10 PM", total: 16, booked: 0, remaining: 16, isAvailable: true },
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingOfflineSlots(false);
      });

    return () => { cancelled = true; };
  }, [selectedDate]);

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
  const [selectedSessionDate, setSelectedSessionDate] = useState<string | null>(null);
  const [onlineSlot, setOnlineSlot] = useState<OnlineSlot | null>(null);
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [onlineReason, setOnlineReason] = useState("");
  const [booking, setBooking] = useState(false);
  const [onlineError, setOnlineError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function removeDoc(idx: number) {
    setDocs(prev => prev.filter((_, i) => i !== idx));
  }

  function resetWizard() {
    setWizType(null);
    setOfflineStep("date");
    setMonthIdx(0);
    setSelectedDate(null);
    setSelectedSlot(null);
    setReason("");
    setPhone("");
    setSubmitting(false);
    setOfflineError("");
    setOfflineSlotStatus(null);
    setLoadingOfflineSlots(false);
    setOnlineStep("slots");
    setDateGroups([]);
    setOnlineLoading(false);
    setSelectedSessionDate(null);
    setOnlineSlot(null);
    setDocs([]);
    setUploading(false);
    setOnlineReason("");
    setBooking(false);
    setOnlineError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose() {
    resetWizard();
    onClose();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function fetchOnlineSlots() {
    setOnlineLoading(true);
    setOnlineError("");
    fetch(`${BASE}/api/online-slots/available`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setDateGroups(data);
        }
      })
      .catch(() => setOnlineError("Failed to load slots."))
      .finally(() => setOnlineLoading(false));
  }

  function handleTypeSelect(type: WizardType) {
    setWizType(type);
    if (type === "online") {
      fetchOnlineSlots();
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
        // Add to this consultation's attached docs
        setDocs(prev => [...prev, {
          name: file.name,
          objectPath,
          contentType: file.type,
          size: file.size,
        }]);

        // Save to patient's document library in the background
        fetch(`${BASE}/api/patient/documents`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, objectPath, contentType: file.type, size: file.size }),
        }).catch(() => {});
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
        body: JSON.stringify({
          slotId: onlineSlot.id,
          reason: onlineReason.trim() || undefined,
          documents: docs.map(d => ({
            name: d.name,
            objectPath: d.objectPath,
            contentType: d.contentType,
            size: d.size,
          })),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw data;

      // Optimistically decrease slots available count by removing booked slot
      setDateGroups(prev => prev.map(g =>
        g.date === onlineSlot.date
          ? { ...g, slots: g.slots.filter(s => s.id !== onlineSlot.id) }
          : g
      ));

      setOnlineStep("done");
    } catch (err: any) {
      if (err?.error === "slot_taken") {
        setOnlineError("This slot was just booked. Please pick another.");
        fetchOnlineSlots();
      } else {
        setOnlineError(err?.message || "Booking failed. Please try again.");
      }
    } finally {
      setBooking(false);
    }
  }

  // ── Modal shell ──────────────────────────────────────────────
  const isDone = (wizType === "offline" && offlineStep === "done") || (wizType === "online" && onlineStep === "done");

  return (
    <div onClick={handleClose} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm font-sans font-['DM_Sans',sans-serif]">
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="bg-white w-full max-w-3xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{ height: "90vh", maxHeight: "90vh" }}
      >
        {/* Modal header */}
        <div className="bg-[#D95B2F] px-6 py-5 flex items-center gap-3 shrink-0">
          <div className="flex-1">
            <p className="text-white/60 text-xs font-medium tracking-wider">
              {wizType === null ? "Appointment" : wizType === "offline" ? "Offline Consultation" : "Online Consultation"}
            </p>
            <p className="text-white font-bold text-base leading-tight">
              {isDone ? "Booking Confirmed!" : "Book Appointment"}
            </p>
          </div>
          <button onClick={handleClose}
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
                        <p className="font-bold text-gray-900 text-xl">Offline Consultation</p>
                        <p className="text-gray-500 text-base mt-1.5 leading-relaxed">
                          Visit the clinic in Tirupati. Book a time slot and get hands-on Ayurvedic treatment.
                        </p>
                        <p className="text-sm text-green-700 font-semibold mt-2.5">📍 119, Ramulavari North Mada Street</p>
                      </div>
                    </div>
                  </button>

                  {/* Online */}
                  <button onClick={() => handleTypeSelect("online")}
                    className="w-full bg-white border-2 border-gray-200 hover:border-red-400 hover:bg-red-50 rounded-2xl p-6 text-left transition-all group">
                    <div className="flex items-start gap-5">
                      <div className="bg-red-100 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-red-200 transition-colors" style={{ width: 64, height: 64 }}>
                        <Video size={30} className="text-[#D95B2F]" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-xl">Online Consultation</p>
                        <p className="text-gray-500 text-base mt-1.5 leading-relaxed">
                          Video call with Dr. Murali Krishna from the comfort of your home. Sunday slots only.
                        </p>
                        <p className="text-sm text-gray-500 font-semibold mt-2.5">🎥 Requires uploading medical reports</p>
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
                  <Calendar size={20} className="text-[#D95B2F]" /> Pick a Date
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
                        <button disabled={monthIdx <= 0}
                          onClick={() => { setMonthIdx(m => m - 1); setSelectedDate(null); }}
                          className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-bold text-lg"
                          title="Previous month"
                        >
                          ‹
                        </button>
                        <p className="font-bold text-gray-900 text-base">
                          {currentMonth ? format(parseISO(currentMonth + "-01"), "MMMM yyyy") : ""}
                        </p>
                        <button disabled={monthIdx >= openMonths.length - 1}
                          onClick={() => { setMonthIdx(m => m + 1); setSelectedDate(null); }}
                          className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-bold text-lg"
                          title="Next month"
                        >
                          ›
                        </button>
                      </div>
                      {currentMonth && (
                        <CalendarGrid month={currentMonth} openMonths={openMonths} availability={availability}
                          selectedDate={selectedDate} onSelect={d => setSelectedDate(d)} />
                      )}
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
                  <Clock size={20} className="text-[#D95B2F]" /> Choose a Time
                </p>
                <p className="text-sm text-gray-500 mb-4">{selectedDate && format(parseISO(selectedDate), "EEEE, d MMMM yyyy")}</p>

                {loadingOfflineSlots ? (
                  <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
                    <Loader2 size={16} className="animate-spin text-[#1a3d2b]" /> Loading available slots…
                  </div>
                ) : (
                  <div className="space-y-3 mb-4">
                    {selectedDate && (
                      isOfflineSessionExceeded(selectedDate, "morning") || (offlineSlotStatus?.morning?.remaining ?? 0) <= 0 || !offlineSlotStatus?.morning?.isAvailable
                    ) && (
                      isOfflineSessionExceeded(selectedDate, "evening") || (offlineSlotStatus?.evening?.remaining ?? 0) <= 0 || !offlineSlotStatus?.evening?.isAvailable
                    ) && (
                      <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2 mb-3">
                        <AlertCircle size={15} className="shrink-0 text-red-500" />
                        <span>No consultation slots are available for this date. All sessions have either been booked or session timings have passed. Please select another date.</span>
                      </div>
                    )}
                    {[
                      {
                        id: "morning",
                        label: "10 AM - 1 PM",
                        title: "Morning Consultation",
                        status: offlineSlotStatus?.morning,
                      },
                      {
                        id: "evening",
                        label: "6 PM - 10 PM",
                        title: "Evening Consultation",
                        status: offlineSlotStatus?.evening,
                      },
                    ].map((session) => {
                      const isSelected = selectedSlot === session.label;
                      const isExceeded = selectedDate ? isOfflineSessionExceeded(selectedDate, session.id as "morning" | "evening") : false;
                      const remaining = isExceeded ? 0 : (session.status?.remaining ?? 0);
                      const isAvailable = !isExceeded && (session.status?.isAvailable ?? true) && remaining > 0;

                      return (
                        <button
                          key={session.id}
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => {
                            if (isAvailable) setSelectedSlot(session.label);
                          }}
                          className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between ${
                            !isAvailable
                              ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed opacity-60"
                              : isSelected
                              ? "bg-[#1a3d2b] border-[#1a3d2b] text-white shadow-md ring-2 ring-[#1a3d2b]/20 cursor-pointer"
                              : "bg-white border-gray-200 hover:border-[#1a3d2b]/50 hover:bg-[#1a3d2b]/5 text-gray-800 cursor-pointer"
                          }`}
                        >
                          <div className="flex items-center gap-3.5">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? "bg-white/20 text-white"
                                  : !isAvailable
                                  ? "bg-gray-100 text-gray-400"
                                  : "bg-[#1a3d2b]/10 text-[#1a3d2b]"
                              }`}
                            >
                              <Clock size={20} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-base">{session.label}</span>
                                <span className={`text-xs font-medium ${isSelected ? "text-white/80" : "text-gray-500"}`}>
                                  ({session.title})
                                </span>
                              </div>
                              <span className={`text-xs ${isSelected ? "text-white/70" : "text-gray-400"}`}>
                                15 mins duration per consultation
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span
                              className={`text-xs px-3 py-1 rounded-full font-bold ${
                                !isAvailable
                                  ? "bg-red-100 text-red-600 border border-red-200"
                                  : isSelected
                                  ? "bg-white text-[#1a3d2b]"
                                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              }`}
                            >
                              {isAvailable
                                ? `${remaining} Slots Available`
                                : selectedDate && new Date(selectedDate + "T12:00:00+05:30").getDay() === 0 && session.id === "evening"
                                ? "Closed on Sunday"
                                : "No slots available"}
                            </span>
                            {isSelected && <CheckCircle2 size={18} className="text-white shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* OFFLINE: Confirm */}
            {wizType === "offline" && offlineStep === "confirm" && (
              <motion.div key="offline-confirm" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                <StepBar steps={["Choose Date", "Choose Time", "Confirm"]} current={2} />
                <p className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <CheckCircle2 size={20} className="text-[#D95B2F]" /> Confirm Booking
                </p>

                {/* Summary card */}
                <div className="bg-[#1a3d2b]/5 border border-[#1a3d2b]/10 rounded-2xl p-4 mb-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <MapPin size={15} className="text-[#1a3d2b] shrink-0" />
                    <p className="text-sm font-semibold text-gray-800">Offline Visit · Tirupati Clinic</p>
                  </div>
                  <p className="text-base font-bold text-[#1a3d2b] ml-6">
                    {selectedDate && format(parseISO(selectedDate), "EEEE, d MMMM yyyy")}
                  </p>
                  <p className="text-sm font-semibold text-gray-700 ml-6">at {selectedSlot}</p>
                </div>

                {/* Patient info */}
                <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 mb-4">
                  <p className="text-xs text-gray-400 font-bold tracking-wider mb-2">Booking as</p>
                  <p className="text-base font-bold text-gray-900">{patient?.name}</p>
                  {patient?.phone && <p className="text-sm text-gray-500">{patient.phone}</p>}
                </div>

                {!patient?.phone && (
                  <div className="mb-4">
                    <label className="text-sm font-semibold text-gray-700 block mb-1.5">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      maxLength={10}
                      placeholder="10-digit mobile number"
                      inputMode="numeric"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/30 focus:border-[#1a3d2b] transition-all tracking-wider"
                    />
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
                <button onClick={() => { handleClose(); onSuccess(); }}
                  className="w-[200px] bg-[#D95B2F] text-white font-bold py-4 rounded-2xl hover:bg-[#D95B2F]/90 transition-colors text-base">
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
                  <Video size={20} className="text-[#D95B2F]" /> Choose a Slot
                </p>
                <p className="text-sm text-gray-500 mb-4">Video consultation · Sunday slots only</p>

                {onlineError && <ErrorBanner msg={onlineError} />}

                {onlineLoading ? (
                  <div className="flex items-center gap-2 text-gray-500 py-10 justify-center">
                    <Loader2 size={16} className="animate-spin" /> Loading available slots…
                  </div>
                ) : (dateGroups.length === 0 || dateGroups.every(g => g.slots.filter(s => !s.isBooked && !isSlotExceeded(g.date, s.startTime) && !s.isExceeded).length === 0)) ? (
                  <div className="text-center py-10 bg-gray-50 rounded-2xl border border-gray-200">
                    <Video size={32} className="mx-auto mb-3 text-red-400" />
                    <p className="text-base font-bold text-red-600">Slots are not available</p>
                    <p className="text-xs text-gray-400 mt-1">All online consultation slots are currently booked or have ended. Please check back later.</p>
                  </div>
                ) : (
                  <div className="space-y-3 mb-4">
                    {dateGroups.map(group => {
                      const availableSlots = group.slots.filter(s => !s.isBooked && !isSlotExceeded(group.date, s.startTime) && !s.isExceeded);
                      const allUnavailable = availableSlots.length === 0;
                      return (
                        <div key={group.date} className="bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden">
                          <div className="px-5 py-3.5 border-b border-gray-200 flex items-center justify-between bg-white">
                            <div>
                              <p className="font-bold text-gray-900 text-sm">{fmtDate(group.date)}</p>
                              <p className={`text-xs mt-0.5 font-medium ${allUnavailable ? "text-[#D95B2F] font-semibold" : "text-gray-500"}`}>
                                10 AM – 1 PM <span className="ml-1">
                                              {allUnavailable ? "0 available slots" : `${availableSlots.length} available slots`}
                                            </span>
                              </p>
                            </div>
                            {allUnavailable && (
                              <span className="text-[11px] font-bold text-[#D95B2F] bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                                Slots are not available
                              </span>
                            )}
                          </div>

                          <div className="p-4">
                            {allUnavailable ? (
                              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2 mb-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                <span>Slots are not available for this date. All consultation slots have been booked or time slots have passed.</span>
                              </div>
                            ) : null}
                            <div>
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                                  <Clock size={14} className="text-[#D95B2F]" />
                                  Select Consultation Timing (15 mins duration):
                                </p>
                                {onlineSlot && onlineSlot.date === group.date && (
                                  <span className="text-[11px] font-semibold text-[#D95B2F] bg-red-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                                    Selected: {fmtTime(onlineSlot.startTime)} – {fmtTime(onlineSlot.endTime)}
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                                {group.slots.map((slot) => {
                                  const isExceeded = isSlotExceeded(group.date, slot.startTime) || slot.isExceeded;
                                  const isSlotAvailable = !slot.isBooked && !isExceeded;
                                  const isSlotSelected = onlineSlot?.id === slot.id;
                                  return (
                                    <button
                                      key={slot.id}
                                      type="button"
                                      disabled={!isSlotAvailable}
                                      onClick={() => {
                                        if (isSlotAvailable) setOnlineSlot(slot);
                                      }}
                                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                                        !isSlotAvailable
                                          ? "bg-gray-100/70 border-gray-200 text-gray-400 cursor-not-allowed opacity-60"
                                          : isSlotSelected
                                          ? "bg-[#D95B2F]/10 border-[#D95B2F] text-[#D95B2F] shadow-sm ring-2 ring-[#D95B2F]/30 cursor-pointer"
                                          : "bg-white border-gray-200 hover:border-red-400 hover:bg-blue-50/40 text-gray-800 cursor-pointer"
                                      }`}
                                    >
                                      <div className="flex items-center justify-between w-full">
                                        <span className="text-xs font-bold leading-tight">
                                          {fmtTime(slot.startTime)} – {fmtTime(slot.endTime)}
                                        </span>
                                        {isSlotSelected && (
                                          <CheckCircle2 size={13} className="text-[#D95B2F] shrink-0 ml-1" />
                                        )}
                                      </div>
                                      <span className={`text-[10px] mt-1.5 font-medium ${
                                        !isSlotAvailable
                                          ? "text-red-500 font-semibold"
                                          : isSlotSelected
                                          ? "text-[#D95B2F]"
                                          : "text-gray-400"
                                      }`}>
                                        {!isSlotAvailable
                                          ? (slot.isBooked ? "Booked" : "Time passed")
                                          : "15 mins duration"}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* ONLINE: Docs step */}
            {wizType === "online" && onlineStep === "docs" && (
              <motion.div key="online-docs" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="flex flex-col h-full">
                <StepBar steps={["Choose Slot", "Documents", "Confirm"]} current={1} />
                <p className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                  <FileText size={20} className="text-[#D95B2F]" /> Medical Documents
                </p>

                {onlineError && <ErrorBanner msg={onlineError} />}

                <div className="flex-1 flex flex-col min-h-0">
                  <p className="text-sm text-gray-500 mb-4">
                    Attach any medical reports, test results, or prescriptions for this consultation. You can also skip this step.
                  </p>

                  {/* Upload zone */}
                  <div onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-gray-300 rounded-2xl p-6 text-center bg-gray-50 hover:border-red-400 hover:bg-red-50 transition-colors cursor-pointer mb-3 flex flex-col items-center justify-center">
                    {uploading
                      ? <div className="flex items-center gap-2 text-blue-600 text-sm"><Loader2 size={16} className="animate-spin" /> Uploading…</div>
                      : <>
                          <Upload size={28} className="mx-auto mb-2 text-gray-400" />
                          <p className="font-semibold text-gray-700 text-sm mb-0.5">Tap to upload documents</p>
                          <p className="text-xs text-gray-400">PDF, JPG, PNG, DOCX · Max 10 MB each</p>
                        </>}
                    <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.docx"
                      className="hidden" onChange={e => e.target.files && uploadFiles(e.target.files)} />
                  </div>

                  {/* Attached docs for this consultation */}
                  {docs.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {docs.map((doc, idx) => (
                        <div key={idx} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-3 py-2">
                          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                            <FileText size={14} className="text-[#D95B2F]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-800 truncate">{doc.name}</p>
                            <p className="text-[10px] text-gray-400">{fmtBytes(doc.size)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeDoc(idx)}
                            className="text-gray-400 hover:text-red-500 p-1 transition-colors"
                            title="Remove document"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reason */}
                  <div className="mb-4">
                    <label className="text-sm font-semibold text-gray-700 block mb-1.5">
                      Reason for Consultation <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <textarea rows={2} value={onlineReason} onChange={e => setOnlineReason(e.target.value)}
                      placeholder="Brief summary of your health concerns…"
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all" />
                  </div>
                </div>
              </motion.div>
            )}

            {/* ONLINE: Confirm */}
            {wizType === "online" && onlineStep === "confirm" && onlineSlot && (
              <motion.div key="online-confirm" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                <StepBar steps={["Choose Slot", "Documents", "Confirm"]} current={2} />
                <p className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <CheckCircle2 size={20} className="text-[#D95B2F]" /> Confirm Booking
                </p>

                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Video size={15} className="text-gray-700 shrink-0" />
                    <p className="text-sm font-semibold text-gray-800">Online Video Consultation</p>
                  </div>
                  <p className="text-base font-bold text-gray-700 ml-6">{fmtDate(onlineSlot.date)}</p>
                  <p className="text-sm font-semibold text-gray-700 ml-6">
                    {fmtTime(onlineSlot.startTime)} – {fmtTime(onlineSlot.endTime)} (15 mins duration)
                  </p>
                  <p className="text-xs text-gray-500 ml-6">
                    {docs.length > 0
                      ? `${docs.length} document(s) attached`
                      : "No documents attached"}
                  </p>
                </div>

                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 text-sm text-emerald-800 flex items-start gap-2 mb-4">
                  <Leaf size={14} className="shrink-0 mt-0.5" />
                  <p>After the consultation, Dr. Murali Krishna will issue your Ayurvedic prescription. You can view it in your dashboard.</p>
                </div>

                {patient?.email && !patient?.emailVerified && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-800 flex items-start gap-2 mb-4">
                    <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-600" />
                    <div>
                      <p className="font-semibold text-amber-900">Email unverified</p>
                      <p className="mt-0.5">Booking will proceed, but remember to verify your email (<span className="font-medium">{patient.email}</span>) from your dashboard to receive video call updates.</p>
                    </div>
                  </div>
                )}

                {onlineError && (
                  <div className="mb-4 bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-800">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-semibold">{onlineError}</p>
                        {onlineError.toLowerCase().includes("verify") && (
                          <div className="mt-2.5 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleResendVerificationInWizard}
                              disabled={wizardResending}
                              className="text-xs font-bold text-red-900 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-xl border border-red-300 transition-colors inline-flex items-center gap-1.5 shadow-sm"
                            >
                              {wizardResending ? <Loader2 size={12} className="animate-spin" /> : null}
                              {wizardResent ? "Verification email sent! Check inbox" : "Resend verification email"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ONLINE: Done */}
            {wizType === "online" && onlineStep === "done" && onlineSlot && (
              <motion.div key="online-done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="text-center py-6">
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 size={40} className="text-[#D95B2F]" />
                </div>
                <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Booking Confirmed!</h2>
                <p className="text-gray-500 text-sm mb-1">
                  Your online consultation on <strong className="text-gray-800">{fmtDate(onlineSlot.date)}</strong>
                </p>
                <p className="text-gray-500 text-sm mb-1">
                  at <strong className="text-gray-800">{fmtTime(onlineSlot.startTime)} – {fmtTime(onlineSlot.endTime)} (15 mins duration)</strong> is booked.
                </p>
                <p className="text-xs text-gray-400 mb-8 max-w-xs mx-auto leading-relaxed">
                  Dr. Murali Krishna will review your documents before the session. Keep your dashboard open on the day — you'll hear a chime when he's ready.
                </p>
                <button onClick={() => { handleClose(); onSuccess(); }}
                  className="w-[200px] bg-[#D95B2F] text-white font-bold py-4 rounded-2xl hover:bg-[#D95B2F]/90 transition-colors text-base">
                  Back to Dashboard
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Fixed Bottom Action Bar */}
        {wizType !== null && !isDone && (
          <div className="bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] z-20">
            {/* OFFLINE FOOTER */}
            {wizType === "offline" && (
              <>
                {offlineStep === "date" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setWizType(null)}
                      className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <ArrowLeft size={15} /> Back
                    </button>
                    <button
                      type="button"
                      disabled={!selectedDate}
                      onClick={() => { setSelectedSlot(null); setOfflineStep("slots"); }}
                      className="flex items-center gap-2 px-6 py-2.5 bg-[#D95B2F] text-white rounded-xl font-bold hover:bg-[#D95B2F]/90 transition-colors disabled:opacity-40 text-sm shadow-sm"
                    >
                      Next <ArrowRight size={15} />
                    </button>
                  </>
                )}
                {offlineStep === "slots" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setOfflineStep("date")}
                      className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <ArrowLeft size={15} /> Back
                    </button>
                    <button
                      type="button"
                      disabled={
                        !selectedSlot ||
                        !selectedDate ||
                        (selectedSlot === "9 AM - 1 PM" && (isOfflineSessionExceeded(selectedDate, "morning") || (offlineSlotStatus?.morning?.remaining ?? 0) <= 0)) ||
                        (selectedSlot === "4 PM - 7 PM" && (isOfflineSessionExceeded(selectedDate, "evening") || (offlineSlotStatus?.evening?.remaining ?? 0) <= 0))
                      }
                      onClick={() => setOfflineStep("confirm")}
                      className="flex items-center gap-2 px-6 py-2.5 bg-[#D95B2F] text-white rounded-xl font-bold hover:bg-[#D95B2F]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm shadow-sm"
                    >
                      Next <ArrowRight size={15} />
                    </button>
                  </>
                )}
                {offlineStep === "confirm" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setOfflineStep("slots")}
                      className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <ArrowLeft size={15} /> Back
                    </button>
                    <button
                      type="button"
                      onClick={submitOffline}
                      disabled={submitting}
                      className="flex items-center gap-2 px-6 py-3 bg-[#D95B2F] text-white rounded-xl font-bold hover:bg-[#D95B2F]/90 transition-colors disabled:opacity-60 text-sm shadow-lg"
                    >
                      {submitting ? <><Loader2 size={15} className="animate-spin" /> Booking…</> : "Confirm"}
                    </button>
                  </>
                )}
              </>
            )}

            {/* ONLINE FOOTER */}
            {wizType === "online" && (
              <>
                {onlineStep === "slots" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setWizType(null)}
                      className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <ArrowLeft size={15} /> Back
                    </button>
                    <button
                      type="button"
                      disabled={!onlineSlot || onlineSlot.isBooked || isSlotExceeded(onlineSlot.date, onlineSlot.startTime) || !!onlineSlot.isExceeded}
                      onClick={() => setOnlineStep("docs")}
                      className="flex items-center gap-2 px-6 py-2.5 bg-[#D95B2F] text-white rounded-xl font-bold hover:bg-[#D95B2F]/90 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                    >
                      Next <ArrowRight size={15} />
                    </button>
                  </>
                )}
                {onlineStep === "docs" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setOnlineStep("slots")}
                      className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <ArrowLeft size={15} /> Back
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => { setOnlineError(""); setOnlineStep("confirm"); }}
                        className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors"
                      >
                        Skip
                      </button>
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => { setOnlineError(""); setOnlineStep("confirm"); }}
                        className="flex items-center gap-2 px-6 py-2.5 bg-[#D95B2F] text-white rounded-xl font-bold hover:bg-[#D95B2F]/90 transition-colors disabled:opacity-60 text-sm shadow-md"
                      >
                        Next <ArrowRight size={15} />
                      </button>
                    </div>
                  </>
                )}
                {onlineStep === "confirm" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setOnlineStep("docs")}
                      className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <ArrowLeft size={15} /> Back
                    </button>
                    <button
                      type="button"
                      onClick={submitOnline}
                      disabled={booking}
                      className="flex items-center gap-2 px-6 py-3 bg-[#D95B2F] text-white rounded-xl font-bold hover:bg-[#D95B2F]/90 transition-colors disabled:opacity-60 text-sm shadow-lg"
                    >
                      {booking ? <><Loader2 size={15} className="animate-spin" /> Booking…</> : "Confirm"}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
