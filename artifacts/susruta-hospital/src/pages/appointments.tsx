import React, { useState, useEffect } from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { useLanguage } from "@/store/use-language";
import { translations } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  useListOpenMonths,
  useGetAvailability,
  useGetSlots,
  useCreateAppointment,
  useGetSettings
} from "@workspace/api-client-react";
import { format, parseISO } from "date-fns";
import { Calendar, Clock, CheckCircle2, UserCheck, LogIn } from "lucide-react";
import { patientApi } from "@/lib/patient-api";

export default function Appointments() {
  const { lang } = useLanguage();
  const t = (key: keyof typeof translations) => translations[key]?.[lang] || key;

  const { data: settings } = useGetSettings();
  const { data: openMonths = [], isLoading: loadingMonths } = useListOpenMonths();

  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [patient, setPatient] = useState<{ name: string; email: string; phone?: string } | null>(null);

  const { data: availability, isLoading: loadingDates } = useGetAvailability(
    { month: selectedMonth },
    { query: { enabled: !!selectedMonth } }
  );

  const { data: slots = [], isLoading: loadingSlots } = useGetSlots(
    { date: selectedDate },
    { query: { enabled: !!selectedDate } }
  );

  const createMutation = useCreateAppointment();

  const [formData, setFormData] = useState({
    patientName: "",
    patientPhone: "",
    patientEmail: "",
    reason: ""
  });
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    patientApi.me().then((p: any) => {
      setPatient(p);
      setFormData((f) => ({
        ...f,
        patientName: p.name || f.patientName,
        patientPhone: p.phone || f.patientPhone,
        patientEmail: p.email || f.patientEmail,
      }));
    }).catch(() => {});
  }, []);

  if (settings && !settings.appointmentBookingEnabled) {
    return (
      <PublicLayout>
        <div className="flex-1 flex items-center justify-center py-20 px-4">
          <div className="text-center max-w-md bg-white p-8 rounded-3xl border border-border shadow-sm">
            <Calendar size={48} className="mx-auto text-muted-foreground mb-4" />
            <h2 className="text-2xl font-serif font-bold mb-2">Online Booking Currently Disabled</h2>
            <p className="text-muted-foreground">Please contact the hospital directly via phone to schedule your appointment.</p>
          </div>
        </div>
      </PublicLayout>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !selectedTime || !formData.patientName || !formData.patientPhone) return;

    createMutation.mutate({
      data: {
        ...formData,
        date: selectedDate,
        timeSlot: selectedTime
      }
    }, {
      onSuccess: () => { setIsSuccess(true); }
    });
  };

  return (
    <PublicLayout>
      {/* Hero strip */}
      <div className="bg-gradient-to-br from-[#1a3d2b] to-[#2d5a3d] py-12 px-4 text-white text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 text-sm font-medium mb-4 border border-white/20">
            <Calendar size={14} />
            <span>Schedule Your Consultation</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold mb-3">
            Book an Appointment
          </h1>
          <p className="text-white/70 text-base max-w-lg mx-auto">
            with <span className="text-white font-semibold">Dr. P. Murali Krishna</span> — Gold Medalist, Ph.D., over 30 years of Ayurvedic expertise
          </p>
        </div>
      </div>

      <section className="py-12 bg-gradient-to-b from-green-50/40 to-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">

          {/* Logged-in patient banner */}
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

          {isSuccess ? (
            <div className="bg-white p-12 rounded-3xl border border-border shadow-sm text-center flex flex-col items-center animate-in zoom-in-95">
              <div className="h-20 w-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 size={40} />
              </div>
              <h2 className="text-3xl font-serif font-bold mb-4">Request Submitted!</h2>
              <p className="text-lg text-muted-foreground mb-8">
                Your appointment request for <strong>{format(parseISO(selectedDate), 'MMMM d, yyyy')}</strong> at <strong>{selectedTime}</strong> has been received. Our staff will contact you to confirm.
              </p>
              {patient ? (
                <a href="/portal/dashboard" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-all shadow-md">
                  View in My Portal →
                </a>
              ) : (
                <Button onClick={() => {
                  setIsSuccess(false);
                  setSelectedMonth(""); setSelectedDate(""); setSelectedTime("");
                  setFormData({ patientName: "", patientPhone: "", patientEmail: "", reason: "" });
                }}>Book Another</Button>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-border shadow-sm p-8 space-y-8">

              {/* STEP 1: Date & Time */}
              <div>
                <h3 className="text-xl font-bold font-serif mb-4 flex items-center gap-2">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-white text-sm">1</span>
                  Select Date & Time
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/40 p-6 rounded-2xl border border-border/50">
                  <div>
                    <label className="block text-sm font-semibold mb-2">{t("form.month")}</label>
                    <select
                      className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:outline-none"
                      value={selectedMonth}
                      onChange={(e) => {
                        setSelectedMonth(e.target.value);
                        setSelectedDate(""); setSelectedTime("");
                      }}
                      disabled={loadingMonths}
                    >
                      <option value="">-- Select Month --</option>
                      {openMonths.map(m => (
                        <option key={m.id} value={m.month}>
                          {format(parseISO(`${m.month}-01`), 'MMMM yyyy')}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2">{t("form.date")}</label>
                    <select
                      className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:outline-none disabled:opacity-50"
                      value={selectedDate}
                      onChange={(e) => { setSelectedDate(e.target.value); setSelectedTime(""); }}
                      disabled={!selectedMonth || loadingDates}
                    >
                      <option value="">-- Select Date --</option>
                      {availability?.availableDates.map(d => (
                        <option key={d} value={d}>{format(parseISO(d), 'EEE, MMM do')}</option>
                      ))}
                    </select>
                  </div>

                  {selectedDate && (
                    <div className="sm:col-span-2 mt-2">
                      <label className="block text-sm font-semibold mb-3">{t("form.time")}</label>
                      {loadingSlots ? (
                        <div className="animate-pulse flex gap-2"><div className="h-10 w-24 bg-border rounded-lg" /></div>
                      ) : slots.length === 0 ? (
                        <p className="text-destructive text-sm bg-destructive/10 p-3 rounded-lg">No slots available for this date.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {slots.map(slot => (
                            <button
                              key={slot.time}
                              type="button"
                              disabled={!slot.available}
                              onClick={() => setSelectedTime(slot.time)}
                              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                                selectedTime === slot.time
                                  ? 'bg-primary text-white shadow-md'
                                  : slot.available
                                    ? 'bg-white border border-border hover:border-primary text-foreground'
                                    : 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed'
                              }`}
                            >
                              {slot.time}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* STEP 2: Patient Details */}
              <div className={!selectedTime ? 'opacity-50 pointer-events-none' : 'animate-in fade-in'}>
                <h3 className="text-xl font-bold font-serif mb-4 flex items-center gap-2">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-white text-sm">2</span>
                  Patient Details
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2">{t("form.name")} *</label>
                    <input
                      required type="text"
                      value={formData.patientName}
                      onChange={e => setFormData({ ...formData, patientName: e.target.value })}
                      className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">{t("form.phone")} *</label>
                    <input
                      required type="tel"
                      value={formData.patientPhone}
                      onChange={e => setFormData({ ...formData, patientPhone: e.target.value })}
                      className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold mb-2">{t("form.email")}</label>
                    <input
                      type="email"
                      value={formData.patientEmail}
                      onChange={e => setFormData({ ...formData, patientEmail: e.target.value })}
                      className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold mb-2">{t("form.reason")}</label>
                    <textarea
                      rows={3}
                      value={formData.reason}
                      onChange={e => setFormData({ ...formData, reason: e.target.value })}
                      placeholder="Briefly describe your health concern (optional)"
                      className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:outline-none resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Submit */}
              <div className="pt-4 border-t border-border">
                <Button
                  type="submit" size="lg" className="w-full text-lg"
                  disabled={!selectedTime || !formData.patientName || !formData.patientPhone || createMutation.isPending}
                >
                  {createMutation.isPending ? t("loading") : t("btn.submit")}
                </Button>
                {createMutation.isError && (
                  <p className="text-destructive mt-2 text-center text-sm font-medium">Failed to submit. Please try again.</p>
                )}
              </div>

            </form>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}
