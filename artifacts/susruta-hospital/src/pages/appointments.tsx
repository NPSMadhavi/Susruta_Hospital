import React, { useState } from "react";
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
import { Calendar, Clock, CheckCircle2 } from "lucide-react";

export default function Appointments() {
  const { lang } = useLanguage();
  const t = (key: keyof typeof translations) => translations[key]?.[lang] || key;
  
  const { data: settings } = useGetSettings();
  const { data: openMonths = [], isLoading: loadingMonths } = useListOpenMonths();
  
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");

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
      onSuccess: () => {
        setIsSuccess(true);
      }
    });
  };

  return (
    <PublicLayout>
      <div className="bg-secondary/30 py-12 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-serif font-bold text-foreground">
            {t("nav.appointments")}
          </h1>
          <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
            Schedule your consultation with Dr. P. Murali Krishna
          </p>
        </div>
      </div>

      <section className="py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {isSuccess ? (
            <div className="glass-card p-12 rounded-3xl text-center flex flex-col items-center animate-in zoom-in-95">
              <div className="h-20 w-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 size={40} />
              </div>
              <h2 className="text-3xl font-serif font-bold mb-4">Request Submitted!</h2>
              <p className="text-lg text-muted-foreground mb-8">
                Your appointment request for <strong>{format(parseISO(selectedDate), 'MMMM d, yyyy')}</strong> at <strong>{selectedTime}</strong> has been received. Our staff will contact you to confirm.
              </p>
              <Button onClick={() => {
                setIsSuccess(false);
                setSelectedMonth("");
                setSelectedDate("");
                setSelectedTime("");
                setFormData({patientName: "", patientPhone: "", patientEmail: "", reason: ""});
              }}>Book Another</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="glass-card p-8 rounded-3xl shadow-lg border-primary/10">
              
              <div className="space-y-8">
                {/* STEP 1: Time Selection */}
                <div>
                  <h3 className="text-xl font-bold font-serif mb-4 flex items-center gap-2">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-white text-sm">1</span> 
                    Select Date & Time
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/50 p-6 rounded-2xl border border-border/50">
                    <div>
                      <label className="block text-sm font-semibold mb-2">{t("form.month")}</label>
                      <select 
                        className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:outline-none"
                        value={selectedMonth}
                        onChange={(e) => {
                          setSelectedMonth(e.target.value);
                          setSelectedDate("");
                          setSelectedTime("");
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
                        onChange={(e) => {
                          setSelectedDate(e.target.value);
                          setSelectedTime("");
                        }}
                        disabled={!selectedMonth || loadingDates}
                      >
                        <option value="">-- Select Date --</option>
                        {availability?.availableDates.map(d => (
                          <option key={d} value={d}>
                            {format(parseISO(d), 'EEE, MMM do')}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedDate && (
                      <div className="sm:col-span-2 mt-2">
                        <label className="block text-sm font-semibold mb-3">{t("form.time")}</label>
                        {loadingSlots ? (
                          <div className="animate-pulse flex gap-2"><div className="h-10 w-24 bg-border rounded-lg"></div></div>
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
                        required
                        type="text" 
                        value={formData.patientName}
                        onChange={e => setFormData({...formData, patientName: e.target.value})}
                        className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2">{t("form.phone")} *</label>
                      <input 
                        required
                        type="tel" 
                        value={formData.patientPhone}
                        onChange={e => setFormData({...formData, patientPhone: e.target.value})}
                        className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-semibold mb-2">{t("form.email")}</label>
                      <input 
                        type="email" 
                        value={formData.patientEmail}
                        onChange={e => setFormData({...formData, patientEmail: e.target.value})}
                        className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-semibold mb-2">{t("form.reason")}</label>
                      <textarea 
                        rows={3}
                        value={formData.reason}
                        onChange={e => setFormData({...formData, reason: e.target.value})}
                        className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:outline-none resize-none"
                      ></textarea>
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <div className="pt-4 border-t border-border">
                  <Button 
                    type="submit" 
                    size="lg" 
                    className="w-full text-lg"
                    disabled={!selectedTime || !formData.patientName || !formData.patientPhone || createMutation.isPending}
                  >
                    {createMutation.isPending ? t("loading") : t("btn.submit")}
                  </Button>
                  {createMutation.isError && (
                    <p className="text-destructive mt-2 text-center text-sm font-medium">Failed to submit request. Please try again.</p>
                  )}
                </div>

              </div>
            </form>
          )}

        </div>
      </section>
    </PublicLayout>
  );
}
