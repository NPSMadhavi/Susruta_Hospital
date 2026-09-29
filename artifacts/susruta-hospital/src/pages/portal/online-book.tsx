import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Video, Calendar, Clock, Upload, Trash2, ChevronLeft,
  ArrowRight, CheckCircle2, AlertCircle, Loader2, FileText, Leaf
} from "lucide-react";
import { patientApi } from "@/lib/patient-api";
import { isSlotExceeded } from "@/lib/ist";
import logoImg from "@assets/logo_1773840200056.png";
import { EmailVerificationGate } from "@/components/EmailVerificationGate";
import { MathCaptcha } from "@/components/MathCaptcha";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Slot = { id: number; date: string; startTime: string; endTime: string; intervalMinutes: number; slotNumber?: number; isBooked?: boolean; isExceeded?: boolean };
type DateGroup = { date: string; slots: Slot[] };

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
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

type UploadedDoc = { name: string; objectPath: string; contentType: string; size: number };

type Step = "select-slot" | "upload-docs" | "confirm" | "done";

export default function OnlineBook() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("select-slot");
  const [dateGroups, setDateGroups] = useState<DateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSessionDate, setSelectedSessionDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState("");
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState("");
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [patientEmail, setPatientEmail] = useState("");
  const [bypassGate, setBypassGate] = useState(false);
  const [captchaOk, setCaptchaOk] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Verify patient is logged in and check email verification
    patientApi.me()
      .then(p => {
        if (!p || !p.id) {
          navigate("/portal?next=/portal/online-book", { replace: true });
          return;
        }
        setEmailVerified(p.emailVerified);
        setPatientEmail(p.email);
      })
      .catch(() => navigate("/portal?next=/portal/online-book", { replace: true }));

    fetch(`${BASE}/api/online-slots/available`, { credentials: "include" })
      .then(r => r.json())
      .then(setDateGroups)
      .catch(() => setError("Failed to load available slots."))
      .finally(() => setLoading(false));
  }, []);

  async function uploadFiles(files: FileList) {
    setUploading(true);
    setError("");
    const newDocs: UploadedDoc[] = [];
    for (const file of Array.from(files)) {
      try {
        // Request presigned URL
        const r = await fetch(`${BASE}/api/storage/uploads/request-url`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, contentType: file.type, size: file.size }),
        });
        if (!r.ok) {
          const errData = await r.json().catch(() => ({}));
          throw new Error((errData as any)?.message || "Failed to get upload URL");
        }
        const { uploadURL, objectPath } = await r.json();

        // Upload directly to GCS
        const uploadRes = await fetch(uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!uploadRes.ok) throw new Error("Upload failed");

        newDocs.push({ name: file.name, objectPath, contentType: file.type, size: file.size });
      } catch {
        setError(`Failed to upload "${file.name}". Please try again.`);
      }
    }
    setDocs(prev => [...prev, ...newDocs]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function confirmBooking() {
    if (!selectedSlot) return;
    if (docs.length === 0) { setError("Please upload at least one document."); return; }
    setBooking(true);
    setError("");
    try {
      await fetch(`${BASE}/api/online-appointments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: selectedSlot.id, reason: reason.trim() || undefined, documents: docs }),
      }).then(async r => {
        const data = await r.json();
        if (!r.ok) throw data;
        return data;
      });

      // Optimistically decrease slots available count by removing booked slot
      setDateGroups(prev => prev.map(g =>
        g.date === selectedSlot.date
          ? { ...g, slots: g.slots.filter(s => s.id !== selectedSlot.id) }
          : g
      ));

      setStep("done");
    } catch (err: any) {
      if (err?.error === "slot_taken") {
        setError("This slot was just booked by someone else. Please pick another.");
        fetch(`${BASE}/api/online-slots/available`, { credentials: "include" })
          .then(r => r.json())
          .then(data => { if (Array.isArray(data)) setDateGroups(data); })
          .catch(() => {});
      } else {
        setError(err?.message || "Booking failed. Please try again.");
      }
    } finally {
      setBooking(false);
    }
  }

  const inputCls = "w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white";

  if (emailVerified === false && !bypassGate) {
    return <EmailVerificationGate email={patientEmail} onBack={() => navigate("/portal/dashboard")} onProceed={() => setBypassGate(true)} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50/40 via-white to-white">
      {/* Header */}
      <header className="bg-white border-b border-border/50 shadow-sm sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/portal/dashboard")}
            className="p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <ChevronLeft size={18} />
          </button>
          <img src={logoImg} alt="Susruta Hospital" className="h-8 w-auto object-contain" />
          <div>
            <p className="text-xs text-muted-foreground">Patient Portal</p>
            <p className="text-sm font-bold text-foreground">Book Online Consultation</p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {step === "done" ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={40} className="text-green-600" />
            </div>
            <h2 className="text-2xl font-serif font-bold text-foreground mb-2">Booking Confirmed!</h2>
            <p className="text-muted-foreground mb-2">Your online consultation has been booked for:</p>
            <p className="font-bold text-primary text-lg">{selectedSlot && fmtDate(selectedSlot.date)}</p>
            <p className="text-foreground font-medium">
              {selectedSlot && `${fmtTime(selectedSlot.startTime)} – ${fmtTime(selectedSlot.endTime)} (15 mins duration)`}
            </p>
            <p className="text-sm text-muted-foreground mt-4 max-w-md mx-auto">
              Dr. P. Murali Krishna will review your documents and issue a prescription after the consultation.
              You'll be able to view it in your dashboard.
            </p>
            <button onClick={() => navigate("/portal/dashboard")}
              className="mt-8 px-8 py-3 bg-primary text-white rounded-2xl font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
              Go to Dashboard
            </button>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {/* Step indicator */}
            <div className="flex items-center gap-2">
              {(["select-slot", "upload-docs", "confirm"] as Step[]).map((s, i) => {
                const steps = ["select-slot", "upload-docs", "confirm"];
                const idx = steps.indexOf(step);
                const done = steps.indexOf(s) < idx;
                const active = s === step;
                const labels = ["Select Slot", "Upload Docs", "Confirm"];
                return (
                  <React.Fragment key={s}>
                    <div className={`flex items-center gap-1.5 ${active ? "text-primary font-bold" : done ? "text-green-600" : "text-muted-foreground/50"} text-sm`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                        ${active ? "bg-primary text-white" : done ? "bg-green-600 text-white" : "bg-muted text-muted-foreground/40"}`}>
                        {done ? <CheckCircle2 size={12} /> : i + 1}
                      </div>
                      <span className="hidden sm:block">{labels[i]}</span>
                    </div>
                    {i < 2 && <div className={`flex-1 h-0.5 rounded-full ${done ? "bg-green-500" : "bg-border"}`} />}
                  </React.Fragment>
                );
              })}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            {/* Step 1: Select Slot */}
            {step === "select-slot" && (
              <div className="space-y-4">
                <h2 className="font-serif text-xl font-bold text-foreground flex items-center gap-2">
                  <Calendar size={20} className="text-primary" /> Choose a Consultation Slot
                </h2>
                {loading ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                    <Loader2 size={16} className="animate-spin" /> Loading available slots…
                  </div>
                ) : dateGroups.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl border border-border">
                    <Video size={40} className="mx-auto mb-3 text-red-400" />
                    <p className="text-base font-bold text-red-600">Slots are not available</p>
                    <p className="text-sm text-muted-foreground mt-1">All online consultation slots are currently booked or have passed. Please check back later.</p>
                    <button onClick={() => navigate("/portal/dashboard")}
                      className="mt-5 text-sm text-primary font-semibold hover:underline flex items-center gap-1 mx-auto">
                      <ChevronLeft size={13} /> Back to Dashboard
                    </button>
                  </div>
                ) : (
                  dateGroups.map(group => {
                    const availableSlots = group.slots.filter(s => !s.isBooked && !isSlotExceeded(group.date, s.startTime) && !s.isExceeded);
                    const allBooked = availableSlots.length === 0;
                    return (
                      <div key={group.date} className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden mb-4">
                        <div className="px-5 py-3.5 bg-muted/30 border-b border-border flex items-center justify-between">
                          <div>
                            <p className="font-bold text-foreground">{fmtDate(group.date)}</p>
                            <p className={`text-xs mt-0.5 font-medium ${allBooked ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
                              10 AM – 1 PM   {allBooked ? "0 available slots" : `${availableSlots.length} available slots`}
                            </p>
                          </div>
                          {allBooked && (
                            <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                              Slots are not available
                            </span>
                          )}
                        </div>
                        <div className="p-4">
                          {allBooked && (
                            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2 mb-3">
                              <span>All consultation slots for this date have been booked or time has passed.</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                              <Clock size={14} className="text-[#D95B2F]" />
                              Select Consultation Timing (15 mins duration):
                            </p>
                            {selectedSlot && selectedSlot.date === group.date && (
                              <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20">
                                Selected: {fmtTime(selectedSlot.startTime)} – {fmtTime(selectedSlot.endTime)}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                            {group.slots.map((slot) => {
                              const isExceeded = isSlotExceeded(group.date, slot.startTime) || slot.isExceeded;
                              const isSlotAvailable = !slot.isBooked && !isExceeded;
                              const isSlotSelected = selectedSlot?.id === slot.id;
                              return (
                                <button
                                  key={slot.id}
                                  type="button"
                                  disabled={!isSlotAvailable}
                                  onClick={() => {
                                    if (isSlotAvailable) setSelectedSlot(slot);
                                  }}
                                  className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                                    !isSlotAvailable
                                      ? "bg-muted/40 border-border text-muted-foreground/50 cursor-not-allowed opacity-60"
                                      : isSlotSelected
                                      ? "bg-primary border-primary text-white shadow-sm ring-2 ring-primary/30 cursor-pointer"
                                      : "bg-card border-border hover:border-primary/50 hover:bg-primary/5 text-foreground cursor-pointer"
                                  }`}
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <span className="text-xs font-bold leading-tight">
                                      {fmtTime(slot.startTime)} – {fmtTime(slot.endTime)}
                                    </span>
                                    {isSlotSelected && (
                                      <CheckCircle2 size={13} className="text-white shrink-0 ml-1" />
                                    )}
                                  </div>
                                  <span className={`text-[10px] mt-1.5 font-medium ${
                                    !isSlotAvailable
                                      ? "text-red-500 font-semibold"
                                      : isSlotSelected
                                      ? "text-white/80"
                                      : "text-muted-foreground"
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
                    );
                  })
                )}
                <div className="flex justify-end">
                  <button
                    disabled={!selectedSlot || selectedSlot.isBooked || isSlotExceeded(selectedSlot.date, selectedSlot.startTime) || selectedSlot.isExceeded}
                    onClick={() => setStep("upload-docs")}
                    className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-2xl font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Continue <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Upload Documents */}
            {step === "upload-docs" && (
              <div className="space-y-5">
                <h2 className="font-serif text-xl font-bold text-foreground flex items-center gap-2">
                  <Upload size={20} className="text-primary" /> Upload Medical Documents
                </h2>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-sm text-amber-800">
                  <p className="font-semibold mb-1">Why documents are required</p>
                  <p className="leading-relaxed">Dr. Murali Krishna reviews your medical history, reports, and current prescriptions before the consultation to provide the best Ayurvedic guidance.</p>
                </div>

                {/* Drop zone */}
                <div
                  className="border-2 border-dashed border-border rounded-2xl p-8 text-center bg-white hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={36} className="mx-auto mb-3 text-muted-foreground/40" />
                  <p className="font-semibold text-foreground mb-1">Click to upload files</p>
                  <p className="text-sm text-muted-foreground">PDF, JPG, PNG, DOCX accepted · Max 10 MB each</p>
                  <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.docx"
                    className="hidden" onChange={e => e.target.files && uploadFiles(e.target.files)} />
                </div>

                {uploading && (
                  <div className="flex items-center gap-2 text-primary text-sm">
                    <Loader2 size={15} className="animate-spin" /> Uploading…
                  </div>
                )}

                {docs.length > 0 && (
                  <div className="space-y-2">
                    {docs.map((doc, i) => (
                      <div key={i} className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                        <FileText size={15} className="text-green-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">{fmtBytes(doc.size)}</p>
                        </div>
                        <CheckCircle2 size={15} className="text-green-500 shrink-0" />
                        <button onClick={() => setDocs(d => d.filter((_, idx) => idx !== i))}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Reason for Consultation <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <textarea
                    rows={3} value={reason} onChange={e => setReason(e.target.value)}
                    placeholder="Describe your main health concern…"
                    className={cn(inputCls, "resize-none")}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button onClick={() => setStep("select-slot")}
                    className="flex items-center gap-1.5 px-4 py-2.5 border border-border rounded-xl text-sm font-semibold text-foreground hover:bg-muted transition-colors">
                    <ChevronLeft size={15} /> Back
                  </button>
                  <button onClick={() => {
                    if (docs.length === 0) { setError("Please upload at least one document before continuing."); return; }
                    setError(""); setStep("confirm");
                  }}
                    disabled={uploading}
                    className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-lg shadow-primary/20 text-sm">
                    Review Booking <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Confirm */}
            {step === "confirm" && selectedSlot && (
              <div className="space-y-5">
                <h2 className="font-serif text-xl font-bold text-foreground flex items-center gap-2">
                  <CheckCircle2 size={20} className="text-primary" /> Confirm Your Booking
                </h2>

                <div className="bg-white rounded-2xl border border-border shadow-sm p-6 space-y-4">
                  <div className="flex items-center gap-3 pb-4 border-b border-border">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Video size={18} className="text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-foreground">Online Consultation</p>
                      <p className="text-sm text-muted-foreground">with Dr. P. Murali Krishna</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Date</p>
                      <p className="font-bold text-foreground">{fmtDate(selectedSlot.date)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Slot</p>
                      <p className="font-bold text-foreground">
                        {fmtTime(selectedSlot.startTime)} – {fmtTime(selectedSlot.endTime)} (15 mins duration)
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Documents</p>
                      <p className="font-bold text-foreground">{docs.length} file(s) uploaded</p>
                    </div>
                    {reason && (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Reason</p>
                        <p className="text-foreground">{reason}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 text-sm text-green-800 flex items-start gap-2">
                  <Leaf size={15} className="shrink-0 mt-0.5" />
                  <p>After the slot, Dr. Murali Krishna will issue your Ayurvedic prescription. You can view it in your Patient Dashboard.</p>
                </div>

                <MathCaptcha onVerified={setCaptchaOk} />

                <div className="flex items-center gap-3">
                  <button onClick={() => setStep("upload-docs")}
                    className="flex items-center gap-1.5 px-4 py-2.5 border border-border rounded-xl text-sm font-semibold text-foreground hover:bg-muted transition-colors">
                    <ChevronLeft size={15} /> Back
                  </button>
                  <button onClick={confirmBooking} disabled={booking || !captchaOk}
                    className="flex items-center gap-2 px-7 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-lg shadow-primary/20 text-sm">
                    {booking ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    {booking ? "Booking…" : "Confirm Booking"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
