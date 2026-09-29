import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Clock, ArrowLeft, CheckCircle2, Leaf, AlertCircle, Video, MapPin } from "lucide-react";
import { patientApi } from "@/lib/patient-api";
import { isOfflineSessionExceeded, isSlotExceeded } from "@/lib/ist";
import { EmailVerificationGate } from "@/components/EmailVerificationGate";
import { MathCaptcha } from "@/components/MathCaptcha";

import {
  useListOpenMonths,
  useGetAvailability,
  useGetSlots,
} from "@workspace/api-client-react";

import { getDaysInMonth, startOfMonth, getDay, format, parseISO } from "date-fns";
import logoImg from "@assets/logo_1773840200056.png";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

type Patient = { id: number; name: string; email: string; phone?: string };

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function toYMD(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function CalendarGrid({
  month, openMonths, availability, selectedDate, onSelect,
}: {
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
      {DAYS.map((d) => (
        <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
      ))}
      {cells.map((day, i) => {
        if (!day) return <div key={`e${i}`} />;
        const dateStr = `${month}-${String(day).padStart(2, "0")}`;
        const isPast = dateStr < today;
        const isSunday = getDay(new Date(dateStr + "T12:00:00")) === 0;
        const isBlocked =
          !isMonthOpen ||
          isSunday ||
          blockedDates.includes(dateStr) ||
          blockedDays.includes(getDay(new Date(dateStr + "T12:00:00")));
        const isDisabled = isPast || isBlocked;
        const isSelected = dateStr === selectedDate;
        const isToday = dateStr === today;

        return (
          <button
            key={dateStr}
            disabled={isDisabled}
            onClick={() => onSelect(dateStr)}
            className={[
              "w-full aspect-square rounded-xl text-sm font-medium transition-all",
              isSelected
                ? "bg-[#1a3d2b] text-white shadow-md scale-105"
                : isDisabled
                ? "text-muted-foreground/30 cursor-not-allowed"
                : isToday
                ? "bg-primary/10 text-primary font-bold ring-1 ring-primary/30 hover:bg-primary/20"
                : "hover:bg-primary/10 text-foreground",
            ].join(" ")}
          >
            {day}
          </button>
        );
      })}
    </div>
  );
}

export default function PortalBook() {
  const [, navigate] = useLocation();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [apptType, setApptType] = useState<"offline" | "online" | null>(null);
  const [hasOnlineSlots, setHasOnlineSlots] = useState(false);

  const [monthIdx, setMonthIdx] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [phone, setPhone] = useState("");

  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [bypassGate, setBypassGate] = useState(false);
  const [captchaOk, setCaptchaOk] = useState(false);

  const currentMonthStr = React.useMemo(() => format(new Date(), "yyyy-MM"), []);

  const { data: openMonthsRaw = [] } = useListOpenMonths();
  // Available months: strictly starting from current month onwards, excluding any closed by admin
  const openMonths = React.useMemo(() => {
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

  const currentMonth: string = openMonths[monthIdx] ?? currentMonthStr;
  const { data: availability } = useGetAvailability({ month: currentMonth }, { query: { enabled: !!currentMonth } });

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
    fetch(`${BASE_URL}/api/appointments/offline/slots-status?date=${selectedDate}`, {
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

  useEffect(() => {
    patientApi.me()
      .then(async (p) => {
        if (!p || !p.id) {
          navigate("/portal?next=/portal/book", { replace: true });
          return;
        }
        setPatient(p);
        setEmailVerified(p.emailVerified);
        // Check if there are available online slots
        try {
          const r = await fetch(`${BASE_URL}/api/online-slots/available`, { credentials: "include" });
          const dateGroups = await r.json();
          const hasAny = Array.isArray(dateGroups) && dateGroups.some((g: any) =>
            Array.isArray(g.slots) && g.slots.some((s: any) => !s.isBooked && !s.isExceeded && !isSlotExceeded(g.date, s.startTime))
          );
          setHasOnlineSlots(hasAny);
        } catch { setHasOnlineSlots(false); }
        setLoading(false);
      })
      .catch(() => navigate("/portal?next=/portal/book", { replace: true }));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDate || !selectedSlot || !patient) return;
    setError("");
    setSubmitting(true);
    const effectivePhone = patient.phone ?? phone.trim();
    if (effectivePhone.length < 6) {
      setError("Please enter a valid phone number.");
      setSubmitting(false);
      return;
    }
    try {
      await patientApi.bookAppointment({
        date: selectedDate,
        timeSlot: selectedSlot,
        reason: reason.trim() || undefined,
        patientName: patient.name,
        patientPhone: effectivePhone,
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message ?? "Booking failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (emailVerified === false && !bypassGate) {
    return <EmailVerificationGate email={patient?.email ?? ""} onBack={() => navigate("/portal/dashboard")} onProceed={() => setBypassGate(true)} />;
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-green-50 to-white px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 200 }}
          className="text-center max-w-sm"
        >
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-foreground mb-2">Appointment Requested!</h2>
          <p className="text-muted-foreground text-sm mb-2">
            Your appointment on <strong>{format(parseISO(selectedDate!), "EEEE, d MMMM")}</strong> at <strong>{selectedSlot}</strong> has been submitted.
          </p>
          <p className="text-muted-foreground text-xs mb-8">
            The clinic will review and confirm your booking shortly. You can track the status in your dashboard.
          </p>
          <button
            onClick={() => navigate("/portal/dashboard")}
            className="w-full bg-[#1a3d2b] text-white font-bold py-3 rounded-2xl hover:bg-[#1a3d2b]/90 transition-colors"
          >
            Go to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Type selector ───────────────────────────────────────────
  if (apptType === null) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex flex-col">
        <div className="bg-white border-b border-border px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/portal/dashboard")} className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground">
            <ArrowLeft size={18} />
          </button>
          <img src={logoImg} alt="Susruta Hospital" className="h-8 object-contain" />
          <div>
            <p className="text-sm font-bold text-foreground leading-tight">Book Appointment</p>
            <p className="text-xs text-muted-foreground">Dr. P. Murali Krishna</p>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm space-y-4">
            <div className="text-center mb-8">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Leaf size={28} className="text-primary" />
              </div>
              <h2 className="text-xl font-serif font-bold text-foreground">How would you like to consult?</h2>
              <p className="text-muted-foreground text-sm mt-2">Choose your preferred appointment type</p>
            </div>

            {/* In-Person */}
            <button
              onClick={() => setApptType("offline")}
              className="w-full bg-white border-2 border-border hover:border-primary/40 hover:bg-primary/5 rounded-2xl p-5 text-left transition-all group shadow-sm"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-green-200 transition-colors">
                  <MapPin size={22} className="text-green-700" />
                </div>
                <div>
                  <p className="font-bold text-foreground text-base">In-Person Visit</p>
                  <p className="text-muted-foreground text-sm mt-1 leading-relaxed">Visit the clinic in Tirupati. Book a time slot and get hands-on Ayurvedic consultation.</p>
                  <p className="text-xs text-green-700 font-medium mt-2">119, Ramulavari North Mada Street</p>
                </div>
              </div>
            </button>

            {/* Online Consultation */}
            <button
              onClick={() => hasOnlineSlots ? navigate("/portal/online-book") : undefined}
              disabled={!hasOnlineSlots}
              className={[
                "w-full border-2 rounded-2xl p-5 text-left transition-all group shadow-sm",
                hasOnlineSlots
                  ? "bg-white border-border hover:border-blue-400 hover:bg-blue-50 cursor-pointer"
                  : "bg-gray-50 border-dashed border-gray-200 cursor-not-allowed opacity-60",
              ].join(" ")}
            >
              <div className="flex items-start gap-4">
                <div className={["w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                  hasOnlineSlots ? "bg-blue-100 group-hover:bg-blue-200" : "bg-gray-100"].join(" ")}>
                  <Video size={22} className={hasOnlineSlots ? "text-blue-700" : "text-gray-400"} />
                </div>
                <div>
                  <p className="font-bold text-foreground text-base flex items-center gap-2">
                    Online Consultation
                    {!hasOnlineSlots && <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 bg-gray-200 text-gray-500 rounded-full">Not Available</span>}
                  </p>
                  <p className="text-muted-foreground text-sm mt-1 leading-relaxed">Video call with Dr. Murali Krishna from the comfort of your home. Sunday slots only.</p>
                  {hasOnlineSlots
                    ? <p className="text-xs text-blue-700 font-medium mt-2">Slots available — upload medical reports required</p>
                    : <p className="text-xs text-gray-400 font-medium mt-2">No slots currently open. Check back soon.</p>}
                </div>
              </div>
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-border px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => setApptType(null)}
          className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground">
          <ArrowLeft size={18} />
        </button>
        <img src={logoImg} alt="Susruta Hospital" className="h-8 object-contain" />
        <div>
          <p className="text-sm font-bold text-foreground leading-tight">In-Person Appointment</p>
          <p className="text-xs text-muted-foreground">Dr. P. Murali Krishna</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Month navigator */}
        {openMonths.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
            <AlertCircle size={24} className="mx-auto mb-2 text-amber-500" />
            <p className="text-sm font-semibold text-amber-800">No months are currently open for booking.</p>
            <p className="text-xs text-amber-700 mt-1">Please check back later or call the clinic directly.</p>
          </div>
        ) : (
          <>
            {/* Month selector */}
            <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <button
                  disabled={monthIdx <= 0}
                  onClick={() => { setMonthIdx(m => m - 1); setSelectedDate(null); setSelectedSlot(null); }}
                  className="p-2 rounded-xl hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Previous month"
                >
                  ‹
                </button>
                <p className="font-serif font-bold text-foreground text-base">
                  {currentMonth ? format(parseISO(currentMonth + "-01"), "MMMM yyyy") : ""}
                </p>
                <button
                  disabled={monthIdx >= openMonths.length - 1}
                  onClick={() => { setMonthIdx(m => m + 1); setSelectedDate(null); setSelectedSlot(null); }}
                  className="p-2 rounded-xl hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Next month"
                >
                  ›
                </button>
              </div>
              {currentMonth && (
                <CalendarGrid
                  month={currentMonth}
                  openMonths={openMonths}
                  availability={availability}
                  selectedDate={selectedDate}
                  onSelect={(d) => { setSelectedDate(d); setSelectedSlot(null); }}
                />
              )}
            </div>

            {/* Time slots */}
            <AnimatePresence>
              {selectedDate && (
                <motion.div
                  key="slots"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-white rounded-2xl border border-border p-4 shadow-sm"
                >
                  <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Clock size={14} className="text-primary" />
                    Available Consultation Timings — {format(parseISO(selectedDate), "EEE, d MMM")}
                  </p>
                  {loadingOfflineSlots ? (
                    <div className="flex items-center justify-center py-6 text-muted-foreground text-sm gap-2">
                      <Clock size={15} className="animate-spin text-primary" /> Loading slots…
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedDate && (
                        isOfflineSessionExceeded(selectedDate, "morning") || (offlineSlotStatus?.morning?.remaining ?? 0) <= 0 || offlineSlotStatus?.morning?.isAvailable === false
                      ) && (
                        isOfflineSessionExceeded(selectedDate, "evening") || (offlineSlotStatus?.evening?.remaining ?? 0) <= 0 || offlineSlotStatus?.evening?.isAvailable === false
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
                        const isExceeded = isOfflineSessionExceeded(selectedDate, session.id as "morning" | "evening");
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
                            className={`w-full p-4 rounded-xl border text-left transition-all flex items-center justify-between ${
                              !isAvailable
                                ? "bg-muted/40 border-border text-muted-foreground/50 cursor-not-allowed opacity-60"
                                : isSelected
                                ? "bg-[#1a3d2b] border-[#1a3d2b] text-white shadow-md ring-2 ring-[#1a3d2b]/20 cursor-pointer"
                                : "bg-card border-border hover:border-primary/50 hover:bg-primary/5 text-foreground cursor-pointer"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                  isSelected
                                    ? "bg-white/20 text-white"
                                    : !isAvailable
                                    ? "bg-muted text-muted-foreground"
                                    : "bg-[#1a3d2b]/10 text-[#1a3d2b]"
                                }`}
                              >
                                <Clock size={18} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm">{session.label}</span>
                                  <span className={`text-xs ${isSelected ? "text-white/80" : "text-muted-foreground"}`}>
                                    ({session.title})
                                  </span>
                                </div>
                                <span className={`text-[11px] ${isSelected ? "text-white/70" : "text-muted-foreground"}`}>
                                  15 mins duration per consultation
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
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
                              {isSelected && <CheckCircle2 size={16} className="text-white shrink-0" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Booking form */}
            <AnimatePresence>
              {selectedDate && selectedSlot && (
                <motion.form
                  key="form"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  onSubmit={submit}
                  className="bg-white rounded-2xl border border-border p-4 shadow-sm space-y-4"
                >
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Leaf size={14} className="text-primary" /> Confirm your booking
                  </p>

                  {/* Patient info — read-only display */}
                  <div className="bg-muted/40 rounded-xl p-3 space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Booking as</p>
                    <p className="text-sm font-semibold text-foreground">{patient?.name}</p>
                    {patient?.phone && <p className="text-xs text-muted-foreground">{patient.phone}</p>}
                  </div>

                  {/* Phone — only shown if not on record */}
                  {!patient?.phone && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                        Phone number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                      />
                    </div>
                  )}

                  {/* Selected date + slot summary */}
                  <div className="flex gap-3">
                    <div className="flex-1 bg-primary/5 rounded-xl px-3 py-2 flex items-center gap-2">
                      <Calendar size={14} className="text-primary flex-shrink-0" />
                      <span className="text-xs font-semibold text-primary">
                        {format(parseISO(selectedDate), "EEE, d MMM yyyy")}
                      </span>
                    </div>
                    <div className="flex-1 bg-primary/5 rounded-xl px-3 py-2 flex items-center gap-2">
                      <Clock size={14} className="text-primary flex-shrink-0" />
                      <span className="text-xs font-semibold text-primary">{selectedSlot}</span>
                    </div>
                  </div>

                  {/* Reason */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                      Reason for visit <span className="text-muted-foreground/60">(optional)</span>
                    </label>
                    <textarea
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Joint pain, digestive issues, general consultation…"
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    />
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-700">
                      <AlertCircle size={14} className="flex-shrink-0" /> {error}
                    </div>
                  )}

                  <MathCaptcha onVerified={setCaptchaOk} />

                  <button
                    type="submit"
                    disabled={submitting || !captchaOk}
                    className="w-full bg-[#1a3d2b] text-white font-bold py-3.5 rounded-2xl hover:bg-[#1a3d2b]/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Booking…</>
                    ) : (
                      "Confirm Appointment Request"
                    )}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}
