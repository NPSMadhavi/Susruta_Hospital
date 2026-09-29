import React, { useState, useEffect } from "react";
import {
  User, Mail, Phone, Hash, Pencil, CheckCircle2, AlertCircle,
  Loader2, ShieldCheck, X, RotateCcw, KeyRound, MapPin
} from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@/components/ui/input-otp";
import { patientApi } from "@/lib/patient-api";

export interface PatientProfileData {
  id: number;
  patientCode: string | null;
  name: string;
  age?: number | null;
  gender?: string | null;
  address?: string | null;
  email: string;
  phone: string | null;
  avatarUrl?: string | null;
  emailVerified?: boolean;
}

interface PatientProfileProps {
  patient: PatientProfileData;
  onPatientUpdate: (updated: PatientProfileData) => void;
}

export default function PatientProfile({ patient, onPatientUpdate }: PatientProfileProps) {
  // Name edit state
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(patient.name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");
  const [nameSuccess, setNameSuccess] = useState("");

  // Details (Age & Gender) edit state
  const [editingDetails, setEditingDetails] = useState(false);
  const [ageInput, setAgeInput] = useState(patient.age ? String(patient.age) : "");
  const [genderInput, setGenderInput] = useState(patient.gender || "");
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [detailsSuccess, setDetailsSuccess] = useState("");

  // Address edit state
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressInput, setAddressInput] = useState(patient.address || "");
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [addressSuccess, setAddressSuccess] = useState("");

  // Email modal/panel state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailStep, setEmailStep] = useState<"input" | "otp">("input");
  const [newEmail, setNewEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [emailCooldown, setEmailCooldown] = useState(0);

  // Phone modal/panel state
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneStep, setPhoneStep] = useState<"input" | "otp">("input");
  const [newPhone, setNewPhone] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [phoneSuccess, setPhoneSuccess] = useState("");
  const [phoneCooldown, setPhoneCooldown] = useState(0);

  // Sync inputs if patient props change
  useEffect(() => {
    if (!editingName) setNameInput(patient.name || "");
  }, [patient.name, editingName]);

  useEffect(() => {
    if (!editingDetails) {
      setAgeInput(patient.age ? String(patient.age) : "");
      setGenderInput(patient.gender || "");
    }
  }, [patient.age, patient.gender, editingDetails]);

  useEffect(() => {
    if (!editingAddress) setAddressInput(patient.address || "");
  }, [patient.address, editingAddress]);

  // Handle Address Save
  async function handleSaveAddress() {
    setAddressError("");
    setAddressSuccess("");
    const trimmed = addressInput.trim();
    if (!trimmed) {
      setAddressError("Please enter your address.");
      return;
    }
    setSavingAddress(true);
    try {
      const res = await patientApi.updateAddress(trimmed);
      if (res.patient) {
        onPatientUpdate(res.patient);
        setAddressSuccess("Address updated successfully!");
        setEditingAddress(false);
        setTimeout(() => setAddressSuccess(""), 3500);
      }
    } catch (err: any) {
      setAddressError(err?.message || "Failed to update address. Please try again.");
    } finally {
      setSavingAddress(false);
    }
  }

  // Handle Details (Age & Gender) Save
  async function handleSaveDetails() {
    setDetailsError("");
    setDetailsSuccess("");
    const parsedAge = Number(ageInput);
    if (!ageInput || isNaN(parsedAge) || parsedAge < 1 || parsedAge > 120) {
      setDetailsError("Please enter a valid age between 1 and 120.");
      return;
    }
    if (!genderInput || !["Male", "Female", "Other"].includes(genderInput)) {
      setDetailsError("Please select your gender.");
      return;
    }
    setSavingDetails(true);
    try {
      const res = await patientApi.updateDetails({ age: parsedAge, gender: genderInput });
      if (res.patient) {
        onPatientUpdate(res.patient);
        setDetailsSuccess("Age & Gender updated successfully!");
        setEditingDetails(false);
        setTimeout(() => setDetailsSuccess(""), 3500);
      }
    } catch (err: any) {
      setDetailsError(err?.message || "Failed to update details. Please try again.");
    } finally {
      setSavingDetails(false);
    }
  }

  // Email countdown timer
  useEffect(() => {
    if (emailCooldown <= 0) return;
    const timer = setInterval(() => {
      setEmailCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [emailCooldown]);

  // Phone countdown timer
  useEffect(() => {
    if (phoneCooldown <= 0) return;
    const timer = setInterval(() => {
      setPhoneCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [phoneCooldown]);

  // Handle Name Save
  async function handleSaveName() {
    setNameError("");
    setNameSuccess("");
    const trimmed = nameInput.trim();
    if (trimmed.length < 2) {
      setNameError("Full name must be at least 2 characters.");
      return;
    }
    if (trimmed.length > 100) {
      setNameError("Full name must not exceed 100 characters.");
      return;
    }
    setSavingName(true);
    try {
      const res = await patientApi.updateName(trimmed);
      if (res.patient) {
        onPatientUpdate(res.patient);
        setNameSuccess("Full name updated successfully!");
        setEditingName(false);
        setTimeout(() => setNameSuccess(""), 3500);
      }
    } catch (err: any) {
      setNameError(err?.message || "Failed to update full name. Please try again.");
    } finally {
      setSavingName(false);
    }
  }

  // Handle Request Email OTP
  async function handleRequestEmailOtp() {
    setEmailError("");
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    if (trimmed === patient.email.toLowerCase()) {
      setEmailError("This is already your current registered email.");
      return;
    }
    setEmailLoading(true);
    try {
      const res = await patientApi.requestEmailOtp(trimmed);
      setEmailCooldown(res.cooldownSeconds || 60);
      setEmailOtp("");
      setEmailStep("otp");
    } catch (err: any) {
      setEmailError(err?.message || "Failed to send verification code. Please try again.");
    } finally {
      setEmailLoading(false);
    }
  }

  // Handle Verify Email OTP
  async function handleVerifyEmailOtp() {
    setEmailError("");
    if (emailOtp.length !== 6) {
      setEmailError("Please enter the complete 6-digit verification code.");
      return;
    }
    setEmailLoading(true);
    try {
      const res = await patientApi.verifyEmailOtp(newEmail.trim().toLowerCase(), emailOtp.trim());
      if (res.patient) {
        onPatientUpdate(res.patient);
        setEmailSuccess("Email updated and verified successfully!");
        setShowEmailModal(false);
        setEmailStep("input");
        setNewEmail("");
        setEmailOtp("");
        setTimeout(() => setEmailSuccess(""), 4000);
      }
    } catch (err: any) {
      setEmailError(err?.message || "Invalid verification code. Please try again.");
    } finally {
      setEmailLoading(false);
    }
  }

  // Handle Request Phone OTP
  async function handleRequestPhoneOtp() {
    setPhoneError("");
    const digits = newPhone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setPhoneError("Please enter a valid 10-digit Indian phone number.");
      return;
    }
    if (!/^[6-9]/.test(digits)) {
      setPhoneError("Indian phone numbers must start with 6, 7, 8, or 9.");
      return;
    }
    const formatted = `+91${digits}`;
    if (patient.phone === formatted) {
      setPhoneError("This is already your current registered phone number.");
      return;
    }
    setPhoneLoading(true);
    try {
      const res = await patientApi.requestPhoneOtp(formatted);
      setPhoneCooldown(res.cooldownSeconds || 60);
      setPhoneOtp("");
      setPhoneStep("otp");
    } catch (err: any) {
      setPhoneError(err?.message || "Failed to send verification code. Please try again.");
    } finally {
      setPhoneLoading(false);
    }
  }

  // Handle Verify Phone OTP
  async function handleVerifyPhoneOtp() {
    setPhoneError("");
    if (phoneOtp.length !== 6) {
      setPhoneError("Please enter the complete 6-digit verification code.");
      return;
    }
    const digits = newPhone.replace(/\D/g, "");
    const formatted = `+91${digits}`;
    setPhoneLoading(true);
    try {
      const res = await patientApi.verifyPhoneOtp(formatted, phoneOtp.trim());
      if (res.patient) {
        onPatientUpdate(res.patient);
        setPhoneSuccess("Phone number updated successfully!");
        setShowPhoneModal(false);
        setPhoneStep("input");
        setNewPhone("");
        setPhoneOtp("");
        setTimeout(() => setPhoneSuccess(""), 4000);
      }
    } catch (err: any) {
      setPhoneError(err?.message || "Invalid verification code. Please try again.");
    } finally {
      setPhoneLoading(false);
    }
  }

  // Initials for avatar
  const initials = (patient.name || "P")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  return (
    <div className="max-w-2xl mx-auto space-y-6 w-full py-4 animate-in fade-in duration-200 font-sans">
      {/* ── Page Header (Centered) ── */}
      <div className="text-center sm:text-left space-y-1">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight font-sans">Profile</h1>
        <p className="text-sm text-gray-500 font-medium font-sans">
          Manage your personal details and securely update your registered email or phone number.
        </p>
      </div>

      {/* Global Success Banners */}
      {nameSuccess && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-sm font-medium animate-in fade-in">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{nameSuccess}</span>
        </div>
      )}
      {detailsSuccess && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-sm font-medium animate-in fade-in">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{detailsSuccess}</span>
        </div>
      )}
      {addressSuccess && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-sm font-medium animate-in fade-in">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{addressSuccess}</span>
        </div>
      )}
      {emailSuccess && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-sm font-medium animate-in fade-in">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{emailSuccess}</span>
        </div>
      )}
      {phoneSuccess && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-sm font-medium animate-in fade-in">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{phoneSuccess}</span>
        </div>
      )}

      {/* ── Top Patient Summary Card ── */}
      <div className="bg-[#D95B2F] text-white rounded-3xl p-6 sm:p-7 shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/15 border-2 border-white/20 flex items-center justify-center text-2xl font-black tracking-widest text-white shrink-0 shadow-inner font-sans">
            {initials}
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white leading-snug font-sans">{patient.name}</h2>
            <div className="flex flex-wrap items-center gap-2.5 mt-1.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-lg border border-white text-xs font-mono font-bold tracking-wider text-white">
                <Hash size={12} className="text-white" />
                {patient.patientCode}
              </span>
              {(patient.age || patient.gender) && (
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-lg border border-white/80 text-xs font-semibold text-white">
                  {[patient.age ? `${patient.age} Yrs` : null, patient.gender].filter(Boolean).join(" • ")}
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-white text-[11px] font-semibold text-white font-sans">
                <ShieldCheck size={13} className="text-emerald-300" />
                Verified
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Details Card ── */}
      <div className="bg-white rounded-3xl border border-[#EDEFEB] shadow-sm overflow-hidden divide-y divide-gray-100">
        {/* 1. Full Name */}
        <div className="p-6 sm:p-7 transition-colors hover:bg-gray-50/40">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <User size={15} className="text-gray-400" />
                <p className="text-xs font-bold text-gray-400 tracking-wider font-sans">Full Name</p>
              </div>
              {!editingName ? (
                <p className="font-extrabold text-xl text-gray-900 mt-1 truncate font-sans">{patient.name}</p>
              ) : (
                <div className="mt-2 space-y-3 max-w-md">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Enter your full name"
                    autoFocus
                    maxLength={100}
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all font-sans"
                  />
                  {nameError && (
                    <p className="text-xs font-medium text-red-600 flex items-center gap-1.5 font-sans">
                      <AlertCircle size={13} /> {nameError}
                    </p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSaveName}
                      disabled={savingName || nameInput.trim().length < 2}
                      className="px-5 py-2 bg-[#D95B2F] hover:bg-[#C84F27] text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5 font-sans active:scale-95"
                    >
                      {savingName ? <Loader2 size={13} className="animate-spin" /> : null}
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingName(false);
                        setNameInput(patient.name || "");
                        setNameError("");
                      }}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors font-sans"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            {!editingName && (
              <button
                type="button"
                onClick={() => {
                  setNameInput(patient.name || "");
                  setNameError("");
                  setEditingName(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-[#D95B2F] bg-[#D95B2F]/10 hover:bg-[#D95B2F]/20 transition-colors shrink-0 active:scale-95 font-sans"
              >
                <Pencil size={13} /> Edit
              </button>
            )}
          </div>
        </div>

        {/* 2. Age & Gender */}
        <div className="p-6 sm:p-7 transition-colors hover:bg-gray-50/40">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {!editingDetails ? (
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <User size={15} className="text-gray-400" />
                      <p className="text-xs font-bold text-gray-400 tracking-wider font-sans">Age</p>
                    </div>
                    <p className="font-extrabold text-lg text-gray-900 mt-1 font-sans">
                      {patient.age ? `${patient.age} Years` : <span className="text-gray-400 italic">Not provided</span>}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <User size={15} className="text-gray-400" />
                      <p className="text-xs font-bold text-gray-400 tracking-wider font-sans">Gender</p>
                    </div>
                    <p className="font-extrabold text-lg text-gray-900 mt-1 font-sans">
                      {patient.gender || <span className="text-gray-400 italic">Not provided</span>}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 max-w-md">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1 font-sans">Age *</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={3}
                        value={ageInput}
                        onChange={(e) => setAgeInput(e.target.value.replace(/\D/g, "").slice(0, 3))}
                        placeholder="Age"
                        className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all font-sans"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1 font-sans">Gender *</label>
                      <select
                        value={genderInput}
                        onChange={(e) => setGenderInput(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all font-sans"
                      >
                        <option value="" disabled>Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                  {detailsError && (
                    <p className="text-xs font-medium text-red-600 flex items-center gap-1.5 font-sans">
                      <AlertCircle size={13} /> {detailsError}
                    </p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSaveDetails}
                      disabled={savingDetails || !ageInput || !genderInput}
                      className="px-5 py-2 bg-[#D95B2F] hover:bg-[#C84F27] text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5 font-sans active:scale-95"
                    >
                      {savingDetails ? <Loader2 size={13} className="animate-spin" /> : null}
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDetails(false);
                        setAgeInput(patient.age ? String(patient.age) : "");
                        setGenderInput(patient.gender || "");
                        setDetailsError("");
                      }}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors font-sans"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            {!editingDetails && (
              <button
                type="button"
                onClick={() => {
                  setAgeInput(patient.age ? String(patient.age) : "");
                  setGenderInput(patient.gender || "");
                  setDetailsError("");
                  setEditingDetails(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-[#D95B2F] bg-[#D95B2F]/10 hover:bg-[#D95B2F]/20 transition-colors shrink-0 active:scale-95 font-sans"
              >
                <Pencil size={13} /> Edit
              </button>
            )}
          </div>
        </div>

        {/* 3. Address */}
        <div className="p-6 sm:p-7 transition-colors hover:bg-gray-50/40">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <MapPin size={15} className="text-gray-400" />
                <p className="text-xs font-bold text-gray-400 tracking-wider font-sans">Address</p>
              </div>
              {!editingAddress ? (
                <p className="font-semibold text-base text-gray-900 mt-1 whitespace-pre-line font-sans">
                  {patient.address || <span className="text-gray-400 italic">Not provided</span>}
                </p>
              ) : (
                <div className="mt-2 space-y-3 max-w-md">
                  <textarea
                    rows={3}
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    placeholder="Enter your full address"
                    autoFocus
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all font-sans resize-none"
                  />
                  {addressError && (
                    <p className="text-xs font-medium text-red-600 flex items-center gap-1.5 font-sans">
                      <AlertCircle size={13} /> {addressError}
                    </p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSaveAddress}
                      disabled={savingAddress || !addressInput.trim()}
                      className="px-5 py-2 bg-[#D95B2F] hover:bg-[#C84F27] text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5 font-sans active:scale-95"
                    >
                      {savingAddress ? <Loader2 size={13} className="animate-spin" /> : null}
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAddress(false);
                        setAddressInput(patient.address || "");
                        setAddressError("");
                      }}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors font-sans"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            {!editingAddress && (
              <button
                type="button"
                onClick={() => {
                  setAddressInput(patient.address || "");
                  setAddressError("");
                  setEditingAddress(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-[#D95B2F] bg-[#D95B2F]/10 hover:bg-[#D95B2F]/20 transition-colors shrink-0 active:scale-95 font-sans"
              >
                <Pencil size={13} /> Edit
              </button>
            )}
          </div>
        </div>

        {/* 4. Patient Code (Read-only) */}
        <div className="p-6 sm:p-7 transition-colors hover:bg-gray-50/40">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Hash size={15} className="text-gray-400" />
                <p className="text-xs font-bold text-gray-400 tracking-wider font-sans">Patient Code</p>
              </div>
              <p className="font-mono font-black text-xl text-[#D95B2F] mt-1 tracking-wider">
                {patient.patientCode}
              </p>
              <p className="text-xs text-gray-400 mt-1 font-sans">
                Official hospital patient identifier used for doctor appointments and medical records.
              </p>
            </div>
            
          </div>
        </div>

        {/* 3. Registered Email */}
        <div className="p-6 sm:p-7 transition-colors hover:bg-gray-50/40">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Mail size={15} className="text-gray-400" />
                <p className="text-xs font-bold text-gray-400 tracking-wider font-sans">Registered Email</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <p className="font-semibold text-base text-gray-900 truncate font-sans">{patient.email}</p>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold font-sans">
                  <CheckCircle2 size={12} /> Verified
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1 font-sans">
                Used to log in, receive appointment notifications, and access prescriptions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setNewEmail("");
                setEmailOtp("");
                setEmailError("");
                setEmailStep("input");
                setShowEmailModal(!showEmailModal);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-[#D95B2F] bg-[#D95B2F]/10 hover:bg-[#D95B2F]/20 transition-colors shrink-0 active:scale-95 font-sans"
            >
              <Pencil size={13} /> Change Email
            </button>
          </div>

          {/* Inline Email Verification Card if open */}
          {showEmailModal && (
            <div className="mt-5 p-5 bg-[#fafbf9] border border-gray-200 rounded-2xl space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                <div className="flex items-center gap-2">
                  <KeyRound size={16} className="text-[#D95B2F]" />
                  <h4 className="font-bold text-sm text-gray-900 font-sans">Change &amp; Verify Email Address</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEmailModal(false)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {emailStep === "input" ? (
                <div className="space-y-3">
                  <p className="text-xs text-gray-600 font-sans">
                    Enter your new email address. A 6-digit cryptographic verification code will be sent to confirm ownership.
                  </p>
                  <div>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="new.email@example.com"
                      autoFocus
                      className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all font-sans"
                    />
                  </div>
                  {emailError && (
                    <p className="text-xs font-medium text-red-600 flex items-center gap-1.5 font-sans">
                      <AlertCircle size={13} /> {emailError}
                    </p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleRequestEmailOtp}
                      disabled={emailLoading || !newEmail.trim()}
                      className="px-5 py-2.5 bg-[#D95B2F] hover:bg-[#C84F27] text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5 font-sans active:scale-95"
                    >
                      {emailLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                      Send Verification Code
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEmailModal(false)}
                      className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors font-sans"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 font-sans">
                    <span className="font-bold">Code Sent:</span> We have sent a 6-digit verification code to{" "}
                    <strong className="font-semibold underline">{newEmail}</strong>. It expires in 10 minutes.
                  </div>

                  <div className="space-y-2 text-center sm:text-left">
                    <label className="text-xs font-bold text-gray-600 tracking-wider block font-sans">
                      Enter 6-Digit Verification Code
                    </label>
                    <div className="flex justify-center sm:justify-start">
                      <InputOTP maxLength={6} value={emailOtp} onChange={setEmailOtp}>
                        <InputOTPGroup>
                          <InputOTPSlot index={0} className="w-11 h-12 text-lg font-bold font-mono" />
                          <InputOTPSlot index={1} className="w-11 h-12 text-lg font-bold font-mono" />
                          <InputOTPSlot index={2} className="w-11 h-12 text-lg font-bold font-mono" />
                        </InputOTPGroup>
                        <InputOTPSeparator />
                        <InputOTPGroup>
                          <InputOTPSlot index={3} className="w-11 h-12 text-lg font-bold font-mono" />
                          <InputOTPSlot index={4} className="w-11 h-12 text-lg font-bold font-mono" />
                          <InputOTPSlot index={5} className="w-11 h-12 text-lg font-bold font-mono" />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                  </div>

                  {emailError && (
                    <p className="text-xs font-medium text-red-600 flex items-center gap-1.5 font-sans">
                      <AlertCircle size={13} /> {emailError}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={handleVerifyEmailOtp}
                      disabled={emailLoading || emailOtp.length !== 6}
                      className="px-6 py-2.5 bg-[#D95B2F] hover:bg-[#C84F27] text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5 font-sans active:scale-95"
                    >
                      {emailLoading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={14} />}
                      Verify &amp; Update Email
                    </button>
                    <button
                      type="button"
                      onClick={handleRequestEmailOtp}
                      disabled={emailCooldown > 0 || emailLoading}
                      className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors disabled:opacity-60 flex items-center gap-1.5 font-sans"
                    >
                      <RotateCcw size={13} />
                      {emailCooldown > 0 ? `Resend Code (${emailCooldown}s)` : "Resend Code"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEmailStep("input")}
                      className="text-xs text-gray-500 hover:text-gray-800 underline ml-auto font-medium font-sans"
                    >
                      Change Email Address
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 4. Phone Number (India only, 10 digits) */}
        <div className="p-6 sm:p-7 transition-colors hover:bg-gray-50/40">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Phone size={15} className="text-gray-400" />
                <p className="text-xs font-bold text-gray-400 tracking-wider font-sans">Phone Number (India)</p>
              </div>
              <p className="font-semibold text-base text-gray-900 mt-1">
                {patient.phone ? (
                  <span className="font-mono tracking-wider">{patient.phone}</span>
                ) : (
                  <span className="text-gray-400 italic font-sans">Not provided</span>
                )}
              </p>
              <p className="text-xs text-gray-400 mt-1 font-sans">
                Used for doctor telephone contact and appointment updates. Strictly 10-digit Indian numbers.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setNewPhone("");
                setPhoneOtp("");
                setPhoneError("");
                setPhoneStep("input");
                setShowPhoneModal(!showPhoneModal);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-[#D95B2F] bg-[#D95B2F]/10 hover:bg-[#D95B2F]/20 transition-colors shrink-0 active:scale-95 font-sans"
            >
              <Pencil size={13} /> Change Phone
            </button>
          </div>

          {/* Inline Phone Verification Card if open */}
          {showPhoneModal && (
            <div className="mt-5 p-5 bg-[#fafbf9] border border-gray-200 rounded-2xl space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                <div className="flex items-center gap-2">
                  <Phone size={16} className="text-[#D95B2F]" />
                  <h4 className="font-bold text-sm text-gray-900 font-sans">Change &amp; Verify Phone Number</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPhoneModal(false)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {phoneStep === "input" ? (
                <div className="space-y-3">
                  <p className="text-xs text-gray-600 font-sans">
                    Enter your 10-digit Indian mobile number. A 6-digit verification code will be sent via SMS directly to your mobile number to confirm this update.
                  </p>
                  <div className="flex items-center gap-2 max-w-sm">
                    <div className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-100 border border-gray-300 rounded-xl text-sm font-bold text-gray-700 select-none shrink-0 font-sans">
                      <span>🇮🇳</span>
                      <span>+91</span>
                    </div>
                    <input
                      type="tel"
                      value={newPhone}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setNewPhone(val);
                      }}
                      placeholder="9876543210"
                      autoFocus
                      maxLength={10}
                      className="flex-1 px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-mono font-bold tracking-widest text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 font-sans">
                    Must be exactly 10 digits starting with 6, 7, 8, or 9 ({newPhone.length}/10 digits entered).
                  </p>

                  {phoneError && (
                    <p className="text-xs font-medium text-red-600 flex items-center gap-1.5 font-sans">
                      <AlertCircle size={13} /> {phoneError}
                    </p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleRequestPhoneOtp}
                      disabled={phoneLoading || newPhone.replace(/\D/g, "").length !== 10}
                      className="px-5 py-2.5 bg-[#D95B2F] hover:bg-[#C84F27] text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5 font-sans active:scale-95"
                    >
                      {phoneLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                      Send Verification Code
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPhoneModal(false)}
                      className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors font-sans"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900 space-y-1 font-sans">
                    <p>
                      <span className="font-bold">SMS Verification Code Sent:</span> A 6-digit OTP has been sent via SMS to your mobile number{" "}
                      <strong className="font-mono font-bold">+91 {newPhone}</strong>.
                    </p>
                    <p className="text-[11px] text-emerald-700">The verification code expires in 10 minutes.</p>
                  </div>

                  <div className="space-y-2 text-center sm:text-left">
                    <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block font-sans">
                      Enter 6-Digit Verification Code
                    </label>
                    <div className="flex justify-center sm:justify-start">
                      <InputOTP maxLength={6} value={phoneOtp} onChange={setPhoneOtp}>
                        <InputOTPGroup>
                          <InputOTPSlot index={0} className="w-11 h-12 text-lg font-bold font-mono" />
                          <InputOTPSlot index={1} className="w-11 h-12 text-lg font-bold font-mono" />
                          <InputOTPSlot index={2} className="w-11 h-12 text-lg font-bold font-mono" />
                        </InputOTPGroup>
                        <InputOTPSeparator />
                        <InputOTPGroup>
                          <InputOTPSlot index={3} className="w-11 h-12 text-lg font-bold font-mono" />
                          <InputOTPSlot index={4} className="w-11 h-12 text-lg font-bold font-mono" />
                          <InputOTPSlot index={5} className="w-11 h-12 text-lg font-bold font-mono" />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                  </div>

                  {phoneError && (
                    <p className="text-xs font-medium text-red-600 flex items-center gap-1.5 font-sans">
                      <AlertCircle size={13} /> {phoneError}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={handleVerifyPhoneOtp}
                      disabled={phoneLoading || phoneOtp.length !== 6}
                      className="px-6 py-2.5 bg-[#D95B2F] hover:bg-[#C84F27] text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5 font-sans active:scale-95"
                    >
                      {phoneLoading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={14} />}
                      Verify &amp; Update Phone
                    </button>
                    <button
                      type="button"
                      onClick={handleRequestPhoneOtp}
                      disabled={phoneCooldown > 0 || phoneLoading}
                      className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors disabled:opacity-60 flex items-center gap-1.5 font-sans"
                    >
                      <RotateCcw size={13} />
                      {phoneCooldown > 0 ? `Resend Code (${phoneCooldown}s)` : "Resend Code"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhoneStep("input")}
                      className="text-xs text-gray-500 hover:text-gray-800 underline ml-auto font-medium font-sans"
                    >
                      Change Phone Number
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
