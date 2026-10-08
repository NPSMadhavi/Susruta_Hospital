import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { ChevronLeft, CheckCircle2, Printer, X, Search, Loader2, UserPlus } from "lucide-react";
import { format, parseISO } from "date-fns";
import QRCode from "qrcode";
import { isOfflineSessionExceeded } from "@/lib/ist";
import logoImg from "@assets/logo_1773840200056.png";

const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

interface PatientResult {
  id: number;
  patientCode: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  age?: number | null;
  gender?: string | null;
  address?: string | null;
}

interface BookingResult {
  id: number;
  token: string;
  patientId?: number;
  patientCode?: string;
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  age?: number | null;
  gender?: string | null;
  address?: string | null;
  date: string;
  timeSlot: string;
  amount: number;
  paymentStatus: string;
  paymentThrough?: string;
  notes?: string;
  uploadToken?: string;
  uploadUrl?: string;
  createdAt: string;
}

export default function AdminOfflineRegister() {
  const todayStr = format(new Date(), "yyyy-MM-dd");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchState, setSearchState] = useState<"idle" | "found" | "multiple" | "not_found" | "error">("idle");
  const [searchResults, setSearchResults] = useState<PatientResult[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null);

  // Form patient details
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");

  // Appointment details
  const [appointmentDate, setAppointmentDate] = useState(todayStr);

  const SESSIONS = [
    { id: "morning", label: "10 AM - 1 PM", slotCount: 12 },
    { id: "evening", label: "6 PM - 10 PM", slotCount: 16 },
  ];

  const [selectedSessionId, setSelectedSessionId] = useState<"morning" | "evening">("morning");

  const [slotStatus, setSlotStatus] = useState<{
    morning: { label: string; total: number; booked: number; remaining: number; isAvailable: boolean; isExceeded?: boolean };
    evening: { label: string; total: number; booked: number; remaining: number; isAvailable: boolean; isExceeded?: boolean };
  }>({
    morning: { label: "10 AM - 1 PM", total: 12, booked: 0, remaining: 12, isAvailable: true },
    evening: { label: "6 PM - 10 PM", total: 16, booked: 0, remaining: 16, isAvailable: true },
  });

  const [amount, setAmount] = useState("200");
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "unpaid">("unpaid");
  const [paymentThrough, setPaymentThrough] = useState<"UPI" | "Cash">("UPI");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Booking result & print modal state
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");

  const currentSessionLabel =
    selectedSessionId === "morning"
      ? (slotStatus.morning.label || "10 AM - 1 PM")
      : (slotStatus.evening.label || "6 PM - 10 PM");

  const isMorningExceeded = isOfflineSessionExceeded(appointmentDate, "morning");
  const isEveningExceeded = isOfflineSessionExceeded(appointmentDate, "evening");
  const isCurrentSessionAvailable =
    selectedSessionId === "morning"
      ? (slotStatus.morning.isAvailable && !isMorningExceeded && slotStatus.morning.remaining > 0 && slotStatus.morning.label !== "Closed" && slotStatus.morning.label !== "Closed on Sunday")
      : (slotStatus.evening.isAvailable && !isEveningExceeded && slotStatus.evening.remaining > 0 && slotStatus.evening.label !== "Closed" && slotStatus.evening.label !== "Closed on Sunday");

  // Fetch slot status for chosen date
  const fetchSlotStatus = async (date: string) => {
    try {
      let res = await fetch(`${API}/appointments/offline/slots-status?date=${date}`, {
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        const morningData = data.morning ?? { label: "10 AM - 1 PM", total: 12, booked: 0, remaining: 12, isAvailable: true };
        const eveningData = data.evening ?? { label: "6 PM - 10 PM", total: 16, booked: 0, remaining: 16, isAvailable: true };

        setSlotStatus({
          morning: morningData,
          evening: eveningData,
        });

        const mAvail = morningData.isAvailable && !morningData.isExceeded && morningData.remaining > 0 && morningData.label !== "Closed" && morningData.label !== "Closed on Sunday";
        const eAvail = eveningData.isAvailable && !eveningData.isExceeded && eveningData.remaining > 0 && eveningData.label !== "Closed" && eveningData.label !== "Closed on Sunday";

        setSelectedSessionId((prev) => {
          if (prev === "morning" && !mAvail && eAvail) return "evening";
          if (prev === "evening" && !eAvail && mAvail) return "morning";
          return prev;
        });
        return;
      }

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
            label: "10 AM - 1 PM",
            total: 12,
            booked: mBooked,
            remaining: Math.max(0, 12 - mBooked),
            isAvailable: mBooked < 12,
          },
          evening: {
            label: "6 PM - 10 PM",
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

  const slotDisplayLabel = currentSessionLabel;

  // Generate QR Code for booking result — Temporary Medical Document Upload ONLY
  useEffect(() => {
    if (!bookingResult) return;
    const tokenStr = bookingResult.uploadToken || "";
    const uploadFullUrl = tokenStr
      ? `${window.location.origin}/portal/document-upload?token=${tokenStr}`
      : `${window.location.origin}/portal/document-upload`;

    QRCode.toDataURL(uploadFullUrl, {
      width: 160,
      margin: 1,
      color: {
        dark: "#1E293B",
        light: "#FFFFFF",
      },
    })
      .then((url) => setQrCodeUrl(url))
      .catch((err) => console.error("QR Code error:", err));
  }, [bookingResult]);

  // Search patient handler (server-side)
  const handleSearchPatient = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setIsSearching(true);
    setErrorMsg("");

    try {
      const res = await fetch(`${API}/admin/patients/search?query=${encodeURIComponent(query)}`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`Failed to search patients (${res.status})`);
      }

      const data: PatientResult[] = await res.json();
      setSearchResults(data);

      if (data.length === 0) {
        setSearchState("not_found");
        setSelectedPatient(null);
      } else if (data.length === 1) {
        handleSelectPatient(data[0]);
      } else {
        setSearchState("multiple");
        setSelectedPatient(null);
      }
    } catch (err: any) {
      console.error("Patient search error:", err);
      setSearchState("error");
      setSearchResults([]);
      setSelectedPatient(null);
    } finally {
      setIsSearching(false);
    }
  };

  // Select patient handler
  const handleSelectPatient = (patient: PatientResult) => {
    setSelectedPatient(patient);
    setSearchState("found");
    setPatientName(patient.name || "");
    const cleanP = patient.phone ? patient.phone.replace(/\D/g, "").slice(-10) : "";
    setPatientPhone(cleanP);
    setPatientEmail(patient.email || "");
    setAge(patient.age !== undefined && patient.age !== null ? String(patient.age) : "");
    setGender(patient.gender || "");
    setAddress(patient.address || "");
    setErrorMsg("");
  };

  // Register new patient action from search panel
  const handlePrepareNewPatient = () => {
    setSelectedPatient(null);
    setSearchState("idle");
    setSearchQuery("");
    setSearchResults([]);
    setPatientName("");
    setPatientPhone("");
    setPatientEmail("");
    setAge("");
    setGender("");
    setAddress("");
    setErrorMsg("");
  };

  // Form clear handler (resets frontend state ONLY)
  const handleClear = () => {
    setSearchQuery("");
    setSearchResults([]);
    setSearchState("idle");
    setSelectedPatient(null);

    setPatientName("");
    setPatientPhone("");
    setPatientEmail("");
    setAge("");
    setGender("");
    setAddress("");

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

  // Generate Token Form submit
  const handleGenerateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!isCurrentSessionAvailable) {
      setErrorMsg(`No slots are available for ${currentSessionLabel} on this date.`);
      return;
    }
    if (!patientName.trim()) {
      setErrorMsg("Please enter patient name.");
      return;
    }
    const rawDigits = patientPhone.replace(/\D/g, "");
    const cleanPhone = rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits;
    if (!cleanPhone) {
      setErrorMsg("Please enter patient phone number.");
      return;
    }
    if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      setErrorMsg("Please enter a valid 10-digit Indian phone number (starting with 6, 7, 8, or 9).");
      return;
    }
    const parsedAge = age.trim() === "" ? null : Number(age.trim());
    if (parsedAge === null || isNaN(parsedAge) || parsedAge < 0 || parsedAge > 150) {
      setErrorMsg("Please enter a valid patient age between 0 and 150.");
      return;
    }
    if (!gender.trim()) {
      setErrorMsg("Please select gender.");
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
      const res = await fetch(`${API}/appointments/offline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          selectedPatientId: selectedPatient ? selectedPatient.id : undefined,
          patientName: patientName.trim(),
          patientPhone: phoneWithCountry,
          patientEmail: emailPayload,
          age: parsedAge,
          gender: gender.trim(),
          address: address.trim() || undefined,
          date: appointmentDate,
          timeSlot: slotDisplayLabel,
          amount: Number(amount) || 200,
          notes: notes.trim(),
          paymentStatus: "paid",
          paymentThrough: paymentThrough,
        }),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        if (!res.ok) {
          throw new Error(`Server responded with ${res.status}. Please try again.`);
        }
      }

      if (!res.ok) {
        throw new Error(data?.message || `Failed to generate token (${res.status})`);
      }

      setBookingResult({
        id: data.id || Date.now(),
        token: data.token || tokenComputed,
        patientId: data.patientId || selectedPatient?.id,
        patientCode: data.patientCode || selectedPatient?.patientCode || "",
        patientName: patientName.trim(),
        patientPhone: cleanPhone,
        patientEmail: data.patientEmail || emailPayload || "",
        age: data.age !== undefined ? data.age : parsedAge,
        gender: data.gender || gender,
        address: data.address || address.trim(),
        date: appointmentDate,
        timeSlot: slotDisplayLabel,
        amount: Number(amount) || 200,
        paymentStatus: "paid",
        paymentThrough: data.paymentThrough || paymentThrough,
        notes: notes.trim(),
        createdAt: data.createdAt || new Date().toISOString(),
      });

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

          {!bookingResult ? (
            /* =================== FORM STATE =================== */
            <div className="bg-white rounded-2xl border border-[#EDEFEB] p-6 sm:p-8 w-full shadow-sm">
              {/* FIND EXISTING PATIENT SECTION */}
              <div className="bg-[#F8FAFC] border border-[#CBD5E1]/70 rounded-2xl p-5 mb-6">
                <h2 className="text-md font-extrabold text-[#1E293B] tracking-wider mb-1">
                  Find Existing Patient
                </h2>
                <p className="text-xs text-[#64748B] mb-3">
                  Search Patient ID, Full Name or Phone Number
                </p>

                <form onSubmit={handleSearchPatient} className="flex flex-col sm:flex-row gap-2.5">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" size={16} />
                    <input
                      type="text"
                      placeholder="Search Patient ID (e.g. P0234), Full Name, or Phone Number"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#CBD5E1] text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] bg-white transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSearching || !searchQuery.trim()}
                    className="px-6 py-2.5 rounded-xl bg-[#1E293B] hover:bg-[#0F172A] text-white text-xs font-bold tracking-wide transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shrink-0"
                  >
                    {isSearching ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Searching...
                      </>
                    ) : (
                      "Search"
                    )}
                  </button>
                </form>

                {/* Search Results & Statuses */}
                {searchState === "found" && selectedPatient && (
                  <div className="mt-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>Existing Patient Found ✓ ({selectedPatient.patientCode || `ID #${selectedPatient.id}`}) — {selectedPatient.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handlePrepareNewPatient}
                      className="text-emerald-700 hover:text-emerald-900 underline text-[11px] font-semibold cursor-pointer"
                    >
                      Change Patient / Register New
                    </button>
                  </div>
                )}

                {searchState === "multiple" && searchResults.length > 1 && (
                  <div className="mt-4 space-y-2.5">
                    <p className="text-xs font-bold text-[#D95B2F]">
                      Multiple patients found. Please select the correct patient:
                    </p>
                    <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                      {searchResults.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => handleSelectPatient(p)}
                          className="p-3 bg-white rounded-xl border border-[#CBD5E1] hover:border-[#D95B2F] flex items-center justify-between text-xs transition-all cursor-pointer shadow-2xs"
                        >
                          <div>
                            <div className="font-bold text-[#1E293B] flex items-center gap-2">
                              <span>{p.name}</span>
                              <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                                {p.patientCode || `ID #${p.id}`}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#64748B] mt-0.5 flex flex-wrap items-center gap-3">
                              <span>Phone: {p.phone || "—"}</span>
                              <span>Age: {p.age !== null && p.age !== undefined ? `${p.age} yrs` : "—"}</span>
                              <span>Gender: {p.gender || "—"}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectPatient(p);
                            }}
                            className="px-3.5 py-1.5 rounded-lg bg-[#D95B2F] hover:bg-[#c04e26] text-white font-bold text-[11px] cursor-pointer"
                          >
                            Select
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {searchState === "not_found" && (
                  <div className="mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-bold">Patient not found.</span> Please verify the Patient ID or register a new patient.
                    </div>
                    <button
                      type="button"
                      onClick={handlePrepareNewPatient}
                      className="px-3.5 py-1.5 rounded-lg bg-[#D95B2F] hover:bg-[#c04e26] text-white font-bold text-xs shrink-0 cursor-pointer flex items-center gap-1.5"
                    >
                      <UserPlus size={14} />
                      Register New Patient
                    </button>
                  </div>
                )}

                {searchState === "error" && (
                  <div className="mt-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 font-medium">
                    Unable to search patients. Please try again.
                  </div>
                )}
              </div>

              {/* PATIENT INFORMATION SECTION */}
              <div className="border-t border-[#EDEFEB] pt-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-md font-bold text-[#1E293B] tracking-wider">
                    Patient Information
                  </h2>
                  {selectedPatient ? (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md">
                      Existing Patient ({selectedPatient.patientCode || `ID #${selectedPatient.id}`})
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-md">
                      New Patient
                    </span>
                  )}
                </div>

                {errorMsg && (
                  <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-600">
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleGenerateToken} className="space-y-5">
                  {/* Row 1: Patient ID & Patient Name */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#475569] tracking-wider mb-2">
                        Patient ID
                      </label>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={selectedPatient?.patientCode || (selectedPatient ? `ID #${selectedPatient.id}` : "Auto-generated on registration")}
                        className="w-full px-4 py-2.5 rounded-xl border border-[#CBD5E1] text-sm font-bold font-mono text-[#475569] bg-slate-100 cursor-not-allowed select-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#475569] tracking-wider mb-2">
                        Patient Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        readOnly={Boolean(selectedPatient)}
                        disabled={Boolean(selectedPatient)}
                        placeholder="Enter full name"
                        value={patientName}
                        onChange={(e) => setPatientName(e.target.value)}
                        className={`w-full px-4 py-2.5 rounded-xl border border-[#CBD5E1] text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all ${
                          selectedPatient ? "bg-slate-100 font-semibold cursor-not-allowed text-[#475569]" : ""
                        }`}
                      />
                    </div>
                  </div>

                  {/* Row 2: Phone Number & Email */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                          readOnly={Boolean(selectedPatient)}
                          disabled={Boolean(selectedPatient)}
                          placeholder="Enter 10-digit phone number"
                          value={patientPhone}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                            setPatientPhone(val);
                            if (errorMsg) setErrorMsg("");
                          }}
                          className={`w-full pl-12 pr-4 py-2.5 rounded-xl border text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 transition-all ${
                            selectedPatient
                              ? "bg-slate-100 font-semibold cursor-not-allowed border-[#CBD5E1] text-[#475569]"
                              : patientPhone.length > 0 && !/^[6-9]/.test(patientPhone)
                              ? "border-red-400 focus:ring-red-500/20 focus:border-red-500"
                              : patientPhone.length === 10 && /^[6-9]\d{9}$/.test(patientPhone)
                              ? "border-emerald-400 focus:ring-emerald-500/20 focus:border-emerald-500"
                              : "border-[#CBD5E1] focus:ring-[#D95B2F]/20 focus:border-[#D95B2F]"
                          }`}
                        />
                      </div>
                      {patientPhone.length > 0 && !/^[6-9]/.test(patientPhone) && !selectedPatient && (
                        <p className="text-[11px] text-red-500 font-medium mt-1">
                          Indian mobile numbers must start with 6, 7, 8, or 9
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#475569] tracking-wider mb-2">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        readOnly={Boolean(selectedPatient)}
                        disabled={Boolean(selectedPatient)}
                        placeholder="Enter email address"
                        value={patientEmail}
                        onChange={(e) => {
                          setPatientEmail(e.target.value);
                          if (errorMsg) setErrorMsg("");
                        }}
                        className={`w-full px-4 py-2.5 rounded-xl border border-[#CBD5E1] text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all ${
                          selectedPatient ? "bg-slate-100 font-semibold cursor-not-allowed text-[#475569]" : ""
                        }`}
                      />
                    </div>
                  </div>

                  {/* Row 3: Age & Gender */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#475569] tracking-wider mb-2">
                        Age <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={150}
                        required
                        readOnly={Boolean(selectedPatient)}
                        disabled={Boolean(selectedPatient)}
                        placeholder="Enter age"
                        value={age}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "").slice(0, 3);
                          setAge(val);
                        }}
                        onWheel={(e) => e.currentTarget.blur()}
                        className={`w-full px-4 py-2.5 rounded-xl border border-[#CBD5E1] text-sm font-semibold text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                          selectedPatient ? "bg-slate-100 cursor-not-allowed text-[#475569]" : ""
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#475569] tracking-wider mb-2">
                        Gender <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        disabled={Boolean(selectedPatient)}
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        className={`w-full px-4 py-2.5 rounded-xl border border-[#CBD5E1] text-sm font-semibold text-[#1E293B] bg-white focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all ${
                          selectedPatient ? "bg-slate-100 cursor-not-allowed text-[#475569]" : "cursor-pointer"
                        }`}
                      >
                        <option value="" disabled>Select gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  {/* Row 4: Address */}
                  <div>
                    <label className="block text-xs font-bold text-[#475569] tracking-wider mb-2">
                      Address <span className="text-xs font-normal text-[#94A3B8]">(Optional)</span>
                    </label>
                    <textarea
                      rows={2}
                      readOnly={Boolean(selectedPatient)}
                      disabled={Boolean(selectedPatient)}
                      placeholder="Enter address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className={`w-full px-4 py-2.5 rounded-xl border border-[#CBD5E1] text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all ${
                        selectedPatient ? "bg-slate-100 cursor-not-allowed text-[#475569]" : ""
                      }`}
                    />
                  </div>

                  {/* APPOINTMENT DETAILS SECTION */}
                  <div className="border-t border-[#EDEFEB] pt-6 space-y-5">
                    <h2 className="text-md font-bold text-[#1E293B] tracking-wider mb-4">
                      Appointment Details
                    </h2>

                    {/* Appointment Date */}
                    <div>
                      <label className="block text-xs font-bold text-[#475569] tracking-wider mb-2">
                        Appointment Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        min={todayStr}
                        value={appointmentDate}
                        onChange={(e) => setAppointmentDate(e.target.value)}
                        className="w-full sm:w-1/2 px-4 py-2.5 rounded-xl border border-[#CBD5E1] text-sm text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all"
                      />
                    </div>

                    {/* Time Slots */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-bold text-[#475569] tracking-wider">
                          Time Slots <span className="text-red-500">*</span>
                        </label>
                        <span className="text-[11px] text-[#64748B] font-medium">
                          15 mins duration / slot
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {SESSIONS.map((s) => {
                          const isSelected = selectedSessionId === s.id;
                          const status = s.id === "morning" ? slotStatus.morning : slotStatus.evening;
                          const dynamicLabel = status.label || s.label;
                          const isClosed = dynamicLabel === "Closed" || dynamicLabel === "Closed on Sunday";
                          const isExceeded = isOfflineSessionExceeded(appointmentDate, s.id as "morning" | "evening");
                          const remaining = isClosed || isExceeded ? 0 : status.remaining;
                          const isAvailable = !isClosed && !isExceeded && (status.isAvailable ?? true) && remaining > 0;

                          return (
                            <button
                              key={s.id}
                              type="button"
                              disabled={!isAvailable}
                              onClick={() => {
                                if (isAvailable) setSelectedSessionId(s.id as "morning" | "evening");
                              }}
                              className={`px-4 py-3 rounded-xl text-xs font-bold tracking-wide transition-all text-left flex items-center justify-between ${
                                !isAvailable
                                  ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60"
                                  : isSelected
                                  ? "bg-[#D95B2F] text-white shadow-xs border border-[#D95B2F] cursor-pointer"
                                  : "bg-slate-50 text-[#475569] border border-[#CBD5E1] hover:border-[#94A3B8] hover:bg-slate-100 cursor-pointer"
                              }`}
                            >
                              <span>{dynamicLabel}</span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-md font-extrabold ${
                                  !isAvailable
                                    ? "bg-red-100 text-red-600"
                                    : isSelected
                                    ? "bg-white/20 text-white"
                                    : "bg-[#CBD5E1]/40 text-[#475569]"
                                }`}
                              >
                                {isClosed
                                  ? "Closed"
                                  : isAvailable
                                  ? `${remaining} Slots Available`
                                  : "No slots available"}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {!isCurrentSessionAvailable && (
                        <div className="mt-2.5 p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                          <span>
                            No slots are available for {currentSessionLabel} on this date.
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Consultation Amount, Payment Status & Payment Through */}
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
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, "");
                              setAmount(val);
                            }}
                            className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-[#CBD5E1] text-sm font-semibold text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#475569] tracking-wider mb-2">
                          Payment through <span className="text-red-500">*</span>
                        </label>

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

                      <div>
                        <label className="block text-xs font-bold text-[#475569] tracking-wider mb-2">
                          Payment Status <span className="text-red-500">*</span>
                        </label>

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

                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-xs font-bold text-[#475569] tracking-wider mb-2">
                        Notes <span className="text-xs font-normal text-[#94A3B8]">(Optional)</span>
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Add any additional information..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-[#CBD5E1] text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all"
                      />
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[#EDEFEB]">
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
                        className="w-full sm:w-auto px-6 py-3 rounded-xl border border-[#CBD5E1] hover:bg-slate-50 text-[#475569] text-xs font-bold tracking-wide transition-all cursor-pointer"
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
                          !age.trim() ||
                          !gender.trim() ||
                          isSubmitting
                        }
                        className="w-full sm:w-auto px-8 py-3 rounded-xl bg-[#D95B2F] hover:bg-[#c04e26] text-white text-xs font-bold tracking-wide shadow-xs transition-all disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-[#D95B2F] cursor-pointer"
                      >
                        {isSubmitting ? "Generating..." : "Generate Token"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            /* ================= TOKEN CONFIRMATION ================= */
            <div className="bg-white rounded-2xl border border-[#EDEFEB] p-6 sm:p-8 w-full shadow-sm animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs tracking-wider mb-6">
                <CheckCircle2 size={18} className="text-emerald-600" />
                Offline Booking Created
              </div>

              <div className="border border-[#EDEFEB] rounded-2xl p-6 sm:p-8 bg-[#F8FAFC]/50 text-center mb-8">
                <p className="text-[13px] font-bold tracking-widest text-[#94A3B8] mb-1">
                  Token
                </p>
                <h2 className="text-6xl sm:text-7xl font-extrabold text-[#D95B2F] tracking-tight mb-8">
                  {bookingResult.token}
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-left">
                  <div className="bg-white border border-[#EDEFEB] rounded-xl p-3.5">
                    <p className="text-[10px] font-bold text-[#94A3B8] tracking-wider mb-0.5">
                      Patient ID
                    </p>
                    <p className="text-sm font-bold font-mono text-[#1E293B]">
                      {bookingResult.patientCode || "—"}
                    </p>
                  </div>

                  <div className="bg-white border border-[#EDEFEB] rounded-xl p-3.5">
                    <p className="text-[10px] font-bold text-[#94A3B8] tracking-wider mb-0.5">
                      Patient Name
                    </p>
                    <p className="text-sm font-bold text-[#1E293B] truncate">
                      {bookingResult.patientName}
                    </p>
                  </div>

                  <div className="bg-white border border-[#EDEFEB] rounded-xl p-3.5">
                    <p className="text-[10px] font-bold text-[#94A3B8] tracking-wider mb-0.5">
                      Phone Number
                    </p>
                    <p className="text-sm font-bold font-mono text-[#1E293B]">
                      {bookingResult.patientPhone}
                    </p>
                  </div>

                  <div className="bg-white border border-[#EDEFEB] rounded-xl p-3.5">
                    <p className="text-[10px] font-bold text-[#94A3B8] tracking-wider mb-0.5">
                      Age / Gender
                    </p>
                    <p className="text-sm font-bold text-[#1E293B]">
                      {bookingResult.age !== undefined && bookingResult.age !== null ? `${bookingResult.age} yrs / ${bookingResult.gender || "—"}` : "—"}
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

                  {bookingResult.address && (
                    <div className="bg-white border border-[#EDEFEB] rounded-xl p-3.5 sm:col-span-2 md:col-span-3">
                      <p className="text-[10px] font-bold text-[#94A3B8] tracking-wider mb-0.5">
                        Address
                      </p>
                      <p className="text-xs font-semibold text-[#1E293B]">
                        {bookingResult.address}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#D95B2F] hover:bg-[#c04e26] text-white text-xs font-bold tracking-wide shadow-xs transition-all cursor-pointer"
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

          {/* PRINT RECEIPT MODAL */}
          {isPrintModalOpen && bookingResult && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4">
              <div className="bg-white rounded-2xl border border-[#EDEFEB] shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#EDEFEB] shrink-0 bg-white">
                  <h3 className="font-bold text-sm text-[#1E293B] tracking-wide">
                    Print Receipt
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsPrintModalOpen(false)}
                    className="text-[#94A3B8] hover:text-[#334155] p-1 rounded-lg transition-colors cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                  <div id="printable-receipt" className="border border-[#EDEFEB] rounded-2xl p-5 sm:p-6 bg-white shadow-xs text-center">
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

                    <div className="border-t border-dashed border-[#CBD5E1] my-4" />

                    <p className="text-[11px] font-bold text-[#475569] tracking-wider text-center">
                      OFFLINE APPOINTMENT RECEIPT
                    </p>
                    <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-widest mt-1 text-center">
                      Token Number
                    </p>
                    <h1 className="text-4xl font-extrabold text-[#D95B2F] tracking-tight mt-1 mb-1 text-center">
                      {bookingResult.token}
                    </h1>

                    <div className="border-t border-dashed border-[#CBD5E1] my-4" />

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

                    <div className="border-t border-dashed border-[#CBD5E1] my-4" />

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
                      <p className="text-[11px] font-semibold text-[#D95B2F] mt-1.5 max-w-[260px] mx-auto leading-tight text-center">
                        Scan this QR code to upload medical documents for your offline consultation.
                      </p>
                      <p className="text-[10px] text-[#64748B] mt-0.5 text-center">
                        QR access expires after 24 hours.
                      </p>
                    </div>

                    <div className="border-t border-dashed border-[#CBD5E1] my-4" />

                    <p className="text-xs text-[#94A3B8] italic text-center">
                      Thank you for choosing Susruta Hospital.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-3.5 border-t border-[#EDEFEB] bg-slate-50/70 shrink-0">
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#D95B2F] hover:bg-[#c04e26] text-white text-xs font-bold tracking-wide shadow-xs transition-all cursor-pointer"
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
