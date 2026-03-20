import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Clock, ArrowLeft, CheckCircle2, Leaf, AlertCircle } from "lucide-react";
import { patientApi } from "@/lib/patient-api";
import {
  useListOpenMonths,
  useGetAvailability,
  useGetSlots,
} from "@workspace/api-client-react";
import { getDaysInMonth, startOfMonth, getDay, format, parseISO } from "date-fns";
import logoImg from "@assets/logo_1773840200056.png";

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
        const isBlocked =
          !isMonthOpen ||
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

  const [monthIdx, setMonthIdx] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [phone, setPhone] = useState("");

  const { data: openMonths = [] } = useListOpenMonths();
  const currentMonth = openMonths[monthIdx] ?? "";
  const { data: availability } = useGetAvailability(currentMonth, { enabled: !!currentMonth });
  const { data: slotsData } = useGetSlots(selectedDate ?? "", { enabled: !!selectedDate });
  const slots: string[] = slotsData ?? [];

  useEffect(() => {
    patientApi.me()
      .then((p) => { setPatient(p); setLoading(false); })
      .catch(() => navigate("/portal?next=/portal/book"));
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-border px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate("/portal/dashboard")}
          className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground">
          <ArrowLeft size={18} />
        </button>
        <img src={logoImg} alt="Susruta Hospital" className="h-8 object-contain" />
        <div>
          <p className="text-sm font-bold text-foreground leading-tight">Book Appointment</p>
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
                  disabled={monthIdx === 0}
                  onClick={() => { setMonthIdx(m => m - 1); setSelectedDate(null); setSelectedSlot(null); }}
                  className="p-2 rounded-xl hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  ‹
                </button>
                <p className="font-serif font-bold text-foreground text-base">
                  {currentMonth ? format(parseISO(currentMonth + "-01"), "MMMM yyyy") : ""}
                </p>
                <button
                  disabled={monthIdx >= openMonths.length - 1}
                  onClick={() => { setMonthIdx(m => m + 1); setSelectedDate(null); setSelectedSlot(null); }}
                  className="p-2 rounded-xl hover:bg-muted disabled:opacity-30 transition-colors"
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
                    Available slots — {format(parseISO(selectedDate), "EEE, d MMM")}
                  </p>
                  {slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No slots available for this date.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {slots.map((slot) => (
                        <button
                          key={slot}
                          onClick={() => setSelectedSlot(slot)}
                          className={[
                            "py-2.5 rounded-xl text-xs font-semibold border transition-all",
                            selectedSlot === slot
                              ? "bg-[#1a3d2b] text-white border-[#1a3d2b] shadow-md"
                              : "border-border text-foreground hover:border-primary/50 hover:bg-primary/5",
                          ].join(" ")}
                        >
                          {slot}
                        </button>
                      ))}
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

                  <button
                    type="submit"
                    disabled={submitting}
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
