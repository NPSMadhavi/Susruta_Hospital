import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { ChevronLeft, CheckCircle2, Printer, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import QRCode from "qrcode";
import { isOfflineSessionExceeded } from "@/lib/ist";
import logoImg from "@assets/logo_1773840200056.png";

const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

interface BookingResult {
  id: number;
  token: string;
  patientCode?: string;
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  date: string;
  timeSlot: string;
  amount: number;
  paymentStatus: string;
  paymentThrough?: string;
  notes?: string;
  createdAt: string;
}

export default function AdminOfflineRegister() {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayDisplay = format(new Date(), "dd MMMM yyyy");

  // Form states
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [appointmentDate, setAppointmentDate] = useState(todayStr);

  // Time slot sessions (strictly 15 min duration each)
  // 10 AM - 1 PM: 3 hours = 180 mins / 15 mins = 12 slots
  // 6 PM - 10 PM: 4 hours = 240 mins / 15 mins = 16 slots
  const SESSIONS = [
    { id: "morning", label: "10 AM - 1 PM", slotCount: 12 },
    { id: "evening", label: "6 PM - 10 PM", slotCount: 16 },
  ];

  const [selectedSessionId, setSelectedSessionId] = useState<"morning" | "evening">("morning");

  // Dynamic slot availability based on registrations
  const [slotStatus, setSlotStatus] = useState<{
    morning: { total: number; booked: number; remaining: number; isAvailable: boolean };
    evening: { total: number; booked: number; remaining: number; isAvailable: boolean };
  }>({
    morning: { total: 12, booked: 0, remaining: 12, isAvailable: true },
    evening: { total: 16, booked: 0, remaining: 16, isAvailable: true },
  });

  const [amount, setAmount] = useState("200");
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "unpaid">("unpaid");
  const [paymentThrough, setPaymentThrough] = useState<"UPI" | "Cash">("UPI");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Booking result state (Image 3)
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);

  // Print modal state (Image 4)
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");

  const currentSession = SESSIONS.find((s) => s.id === selectedSessionId) || SESSIONS[0];
  const isMorningExceeded = isOfflineSessionExceeded(appointmentDate, "morning");
  const isEveningExceeded = isOfflineSessionExceeded(appointmentDate, "evening");
  const isCurrentSessionAvailable =
    selectedSessionId === "morning"
      ? (slotStatus.morning.isAvailable && !isMorningExceeded && slotStatus.morning.remaining > 0)
      : (slotStatus.evening.isAvailable && !isEveningExceeded && slotStatus.evening.remaining > 0);

  // Fetch slot status for the chosen date
  const fetchSlotStatus = async (date: string) => {
    try {
      let res = await fetch(`${API}/appointments/offline/slots-status?date=${date}`, {
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        setSlotStatus({
          morning: data.morning,
          evening: data.evening,
        });
        return;
      }

      // Fallback: calculate from /api/appointments?date=
      res = await fetch(`${API}/appointments?date=${date}`, { credentials: "include" });
      if (res.ok) {
        const list = await res.json();
        const active = Array.isArray(list) ? list.filter((a: any) => a.status !== "cancelled") : [];
        const mBooked = active.filter((a: any) =>
          a.timeSlot?.includes("10 AM") ||
          a.timeSlot?.includes("Morning") ||
          a.timeSlot?.startsWith("10:") ||
          a.timeSlot?.startsWith("11:") ||
          a.timeSlot?.startsWith("12:")
        ).length;

        const eBooked = active.filter((a: any) =>
          a.timeSlot?.includes("6 PM") ||
          a.timeSlot?.includes("Evening") ||
          a.timeSlot?.startsWith("06:") ||
          a.timeSlot?.startsWith("07:") ||
          a.timeSlot?.startsWith("08:") ||
          a.timeSlot?.startsWith("09:") ||
          a.timeSlot?.startsWith("18:") ||
          a.timeSlot?.startsWith("19:") ||
          a.timeSlot?.startsWith("20:") ||
          a.timeSlot?.startsWith("21:")
        ).length;

        setSlotStatus({
          morning: {
            total: 12,
            booked: mBooked,
            remaining: Math.max(0, 12 - mBooked),
            isAvailable: mBooked < 12,
          },
          evening: {
            total: 16,
            booked: eBooked,
            remaining: Math.max(0, 16 - eBooked),
            isAvailable: eBooked < 16,
          },
        });
      }
    } catch (err) {
      console.error("Error fetching slot status:", err);
    }
  };

  useEffect(() => {
    if (appointmentDate) {
      fetchSlotStatus(appointmentDate);
    }
  }, [appointmentDate]);

  const handleSessionChange = (id: "morning" | "evening") => {
    setSelectedSessionId(id);
  };

  // Format slot label for display
  const slotDisplayLabel = currentSession.label;

  // Generate QR Code whenever bookingResult is ready
  useEffect(() => {
    if (!bookingResult) return;
    const patientId = bookingResult.patientCode || "—";
    const qrData = JSON.stringify({
      hospital: "Susruta Hospital",
      address: "119, Ramulavari North Mada Street, Tirupati - 517 507",
      patientId,
      token: bookingResult.token,
      patient: bookingResult.patientName,
      phone: bookingResult.patientPhone,
      ...(bookingResult.patientEmail ? { email: bookingResult.patientEmail } : {}),
      date: bookingResult.date,
      slot: bookingResult.timeSlot,
      amount: `₹${bookingResult.amount}`,
      paymentMode: (bookingResult.paymentThrough || "UPI").toUpperCase(),
      paymentThrough: (bookingResult.paymentThrough || "UPI").toUpperCase(),
      status: "PAID",
    });

    QRCode.toDataURL(qrData, {
      width: 140,
      margin: 1,
      color: {
        dark: "#1E293B",
        light: "#FFFFFF",
      },
    })
      .then((url) => setQrCodeUrl(url))
      .catch((err) => console.error("QR Code error:", err));
  }, [bookingResult]);

  const handleClear = () => {
    setPatientName("");
    setPatientPhone("");
    setPatientEmail("");
    setAppointmentDate(todayStr);
    setSelectedSessionId("morning");
    setAmount("200");
    setPaymentStatus("unpaid");
    setPaymentThrough("UPI");
    setNotes("");
    setErrorMsg("");
    fetchSlotStatus(todayStr);
  };

  const handleNewRegistration = () => {
    setBookingResult(null);
    handleClear();
  };

  const handleGenerateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!isCurrentSessionAvailable) {
      setErrorMsg(`No slots are available for ${currentSession.label} on this date.`);
      return;
    }
    if (!patientName.trim()) {
      setErrorMsg("Please enter patient name.");
      return;
    }
    const cleanPhone = patientPhone.replace(/\D/g, "");
    if (!cleanPhone) {
      setErrorMsg("Please enter patient phone number.");
      return;
    }
    if (cleanPhone.length !== 10) {
      setErrorMsg("Phone number must be exactly 10 digits for India.");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      setErrorMsg("Please enter a valid 10-digit Indian phone number (starting with 6, 7, 8, or 9).");
      return;
    }
    const trimmedEmail = patientEmail.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMsg("Please enter a valid email address, or leave it blank.");
      return;
    }
    if (paymentStatus !== "paid") {
      setErrorMsg("Payment status must be marked as Paid to generate a token.");
      return;
    }

    setIsSubmitting(true);
    const currentBooked = selectedSessionId === "morning" ? slotStatus.morning.booked : slotStatus.evening.booked;
    const tokenComputed = `T${String(currentBooked + 1).padStart(3, "0")}`;

    try {
      const phoneWithCountry = `+91${cleanPhone}`;
      const emailPayload = trimmedEmail || undefined;
      // Attempt to call /api/appointments/offline
      let res = await fetch(`${API}/appointments/offline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          patientName: patientName.trim(),
          patientPhone: phoneWithCountry,
          patientEmail: emailPayload,
          date: appointmentDate,
          timeSlot: slotDisplayLabel,
          amount: Number(amount) || 200,
          notes: notes.trim(),
          paymentStatus: "paid",
          paymentThrough: paymentThrough,
        }),
      });

      // Fallback if backend server has not been restarted yet (404)
      if (res.status === 404) {
        res = await fetch(`${API}/appointments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            patientName: patientName.trim(),
            patientPhone: phoneWithCountry,
            patientEmail: emailPayload,
            date: appointmentDate,
            timeSlot: slotDisplayLabel,
            reason: "Offline Walk-in Registration",
          }),
        });
      }

      let data: any = {};
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        if (!res.ok) {
          throw new Error(`Server responded with ${res.status}. Please ensure backend is running.`);
        }
      }

      if (!res.ok && res.status !== 409) {
        throw new Error(data?.message || `Failed to generate token (${res.status})`);
      }

      setBookingResult({
        id: data.id || Date.now(),
        token: data.token || tokenComputed,
        patientCode: data.patientCode || "",
        patientName: patientName.trim(),
        patientPhone: cleanPhone,
        patientEmail: data.patientEmail || emailPayload || "",
        date: appointmentDate,
        timeSlot: slotDisplayLabel,
        amount: Number(amount) || 200,
        paymentStatus: "paid",
        paymentThrough: data.paymentThrough || paymentThrough,
        notes: notes.trim(),
        createdAt: data.createdAt || new Date().toISOString(),
      });

      // Refresh slot counts for this date immediately
      fetchSlotStatus(appointmentDate);
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong while generating token.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatReceiptDate = (dStr: string) => {
    try {
      return format(parseISO(dStr), "dd MMMM yyyy");
    } catch {
      return dStr;
    }
  };

  const formatShortDate = (dStr: string) => {
    try {
      return format(parseISO(dStr), "dd MMM yyyy").toUpperCase();
    } catch {
      return dStr;
    }
  };

  const maskPhone = (phone: string) => {
    const clean = phone.replace(/\D/g, "");
    if (clean.length >= 10) {
      const start = clean.slice(-10, -5);
      return `${start} XXXXX`;
    }
    return phone;
  };

  return (
    <AdminLayout>
      {/* Centered Page Wrapper */}
      <div className="w-full flex flex-col items-center justify-center py-2">
        <div className="w-full max-w-2xl">
          {/* Top Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <Link
                href="/admin/availability"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#D95B2F] hover:text-[#c04e26] mb-2 transition-colors"
              >
                <ChevronLeft size={15} />
                Back to Slot Settings
              </Link>
              <h1 className="text-2xl font-bold text-[#1E293B]">Register Offline Patient</h1>
              <p className="text-xs text-[#64748B] mt-1">
                Enter patient details to create an offline appointment and generate a token.
              </p>
            </div>

          </div>

          {/* Main Content Area (Form or Token Confirmation) */}
          {!bookingResult ? (
            /* =================== FORM STATE (Image 2 - In the middle) =================== */
            <div className="bg-white rounded-2xl border border-[#EDEFEB] p-6 sm:p-8 w-full shadow-sm">
              {/* <h2 className="text-xs font-bold text-[#1E293B] tracking-wider mb-6">
                Patient Details
              </h2> */}

              {errorMsg && (
                <div className="mb-6 p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-600">
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleGenerateToken} className="space-y-6">
                {/* Row 1: Patient Name & Phone Number */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-[#475569] tracking-wider mb-2">
                      Patient Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Enter patient full name"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-[#CBD5E1] text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-[#475569] tracking-wider">
                        Phone Number <span className="text-red-500">*</span>
                      </label>
                      {patientPhone.length > 0 && (
                        <span
                          className={`text-[11px] font-semibold ${
                            patientPhone.length === 10 && /^[6-9]\d{9}$/.test(patientPhone)
                              ? "text-emerald-600"
                              : "text-[#94A3B8]"
                          }`}
                        >
                          {patientPhone.length === 10 && /^[6-9]\d{9}$/.test(patientPhone)
                            ? "✓ Valid 10-digit number"
                            : `${patientPhone.length}/10 digits`}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#64748B] select-none">
                        +91
                      </span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        pattern="[6-9][0-9]{9}"
                        required
                        placeholder="Enter 10-digit phone number"
                        value={patientPhone}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                          setPatientPhone(val);
                          if (errorMsg) setErrorMsg("");
                        }}
                        className={`w-full pl-12 pr-4 py-2.5 rounded-xl border text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 transition-all ${
                          patientPhone.length > 0 && !/^[6-9]/.test(patientPhone)
                            ? "border-red-400 focus:ring-red-500/20 focus:border-red-500"
                            : patientPhone.length === 10 && /^[6-9]\d{9}$/.test(patientPhone)
                            ? "border-emerald-400 focus:ring-emerald-500/20 focus:border-emerald-500"
                            : "border-[#CBD5E1] focus:ring-[#D95B2F]/20 focus:border-[#D95B2F]"
                        }`}
                      />
                    </div>
                    {patientPhone.length > 0 && !/^[6-9]/.test(patientPhone) && (
                      <p className="text-[11px] text-red-500 font-medium mt-1">
                        Indian mobile numbers must start with 6, 7, 8, or 9
                      </p>
                    )}
                  </div>
                </div>

                {/* Row 2: Email (Optional) & Appointment Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-[#475569] tracking-wider mb-2">
                      Email <span className="text-xs font-normal text-[#94A3B8]">(Optional)</span>
                    </label>
                    <input
                      type="email"
                      placeholder="Enter patient email address"
                      value={patientEmail}
                      onChange={(e) => {
                        setPatientEmail(e.target.value);
                        if (errorMsg) setErrorMsg("");
                      }}
                      className="w-full px-4 py-2.5 rounded-xl border border-[#CBD5E1] text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#475569] tracking-wider mb-2">
                      Appointment Date <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        required
                        min={todayStr}
                        value={appointmentDate}
                        onChange={(e) => setAppointmentDate(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-[#CBD5E1] text-sm text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Row 3: Time Slot Sessions & Number of Slots (15-min divisions) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-[#475569] tracking-wider">
                      Time Slots <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] text-[#64748B] font-medium">
                      15 mins duration / slot
                    </span>
                  </div>

                  {/* Range selector showing number of slots */}
                  <div className="grid grid-cols-2 gap-3">
                    {SESSIONS.map((s) => {
                      const isSelected = selectedSessionId === s.id;
                      const status = s.id === "morning" ? slotStatus.morning : slotStatus.evening;
                      const isExceeded = isOfflineSessionExceeded(appointmentDate, s.id as "morning" | "evening");
                      const remaining = isExceeded ? 0 : status.remaining;
                      const isAvailable = !isExceeded && (status.isAvailable ?? true) && remaining > 0;

                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => {
                            if (isAvailable) handleSessionChange(s.id as "morning" | "evening");
                          }}
                          className={`px-4 py-3 rounded-xl text-xs font-bold tracking-wide transition-all text-left flex items-center justify-between ${
                            !isAvailable
                              ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60"
                              : isSelected
                              ? "bg-[#D95B2F] text-white shadow-sm border border-[#D95B2F] cursor-pointer"
                              : "bg-slate-50 text-[#475569] border border-[#CBD5E1] hover:border-[#94A3B8] hover:bg-slate-100 cursor-pointer"
                          }`}
                        >
                          <span>{s.label}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-md font-extrabold ${
                              !isAvailable
                                ? "bg-red-100 text-red-600"
                                : isSelected
                                ? "bg-white/20 text-white"
                                : "bg-[#CBD5E1]/40 text-[#475569]"
                            }`}
                          >
                            {isAvailable ? `${remaining} Slots Available` : "No slots available"}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {!isCurrentSessionAvailable && (
                    <div className="mt-2.5 p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                      <span>
                        No slots are available for {currentSession.label} on this date (
                        {isOfflineSessionExceeded(appointmentDate, selectedSessionId as "morning" | "evening")
                          ? "session timing has passed"
                          : "all slots have been booked"}
                        ).
                      </span>
                    </div>
                  )}
                </div>

                {/* Row 4: Consultation Amount, Payment Status & Payment through */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#475569] tracking-wider mb-2">
                      Consultation Amount <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B] font-semibold text-sm">
                        ₹
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        required
                        placeholder="Enter amount"
                        value={amount}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          setAmount(val);
                        }}
                        className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-[#CBD5E1] text-sm font-semibold text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#475569] tracking-wider mb-2">
                      Payment Status <span className="text-red-500">*</span>
                    </label>

                    {/* Segmented button with vertical divider line between PAID and UNPAID */}
                    <div className="h-[42px] rounded-xl border border-[#CBD5E1] flex items-center bg-white overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setPaymentStatus("unpaid")}
                        className={`flex-1 h-full flex items-center justify-center text-xs font-bold transition-colors cursor-pointer ${
                          paymentStatus === "unpaid"
                            ? "bg-slate-300 text-[#334155] font-extrabold"
                            : "text-[#94A3B8] hover:text-[#475569] hover:bg-slate-50"
                        }`}
                      >
                        Unpaid
                      </button>

                      {/* Vertical divider line */}
                      <div className="w-[1px] h-6 bg-[#CBD5E1]" />

                      <button
                        type="button"
                        onClick={() => setPaymentStatus("paid")}
                        className={`flex-1 h-full flex items-center justify-center text-xs font-bold transition-colors cursor-pointer ${
                          paymentStatus === "paid"
                            ? "bg-green-900 text-white font-extrabold"
                            : "text-[#94A3B8] hover:text-[#475569] hover:bg-slate-50"
                        }`}
                      >
                        Paid
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#475569] tracking-wider mb-2">
                      Payment through <span className="text-red-500">*</span>
                    </label>

                    {/* Segmented button with vertical divider line between UPI and CASH */}
                    <div className="h-[42px] rounded-xl border border-[#CBD5E1] flex items-center bg-white overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setPaymentThrough("UPI")}
                        className={`flex-1 h-full flex items-center justify-center text-xs font-bold transition-colors cursor-pointer ${
                          paymentThrough === "UPI"
                            ? "bg-[#D95B2F] text-white font-extrabold"
                            : "text-[#94A3B8] hover:text-[#475569] hover:bg-slate-50"
                        }`}
                      >
                        UPI
                      </button>

                      {/* Vertical divider line */}
                      <div className="w-[1px] h-6 bg-[#CBD5E1]" />

                      <button
                        type="button"
                        onClick={() => setPaymentThrough("Cash")}
                        className={`flex-1 h-full flex items-center justify-center text-xs font-bold transition-colors cursor-pointer ${
                          paymentThrough === "Cash"
                            ? "bg-[#D95B2F] text-white font-extrabold"
                            : "text-[#94A3B8] hover:text-[#475569] hover:bg-slate-50"
                        }`}
                      >
                        Cash
                      </button>
                    </div>
                  </div>
                </div>

                {/* Row 5: Notes */}
                <div>
                  <label className="block text-xs font-bold text-[#475569] tracking-wider mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Add any additional information..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-[#CBD5E1] text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all"
                  />
                </div>

                {/* Row 6: Submit & Clear Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <div className="text-[11px] order-2 sm:order-1">
                    {!isCurrentSessionAvailable ? (
                      <span className="text-red-500 font-semibold">
                        * All slots booked for this session
                      </span>
                    ) : paymentStatus !== "paid" ? (
                      <span className="text-[#94A3B8] italic">
                        * Select PAID to enable token generation
                      </span>
                    ) : patientPhone.length > 0 && (patientPhone.replace(/\D/g, "").length !== 10 || !/^[6-9]\d{9}$/.test(patientPhone.replace(/\D/g, ""))) ? (
                      <span className="text-red-500 font-semibold">
                        * Enter valid 10-digit Indian mobile number
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto justify-end order-1 sm:order-2">
                    <button
                      type="button"
                      onClick={handleClear}
                      className="w-full sm:w-auto px-6 py-3 rounded-xl border border-[#CBD5E1] hover:bg-slate-50 text-[#475569] text-xs font-bold tracking-wide transition-all"
                    >
                      Clear
                    </button>
                    <button
                      type="submit"
                      disabled={
                        !isCurrentSessionAvailable ||
                        paymentStatus !== "paid" ||
                        !patientName.trim() ||
                        patientPhone.replace(/\D/g, "").length !== 10 ||
                        !/^[6-9]\d{9}$/.test(patientPhone.replace(/\D/g, "")) ||
                        isSubmitting
                      }
                      className="w-full sm:w-auto px-8 py-3 rounded-xl bg-[#D95B2F] hover:bg-[#c04e26] text-white text-xs font-bold tracking-wide shadow-sm transition-all disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-[#D95B2F]"
                    >
                      {isSubmitting ? "Generating..." : "Generate Token"}
                    </button>

                  
                  </div>
                </div>
              </form>
            </div>
          ) : (
            /* ================= TOKEN CONFIRMATION (Image 3 - In the middle) ================= */
            <div className="bg-white rounded-2xl border border-[#EDEFEB] p-6 sm:p-8 w-full shadow-sm animate-in fade-in zoom-in-95 duration-200">
              {/* Green banner */}
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs tracking-wider mb-6">
                <CheckCircle2 size={18} className="text-emerald-600" />
                Offline Booking Created
              </div>

              {/* Bordered Token Box */}
              <div className="border border-[#EDEFEB] rounded-2xl p-6 sm:p-8 bg-[#F8FAFC]/50 text-center mb-8">
                <p className="text-[13px] font-bold tracking-widest text-[#94A3B8] mb-1">
                  Token
                </p>
                <h2 className="text-6xl sm:text-7xl font-extrabold text-[#D95B2F] tracking-tight mb-8">
                  {bookingResult.token}
                </h2>

                {/* Key Information Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-left">
                  <div className="bg-white border border-[#EDEFEB] rounded-xl p-3.5">
                    <p className="text-[10px] font-bold text-[#94A3B8] tracking-wider mb-0.5">
                      Patient
                    </p>
                    <p className="text-sm font-bold text-[#1E293B] truncate">
                      {bookingResult.patientName}
                    </p>
                  </div>

                  <div className="bg-white border border-[#EDEFEB] rounded-xl p-3.5">
                    <p className="text-[10px] font-bold text-[#94A3B8] tracking-wider mb-0.5">
                      Date
                    </p>
                    <p className="text-sm font-bold text-[#1E293B]">
                      {formatReceiptDate(bookingResult.date)}
                    </p>
                  </div>

                  <div className="bg-white border border-[#EDEFEB] rounded-xl p-3.5">
                    <p className="text-[10px] font-bold text-[#94A3B8] tracking-wider mb-0.5">
                      Slot
                    </p>
                    <p className="text-sm font-bold text-[#1E293B]">
                      {bookingResult.timeSlot}
                    </p>
                  </div>

                  <div className="bg-white border border-[#EDEFEB] rounded-xl p-3.5">
                    <p className="text-[10px] font-bold text-[#94A3B8] tracking-wider mb-0.5">
                      Amount
                    </p>
                    <p className="text-sm font-bold text-[#1E293B]">
                      ₹{bookingResult.amount}
                    </p>
                  </div>

                  <div className="bg-white border border-[#EDEFEB] rounded-xl p-3.5">
                    <p className="text-[10px] font-bold text-[#94A3B8] tracking-wider mb-1">
                      Payment
                    </p>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />✓ Paid
                    </span>
                  </div>

                  <div className="bg-white border border-[#EDEFEB] rounded-xl p-3.5">
                    <p className="text-[10px] font-bold text-[#94A3B8] tracking-wider mb-1">
                      Payment Through
                    </p>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-orange-50 text-[#D95B2F]">
                      {bookingResult.paymentThrough || "UPI"}
                    </span>
                  </div>

                  {bookingResult.patientEmail && (
                    <div className="bg-white border border-[#EDEFEB] rounded-xl p-3.5">
                      <p className="text-[10px] font-bold text-[#94A3B8] tracking-wider mb-0.5">
                        Email
                      </p>
                      <p className="text-sm font-bold text-[#1E293B] truncate">
                        {bookingResult.patientEmail}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#D95B2F] hover:bg-[#c04e26] text-white text-xs font-bold tracking-wide shadow-sm transition-all active:scale-95 cursor-pointer"
                >
                  <Printer size={16} />
                  Print Receipt
                </button>

                <button
                  type="button"
                  onClick={handleNewRegistration}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl border border-[#CBD5E1] hover:bg-slate-50 text-[#334155] text-xs font-bold tracking-wide transition-all cursor-pointer"
                >
                  New Registration
                </button>
              </div>
            </div>
          )}

          {/* ================= PRINT RECEIPT MODAL (Image 4) ================= */}
          {isPrintModalOpen && bookingResult && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4">
              <div className="bg-white rounded-2xl border border-[#EDEFEB] shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Modal Header (Fixed at top) */}
                <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#EDEFEB] shrink-0 bg-white">
                  <h3 className="font-bold text-sm text-[#1E293B] tracking-wide uppercase">
                    PRINT RECEIPT
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsPrintModalOpen(false)}
                    className="text-[#94A3B8] hover:text-[#334155] p-1 rounded-lg transition-colors cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Receipt Body with Scrolling */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                  <div id="printable-receipt" className="border border-[#EDEFEB] rounded-2xl p-5 sm:p-6 bg-white shadow-xs text-center">
                    {/* Logo only (not text) */}
                    <div className="flex justify-center mb-2.5">
                      <img
                        src={logoImg}
                        alt="Susruta Hospital"
                        className="h-10 w-auto max-w-[210px] object-contain mx-auto"
                      />
                    </div>
                    <p className="text-xs text-[#64748B] mt-1 leading-relaxed text-center">
                      119, Ramulavari North Mada Street, Tirupati – 517 507
                    </p>

                    {/* Dashed divider */}
                    <div className="border-t border-dashed border-[#CBD5E1] my-4" />

                    <p className="text-[11px] font-bold text-[#475569] uppercase tracking-wider text-center">
                      OFFLINE APPOINTMENT RECEIPT
                    </p>
                    <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-widest mt-1 text-center">
                      TOKEN NUMBER
                    </p>
                    <h1 className="text-4xl font-extrabold text-[#D95B2F] tracking-tight mt-1 mb-1 text-center">
                      {bookingResult.token}
                    </h1>

                    {/* Dashed divider */}
                    <div className="border-t border-dashed border-[#CBD5E1] my-4" />

                    {/* Key-Value Details */}
                    <div className="receipt-info-table space-y-2.5 my-4 text-xs">
                      <div className="receipt-row flex items-center justify-between">
                        <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                          PATIENT ID
                        </span>
                        <span className="receipt-value font-bold text-[#1E293B] font-mono text-right text-xs break-all pl-2">
                          {bookingResult.patientCode || "—"}
                        </span>
                      </div>

                      <div className="receipt-row flex items-center justify-between">
                        <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                          PATIENT NAME
                        </span>
                        <span className="receipt-value font-bold text-[#1E293B] text-right text-xs break-words pl-2">
                          {bookingResult.patientName}
                        </span>
                      </div>

                      <div className="receipt-row flex items-center justify-between">
                        <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                          PHONE NUMBER
                        </span>
                        <span className="receipt-value font-bold text-[#1E293B] text-right text-xs break-words pl-2 font-mono">
                          {maskPhone(bookingResult.patientPhone)}
                        </span>
                      </div>

                      {bookingResult.patientEmail && (
                        <div className="receipt-row flex items-center justify-between">
                          <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                            EMAIL
                          </span>
                          <span className="receipt-value font-bold text-[#1E293B] text-right text-xs break-words pl-2">
                            {bookingResult.patientEmail}
                          </span>
                        </div>
                      )}

                      <div className="receipt-row flex items-center justify-between">
                        <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                          DATE
                        </span>
                        <span className="receipt-value font-bold text-[#1E293B] text-right text-xs pl-2">
                          {formatShortDate(bookingResult.date)}
                        </span>
                      </div>

                      <div className="receipt-row flex items-center justify-between">
                        <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                          SLOT
                        </span>
                        <span className="receipt-value font-bold text-[#1E293B] text-right text-xs pl-2">
                          {bookingResult.timeSlot}
                        </span>
                      </div>

                      <div className="receipt-row flex items-center justify-between">
                        <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                          AMOUNT
                        </span>
                        <span className="receipt-value font-bold text-[#1E293B] text-right text-xs pl-2">
                          ₹{bookingResult.amount}
                        </span>
                      </div>

                      <div className="receipt-row flex items-center justify-between">
                        <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                          PAYMENT
                        </span>
                        <span className="receipt-value font-bold text-emerald-700 text-right text-xs pl-2">
                          PAID
                        </span>
                      </div>

                      <div className="receipt-row flex items-center justify-between">
                        <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                          PAYMENT THROUGH
                        </span>
                        <span className="receipt-value font-bold text-[#1E293B] text-right text-xs pl-2 uppercase">
                          {bookingResult.paymentThrough || "UPI"}
                        </span>
                      </div>
                    </div>

                    {/* Dashed divider */}
                    <div className="border-t border-dashed border-[#CBD5E1] my-4" />

                    {/* QR Code */}
                    <div className="py-1 text-center">
                      {qrCodeUrl ? (
                        <img
                          src={qrCodeUrl}
                          alt={`Token ${bookingResult.token} QR Code`}
                          className="w-32 h-32 mx-auto rounded-lg"
                        />
                      ) : (
                        <div className="w-32 h-32 mx-auto bg-slate-100 rounded-lg flex items-center justify-center text-xs text-slate-400">
                          Generating QR...
                        </div>
                      )}

                      <p className="font-bold text-xs text-[#1E293B] tracking-wider uppercase mt-2 text-center">
                        TOKEN: {bookingResult.token}
                      </p>
                      <p className="text-[11px] text-[#64748B] mt-1 max-w-[240px] mx-auto leading-tight text-center">
                        Please keep this receipt and wait for your token to be called.
                      </p>
                    </div>

                    {/* Dashed divider */}
                    <div className="border-t border-dashed border-[#CBD5E1] my-4" />

                    <p className="text-xs text-[#94A3B8] italic text-center">
                      Thank you for choosing Susruta Hospital.
                    </p>
                  </div>
                </div>

                {/* Modal Actions (Fixed at bottom) */}
                <div className="flex items-center justify-end gap-3 px-6 py-3.5 border-t border-[#EDEFEB] bg-slate-50/70 shrink-0">
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#D95B2F] hover:bg-[#c04e26] text-white text-xs font-bold tracking-wide shadow-sm transition-all cursor-pointer"
                  >
                    <Printer size={15} />
                    Print Receipt
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsPrintModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl border border-[#CBD5E1] hover:bg-slate-100 text-[#475569] text-xs font-bold tracking-wide transition-all cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Print CSS styling */}
          <style>{`
            @page {
              size: auto;
              margin: 8mm auto;
            }
            @media print {
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                width: 100% !important;
                height: auto !important;
              }
              body * {
                visibility: hidden;
              }
              #printable-receipt, #printable-receipt * {
                visibility: visible;
              }
              #printable-receipt {
                position: absolute;
                left: 50%;
                top: 10px;
                transform: translateX(-50%);
                width: 320px;
                max-width: 80mm;
                padding: 20px !important;
                margin: 0 auto !important;
                border: 1px solid #CBD5E1 !important;
                border-radius: 16px !important;
                background: #ffffff !important;
                box-shadow: none !important;
                page-break-inside: avoid;
                break-inside: avoid;
              }
              #printable-receipt .receipt-info-table {
                width: 100% !important;
              }
              #printable-receipt .receipt-row {
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                width: 100% !important;
                margin-bottom: 8px !important;
              }
              #printable-receipt .receipt-label {
                text-align: left !important;
                white-space: nowrap !important;
                font-weight: 700 !important;
              }
              #printable-receipt .receipt-value {
                text-align: right !important;
                font-weight: 700 !important;
              }
            }
          `}</style>
        </div>
      </div>
    </AdminLayout>
  );
}
