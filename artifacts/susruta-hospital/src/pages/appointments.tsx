import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { useLanguage } from "@/store/use-language";
import { t as tr } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  useListOpenMonths,
  useGetAvailability,
  useGetSlots,
  useCreateAppointment,
  useGetSettings,
} from "@workspace/api-client-react";
import {
  Calendar, Clock, CheckCircle2, Info, Leaf, UserCheck, LogIn,
} from "lucide-react";
import { format, parseISO, getDaysInMonth, startOfMonth, getDay } from "date-fns";
import { patientApi } from "@/lib/patient-api";

// ── Shared helpers (copied from home.tsx) ─────────────────────

const CHECKER_BG: React.CSSProperties = {
  backgroundImage: `
    linear-gradient(#2d6a4f 1px, transparent 1px),
    linear-gradient(90deg, #2d6a4f 1px, transparent 1px)
  `,
  backgroundSize: "20px 20px",
};

function TexturedSection({ id, className = "", children }: { id?: string; className?: string; children: React.ReactNode }) {
  const sRef = useRef<HTMLElement>(null);
  const rafRef = useRef<number>();

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!sRef.current) return;
      const rect = sRef.current.getBoundingClientRect();
      sRef.current.style.setProperty("--sx", `${e.clientX - rect.left}px`);
      sRef.current.style.setProperty("--sy", `${e.clientY - rect.top}px`);
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    sRef.current?.style.setProperty("--sx", "-999px");
    sRef.current?.style.setProperty("--sy", "-999px");
  }, []);

  return (
    <section ref={sRef} id={id} className={`relative overflow-hidden ${className}`}
      onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      <div style={{
        ...CHECKER_BG, position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.10,
        maskImage: "radial-gradient(circle 200px at var(--sx, -999px) var(--sy, -999px), black 0%, transparent 70%)",
        WebkitMaskImage: "radial-gradient(circle 200px at var(--sx, -999px) var(--sy, -999px), black 0%, transparent 70%)",
      }} />
      <div className="relative z-10">{children}</div>
    </section>
  );
}

function SC({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className={`w-full mx-auto px-6 sm:px-10 lg:px-16 xl:px-20 ${narrow ? "max-w-[900px]" : "max-w-[1440px]"}`}>
      {children}
    </div>
  );
}

function Reveal({ children, delay = 0, direction = "up", className = "" }: {
  children: React.ReactNode; delay?: number; direction?: "up" | "left" | "right" | "none"; className?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div ref={ref}
      variants={{
        hidden: { opacity: 0, y: direction === "up" ? 40 : 0, x: direction === "left" ? -40 : direction === "right" ? 40 : 0 },
        visible: { opacity: 1, y: 0, x: 0 },
      }}
      initial="hidden" animate={inView ? "visible" : "hidden"}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SectionHeader({ label, title, subtitle }: { label: string; title: string; subtitle?: string }) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <Reveal>
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary font-semibold text-sm uppercase tracking-wider mb-4">
          <Leaf size={13} /> {label}
        </div>
        <h2 className="text-3xl md:text-4xl xl:text-5xl font-serif font-bold text-foreground mb-4">{title}</h2>
        {subtitle && <p className="text-muted-foreground text-lg leading-relaxed">{subtitle}</p>}
      </Reveal>
    </div>
  );
}

function SlotGroup({ label, slots, selected, onSelect }: {
  label: string; slots: { time: string; available: boolean }[]; selected: string; onSelect: (t: string) => void;
}) {
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-2.5">{label}</p>
      <div className="flex flex-wrap gap-2">
        {slots.map(slot => (
          <button key={slot.time} type="button" disabled={!slot.available} onClick={() => onSelect(slot.time)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
              selected === slot.time
                ? "bg-primary text-white border-primary shadow-sm"
                : slot.available
                ? "bg-white border-border hover:border-primary hover:text-primary"
                : "bg-muted/40 text-muted-foreground/40 border-border/30 cursor-not-allowed line-through"
            }`}
          >
            {slot.time}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main appointments page ─────────────────────────────────────

export default function Appointments() {
  const { lang } = useLanguage();
  const { data: settings } = useGetSettings();
  const { data: openMonths = [], isLoading: loadingMonths } = useListOpenMonths();

  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [patient, setPatient] = useState<{ name: string; email: string; phone?: string } | null>(null);
  const [formData, setFormData] = useState({ patientName: "", patientPhone: "", patientEmail: "", reason: "" });

  const { data: availability } = useGetAvailability({ month: selectedMonth }, { query: { enabled: !!selectedMonth } });
  const { data: slots = [], isLoading: loadingSlots } = useGetSlots({ date: selectedDate }, { query: { enabled: !!selectedDate } });
  const createMutation = useCreateAppointment();

  // Pre-fill details for logged-in patient
  useEffect(() => {
    patientApi.me().then((p: any) => {
      setPatient(p);
      setFormData(f => ({
        ...f,
        patientName: p.name || f.patientName,
        patientPhone: p.phone || f.patientPhone,
        patientEmail: p.email || f.patientEmail,
      }));
    }).catch(() => {});
  }, []);

  const calendarMonth = useMemo(() => selectedMonth ? parseISO(`${selectedMonth}-01`) : null, [selectedMonth]);
  const availableDatesSet = useMemo(() => new Set(availability?.availableDates || []), [availability]);
  const blockedDatesSet = useMemo(() => new Set(availability?.blockedDates || []), [availability]);

  const calendarDays = useMemo(() => {
    if (!calendarMonth) return [];
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = getDay(startOfMonth(calendarMonth));
    const total = getDaysInMonth(calendarMonth);
    const days: (string | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= total; d++) {
      days.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    return days;
  }, [calendarMonth]);

  const today = new Date().toISOString().split("T")[0];
  const MORNING_TIMES = new Set(["10:00 AM","10:30 AM","11:00 AM","11:30 AM","12:00 PM","12:30 PM","01:00 PM"]);
  const morningSlots = slots.filter(s => MORNING_TIMES.has(s.time));
  const eveningSlots = slots.filter(s => !MORNING_TIMES.has(s.time));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !selectedSlot || !formData.patientName || !formData.patientPhone) return;
    createMutation.mutate(
      { data: { ...formData, date: selectedDate, timeSlot: selectedSlot } },
      { onSuccess: () => setIsSuccess(true) }
    );
  };

  // Booking disabled
  if (settings && !settings.appointmentBookingEnabled) {
    return (
      <PublicLayout>
        <TexturedSection className="py-24 bg-[#f7f7f7]">
          <div className="max-w-2xl mx-auto px-4 text-center">
            <Reveal>
              <Calendar size={48} className="mx-auto text-muted-foreground mb-4 opacity-30" />
              <h2 className="text-2xl font-serif font-bold mb-2">{tr("appt.label", lang)}</h2>
              <p className="text-muted-foreground">{tr("appt.unavailable", lang)}</p>
            </Reveal>
          </div>
        </TexturedSection>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <TexturedSection className="py-16 md:py-24 bg-[#f7f7f7]">
        <SC>
          <SectionHeader
            label={tr("appt.label", lang)}
            title={tr("appt.title", lang)}
            subtitle={tr("appt.subtitle", lang)}
          />

          {/* Patient login banner */}
          <div className="mt-8 max-w-4xl mx-auto">
            {patient ? (
              <div className="mb-6 flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-5 py-3.5">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <UserCheck size={18} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Booking as {patient.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{patient.email}</p>
                </div>
                <a href="/portal/dashboard" className="text-xs text-primary font-semibold hover:underline whitespace-nowrap">My Portal →</a>
              </div>
            ) : (
              <div className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5">
                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <LogIn size={18} className="text-amber-600" />
                </div>
                <div className="flex-1 text-sm text-foreground/70">
                  <a href="/portal?next=/appointments" className="text-primary font-semibold hover:underline">Log in</a>
                  {" "}to auto-fill your details and track this appointment in your portal.
                </div>
              </div>
            )}
          </div>

          <div className="mt-2 max-w-4xl mx-auto">
            {isSuccess ? (
              <Reveal>
                <div className="max-w-lg mx-auto bg-white p-10 rounded-3xl shadow-md border border-primary/20 text-center">
                  <motion.div
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    className="h-20 w-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6"
                  >
                    <CheckCircle2 size={44} />
                  </motion.div>
                  <h3 className="text-2xl font-serif font-bold mb-3">{tr("appt.success", lang)}</h3>
                  <p className="text-muted-foreground mb-8">{tr("appt.success_msg", lang)}</p>
                  {patient ? (
                    <a href="/portal/dashboard"
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-all shadow-md">
                      View in My Portal →
                    </a>
                  ) : (
                    <Button onClick={() => {
                      setIsSuccess(false); setSelectedDate(""); setSelectedSlot("");
                      setSelectedMonth(""); setFormData({ patientName: "", patientPhone: "", patientEmail: "", reason: "" });
                    }}>
                      {tr("btn.book_another", lang)}
                    </Button>
                  )}
                </div>
              </Reveal>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <Reveal>
                  <div className="bg-white rounded-3xl shadow-sm border border-border/60 overflow-hidden">
                    <div className="bg-primary/5 border-b border-primary/10 px-6 py-4 flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center">1</span>
                      <h3 className="font-serif font-bold text-lg">{tr("appt.step1", lang)}</h3>
                    </div>
                    <div className="p-5 md:p-7">
                      <div className="flex flex-col lg:flex-row gap-6">

                        {/* Month list */}
                        <div className="lg:w-52 flex-shrink-0">
                          <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3">{tr("form.month", lang)}</p>
                          {loadingMonths ? (
                            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-11 bg-muted animate-pulse rounded-xl" />)}</div>
                          ) : openMonths.filter(m => m.isOpen).length === 0 ? (
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex gap-2">
                              <Info size={15} className="shrink-0 mt-0.5" />{tr("appt.no_months", lang)}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {openMonths.filter(m => m.isOpen).map((m) => (
                                <button key={m.id} type="button"
                                  onClick={() => { setSelectedMonth(m.month); setSelectedDate(""); setSelectedSlot(""); }}
                                  className={`w-full px-4 py-3 rounded-xl text-sm font-semibold text-left transition-all border flex items-center gap-2 ${
                                    selectedMonth === m.month
                                      ? "bg-primary text-white border-primary shadow-sm"
                                      : "border-border hover:border-primary/40 hover:text-primary"
                                  }`}
                                >
                                  <Calendar size={13} className="shrink-0" />
                                  {format(parseISO(`${m.month}-01`), "MMMM yyyy")}
                                </button>
                              ))}
                            </div>
                          )}
                          {selectedMonth && (
                            <div className="mt-5 space-y-2 text-xs text-muted-foreground">
                              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-primary/20 ring-1 ring-primary/40 flex-shrink-0" />{tr("appt.legend_avail", lang)}</div>
                              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-muted border border-border flex-shrink-0" />{tr("appt.legend_unavail", lang)}</div>
                              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-red-100 border border-red-200 flex-shrink-0" />{tr("appt.legend_blocked", lang)}</div>
                              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-primary flex-shrink-0" />{tr("appt.legend_selected", lang)}</div>
                            </div>
                          )}
                        </div>

                        {/* Calendar */}
                        {selectedMonth && calendarMonth ? (
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="font-serif font-bold text-lg text-primary">{format(calendarMonth, "MMMM yyyy")}</h4>
                              <span className="text-xs text-muted-foreground flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100">
                                <Info size={11} />{tr("appt.sunday_note", lang)}
                              </span>
                            </div>
                            <div className="grid grid-cols-7 gap-1 mb-1">
                              {(lang === "en" ? ["Su","Mo","Tu","We","Th","Fr","Sa"] : ["ఆది","సోమ","మంగ","బుధ","గురు","శుక్ర","శని"]).map(d => (
                                <div key={d} className="text-center text-[11px] font-bold text-muted-foreground py-1">{d}</div>
                              ))}
                            </div>
                            <div className="grid grid-cols-7 gap-1.5">
                              {calendarDays.map((day, idx) => {
                                if (!day) return <div key={idx} />;
                                const isAvail = availableDatesSet.has(day);
                                const isBlocked = blockedDatesSet.has(day);
                                const isPast = day < today;
                                const isSel = selectedDate === day;
                                let cls = "aspect-square flex items-center justify-center rounded-xl text-sm font-semibold transition-all ";
                                if (isSel) cls += "bg-primary text-white shadow-md ring-2 ring-primary ring-offset-1";
                                else if (isBlocked) cls += "bg-red-50 text-red-300 cursor-not-allowed text-xs";
                                else if (isPast) cls += "text-muted-foreground/30 cursor-not-allowed";
                                else if (isAvail) cls += "bg-primary/15 text-primary hover:bg-primary hover:text-white cursor-pointer hover:shadow-sm";
                                else cls += "text-muted-foreground/40 cursor-not-allowed";
                                return (
                                  <button key={day} type="button" disabled={!isAvail || isPast}
                                    onClick={() => { setSelectedDate(day); setSelectedSlot(""); }}
                                    className={cls}
                                  >
                                    {day.split("-")[2]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          !loadingMonths && openMonths.length > 0 && (
                            <div className="flex-1 flex items-center justify-center text-muted-foreground/40 border-2 border-dashed border-border rounded-2xl min-h-[200px]">
                              <div className="text-center">
                                <Calendar size={36} className="mx-auto mb-2 opacity-40" />
                                <p className="text-sm">{lang === "en" ? "Select a month to see the calendar" : "క్యాలెండర్ చూడటానికి నెల ఎంచుకోండి"}</p>
                              </div>
                            </div>
                          )
                        )}
                      </div>

                      {/* Time slots */}
                      <AnimatePresence>
                        {selectedDate && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.35 }} className="overflow-hidden"
                          >
                            <div className="mt-6 pt-6 border-t border-border/60">
                              <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                                <Clock size={15} className="text-primary" />
                                {tr("appt.slots_for", lang)}&nbsp;<span className="text-primary">{format(parseISO(selectedDate), lang === "en" ? "EEEE, MMMM d" : "EEEE, d MMMM")}</span>
                                {new Date(selectedDate).getDay() === 0 && (
                                  <span className="ml-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">{tr("appt.sunday_note", lang)}</span>
                                )}
                              </p>
                              {loadingSlots ? (
                                <div className="flex gap-2 flex-wrap">{[...Array(7)].map((_, i) => <div key={i} className="h-10 w-24 bg-muted animate-pulse rounded-lg" />)}</div>
                              ) : (
                                <div className="space-y-5">
                                  <SlotGroup label={`🌅 ${tr("appt.morning", lang)}`} slots={morningSlots} selected={selectedSlot} onSelect={setSelectedSlot} />
                                  {eveningSlots.length > 0 && <SlotGroup label={`🌙 ${tr("appt.evening", lang)}`} slots={eveningSlots} selected={selectedSlot} onSelect={setSelectedSlot} />}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </Reveal>

                {/* Step 2 — patient details */}
                <AnimatePresence>
                  {selectedSlot && (
                    <motion.div
                      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
                      transition={{ duration: 0.4 }}
                      className="bg-white rounded-3xl shadow-sm border border-border/60 overflow-hidden"
                    >
                      <div className="bg-primary/5 border-b border-primary/10 px-6 py-4 flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center">2</span>
                        <h3 className="font-serif font-bold text-lg">{tr("appt.step2", lang)}</h3>
                        <span className="ml-auto text-sm text-primary font-semibold">
                          {format(parseISO(selectedDate), "MMM d")} · {selectedSlot}
                        </span>
                      </div>
                      <div className="p-5 md:p-7 grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                          <label className="block text-sm font-semibold mb-2">{tr("form.name", lang)} <span className="text-destructive">*</span></label>
                          <input required type="text" value={formData.patientName}
                            onChange={e => setFormData({ ...formData, patientName: e.target.value })}
                            placeholder={lang === "en" ? "Full name" : "పూర్తి పేరు"}
                            className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold mb-2">{tr("form.phone", lang)} <span className="text-destructive">*</span></label>
                          <input required type="tel" value={formData.patientPhone}
                            onChange={e => setFormData({ ...formData, patientPhone: e.target.value })}
                            placeholder={lang === "en" ? "Mobile number" : "మొబైల్ నంబర్"}
                            className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-sm font-semibold mb-2">{tr("form.email", lang)}</label>
                          <input type="email" value={formData.patientEmail}
                            onChange={e => setFormData({ ...formData, patientEmail: e.target.value })}
                            placeholder="example@email.com"
                            className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-sm font-semibold mb-2">{tr("form.reason", lang)}</label>
                          <textarea rows={3} value={formData.reason}
                            onChange={e => setFormData({ ...formData, reason: e.target.value })}
                            placeholder={lang === "en" ? "Brief description of your health concern" : "మీ ఆరోగ్య సమస్య సంక్షిప్త వివరణ"}
                            className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none resize-none" />
                        </div>
                        <div className="sm:col-span-2 pt-1">
                          <Button type="submit" size="lg" className="w-full text-base" disabled={createMutation.isPending}>
                            {createMutation.isPending ? tr("loading", lang) : tr("btn.confirm", lang)}
                          </Button>
                          {createMutation.isError && (
                            <p className="text-destructive text-sm text-center mt-3 font-medium">{tr("appt.error", lang)}</p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </form>
            )}
          </div>
        </SC>
      </TexturedSection>
    </PublicLayout>
  );
}
