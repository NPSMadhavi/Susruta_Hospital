import React, { useState, useEffect } from "react";
import {
  User, Mail, Phone, Hash, Pencil, CheckCircle2, AlertCircle,
  Loader2, ShieldCheck, X, RotateCcw, KeyRound, MapPin, Download, AlertTriangle, Clock
} from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@/components/ui/input-otp";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { patientApi } from "@/lib/patient-api";
import JSZip from "jszip";
import { generatePrescriptionPdfBlob, type PrintPrescriptionData } from "@/lib/prescription-download";
import { extractDigitalPrescriptionData, parseMedicinesFromNotes } from "@/pages/doctor/appointments";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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

function getDeduplicatedFilename(originalName: string, usedNames: Set<string>): string {
  let cleanName = originalName.replace(/[/\\]/g, "_").replace(/\.\./g, "_").trim();
  if (!cleanName || cleanName === "." || cleanName === "..") {
    cleanName = "attachment";
  }

  const lastDot = cleanName.lastIndexOf(".");
  const baseName = lastDot > 0 ? cleanName.slice(0, lastDot) : cleanName;
  const ext = lastDot > 0 ? cleanName.slice(lastDot) : "";

  let finalName = cleanName;
  let counter = 1;

  while (usedNames.has(finalName.toLowerCase())) {
    finalName = `${baseName}_${counter}${ext}`;
    counter++;
  }

  usedNames.add(finalName.toLowerCase());
  return finalName;
}

function hasAppointmentPrescription(rx: { photoObjectPath?: string | null; notes?: string | null } | null | undefined): boolean {
  if (!rx) return false;
  if (rx.photoObjectPath) return true;
  if (!rx.notes) return false;
  const t = rx.notes.trim();
  if (!t) return false;
  if (t.startsWith("{")) {
    try {
      const parsed = JSON.parse(t);
      if (parsed.token && !parsed.digitalPrescription) return false;
      return !!(parsed.digitalPrescription || (Array.isArray(parsed.formulationRows) && parsed.formulationRows.length > 0) || parsed.diagnosis || (typeof parsed.notes === "string" && parsed.notes.trim().length > 0));
    } catch {
      return false;
    }
  }
  return true;
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

  // Account Settings states
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState("");

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [submittingDelete, setSubmittingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  const [exportLoading, setExportLoading] = useState(false);
  const [exportSuccess, setExportSuccess] = useState("");
  const [exportError, setExportError] = useState("");

  const [pendingDeletionRequest, setPendingDeletionRequest] = useState<{
    id: number;
    createdAt: string;
    cancellationDeadline?: string | null;
    status: string;
    daysRemaining?: number;
    isCancellationActive?: boolean;
  } | null>(null);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingDeletion, setCancellingDeletion] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [cancelSuccess, setCancelSuccess] = useState("");

  useEffect(() => {
    patientApi.getAccountDeletionRequest()
      .then((res: any) => {
        if (res?.hasPendingRequest && res?.request) {
          setPendingDeletionRequest(res.request);
        } else {
          setPendingDeletionRequest(null);
        }
      })
      .catch(() => {});
  }, [patient.id]);

  async function handleDeactivateAccount() {
    setDeactivateError("");
    setDeactivating(true);
    try {
      const res = await patientApi.deactivateAccount();
      if (res?.success) {
        setShowDeactivateModal(false);
        window.location.href = "/portal?deactivated=true";
      }
    } catch (err: any) {
      setDeactivateError(err?.message || "Failed to deactivate account. Please try again.");
    } finally {
      setDeactivating(false);
    }
  }

  async function handleDownloadAllData() {
    setExportLoading(true);
    setExportSuccess("");
    setExportError("");
    try {
      const zip = new JSZip();
      zip.folder("Prescriptions");
      zip.folder("Medical_Documents");

      // 1. Fetch real appointments and real documents
      const [onlineAppts, offlineAppts, docs] = await Promise.all([
        fetch(`${BASE}/api/online-appointments/mine`, { credentials: "include" })
          .then(r => r.ok ? r.json() : fetch(`${BASE}/api/patient/online-appointments`, { credentials: "include" }).then(r2 => r2.ok ? r2.json() : []))
          .catch(() => []),
        fetch(`${BASE}/api/patient/appointments`, { credentials: "include" }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${BASE}/api/patient/documents`, { credentials: "include" }).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);

      const formatTimeSlot = (startTime?: string, endTime?: string) => {
        if (!startTime || !endTime) return "";
        const to12 = (val: string) => {
          const [h, m] = val.split(":");
          return (Number(h) % 12 || 12) + ":" + m + (Number(h) >= 12 ? " PM" : " AM");
        };
        return `${to12(startTime)} – ${to12(endTime)}`;
      };

      // Combine appointments matching dashboard.tsx Prescriptions tab logic EXACTLY
      const allApptsForRx = [
        ...(Array.isArray(onlineAppts) ? onlineAppts : []).map((a: any) => ({
          id: a.id,
          type: "online" as const,
          slot: a.slot,
          apptDate: a.slot?.date || a.date,
          timeLabel: a.slot?.startTime && a.slot?.endTime ? formatTimeSlot(a.slot.startTime, a.slot.endTime) : (a.timeSlot || ""),
          prescription: a.prescription,
        })),
        ...(Array.isArray(offlineAppts) ? offlineAppts : []).map((a: any) => ({
          id: a.id,
          type: "offline" as const,
          slot: { id: 0, date: a.date, startTime: "", endTime: "" },
          apptDate: a.date,
          timeLabel: a.timeSlot || "",
          prescription: a.prescription,
        })),
      ];

      // Filter ONLY REAL PRESCRIPTIONS: exactly the items shown on the portal Prescriptions page
      const realPrescriptions = allApptsForRx
        .filter(a => hasAppointmentPrescription(a.prescription))
        .sort((a, b) => (b.apptDate || "").localeCompare(a.apptDate || ""));

      const rxUsedNames = new Set<string>();

      for (const item of realPrescriptions) {
        const rx = item.prescription;
        if (!rx) continue;

        // CASE A: Uploaded prescription document / photo (genuine original uploaded file)
        if (rx.photoObjectPath) {
          try {
            const url = rx.photoObjectPath.startsWith("http")
              ? rx.photoObjectPath
              : `${BASE}/api/storage${rx.photoObjectPath.startsWith("/") ? "" : "/"}${rx.photoObjectPath}?download=1`;
            const fileRes = await fetch(url, { credentials: "include" });
            if (fileRes.ok) {
              const fileBlob = await fileRes.blob();
              let originalName = rx.photoObjectPath.split("/").pop() || "Prescription.pdf";
              const disp = fileRes.headers.get("content-disposition");
              if (disp && disp.includes("filename=")) {
                const m = disp.match(/filename=["']?([^"';]+)["']?/);
                if (m && m[1]) originalName = decodeURIComponent(m[1].trim());
              }
              const safeName = getDeduplicatedFilename(originalName, rxUsedNames);
              zip.folder("Prescriptions")?.file(safeName, fileBlob);
            }
          } catch (fileErr) {
            console.warn("Could not download uploaded prescription file:", fileErr);
          }
        }
        // CASE B: Real Digital Prescription (rendered with exact authentic portal UI)
        else {
          try {
            const rawNotes = rx.notes;
            if (rawNotes) {
              const digitalData = extractDigitalPrescriptionData(rawNotes);
              const parsedMeds = parseMedicinesFromNotes(rawNotes);

              const rawDate = item.apptDate || "";
              const cleanDate = typeof rawDate === "string" && rawDate.includes("T") ? rawDate.split("T")[0] : rawDate;
              const dateObj = typeof cleanDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cleanDate)
                ? new Date(cleanDate + "T00:00:00+05:30")
                : new Date(rawDate);

              const dateStr = !isNaN(dateObj.getTime())
                ? dateObj.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })
                : "Prescription";
              const dateStrShort = !isNaN(dateObj.getTime())
                ? dateObj.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })
                : "Prescription";

              const timeStr = item.timeLabel
                ? (item.timeLabel.includes("IST") ? ` • ${item.timeLabel}` : ` • ${item.timeLabel} IST`)
                : "";
              const consultDate = `${dateStr}${timeStr}`;

              const printData: PrintPrescriptionData = {
                patientName: patient?.name || "Patient",
                patientCode: patient?.patientCode || (patient?.id ? `A${String(patient.id).padStart(3, "0")}` : "A001"),
                age: patient?.age ? String(patient.age) : "",
                gender: patient?.gender || "",
                consultDate,
                diagnosis: digitalData?.diagnosis || "",
                formulationRows: digitalData?.formulationRows || [],
                medicines: parsedMeds,
                doctorNotes: digitalData?.notes || "",
                signedAt: rx.updatedAt || undefined,
              };

              const pdfBlob = await generatePrescriptionPdfBlob(printData);
              const fileName = getDeduplicatedFilename(`Prescription_${dateStrShort.replace(/ /g, "_")}.pdf`, rxUsedNames);
              zip.folder("Prescriptions")?.file(fileName, pdfBlob);
            }
          } catch (pdfErr) {
            console.warn("Could not render digital prescription PDF:", pdfErr);
          }
        }
      }

      // 2. Fetch real medical documents: exactly what is shown on the Medical Documents page
      const docUsedNames = new Set<string>();
      const realDocs = Array.isArray(docs) ? docs.filter((d: any) => d.deleteColumn !== 1) : [];

      for (const doc of realDocs) {
        if (!doc.objectPath) continue;
        try {
          const url = doc.objectPath.startsWith("http")
            ? doc.objectPath
            : `${BASE}/api/storage${doc.objectPath.startsWith("/") ? "" : "/"}${doc.objectPath}?download=1`;
          const fileRes = await fetch(url, { credentials: "include" });
          if (fileRes.ok) {
            const fileBlob = await fileRes.blob();
            const safeName = getDeduplicatedFilename(doc.name || "Document.pdf", docUsedNames);
            zip.folder("Medical_Documents")?.file(safeName, fileBlob);
          }
        } catch (docErr) {
          console.warn("Could not download medical document file:", docErr);
        }
      }

      // 3. Generate the ZIP with DEFLATE compression
      const finalZipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });

      const patientCode = (patient.patientCode && patient.patientCode.trim())
        ? patient.patientCode.trim()
        : (patient.id ? `A${String(patient.id).padStart(3, "0")}` : "A001");
      const filename = `Susruta_Hospital_Patient_Data_${patientCode}.zip`;

      const url = window.URL.createObjectURL(finalZipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setExportSuccess("Your prescription and medical document files are ready to download.");
    } catch (err: any) {
      setExportError(err?.message || "Unable to download your files. Please try again.");
    } finally {
      setExportLoading(false);
    }
  }

  async function handleSendDeletionRequest() {
    setDeleteError("");
    setSubmittingDelete(true);
    try {
      const res = await patientApi.requestAccountDeletion();
      if (res?.success) {
        setDeleteSuccess(true);
        if (res.request) {
          setPendingDeletionRequest(res.request);
        }
        setTimeout(() => {
          setShowDeleteModal(false);
          setDeleteSuccess(false);
        }, 3000);
      }
    } catch (err: any) {
      if (err?.status === 409 || err?.error === "already_submitted") {
        setDeleteError("Account deletion request already submitted.");
        if (err.request) {
          setPendingDeletionRequest(err.request);
        }
      } else {
        setDeleteError(err?.message || "Failed to submit deletion request. Please try again.");
      }
    } finally {
      setSubmittingDelete(false);
    }
  }

  async function handleCancelDeletionRequest() {
    setCancelError("");
    setCancellingDeletion(true);
    try {
      const res = await patientApi.cancelAccountDeletion();
      if (res?.success) {
        setCancelSuccess("Your account deletion request has been cancelled successfully.");
        setPendingDeletionRequest(null);
        setShowCancelModal(false);
        setTimeout(() => {
          setCancelSuccess("");
        }, 6000);
      }
    } catch (err: any) {
      if (err?.error === "cancellation_period_expired") {
        setCancelError("The 15-day cancellation period has expired. This request can no longer be cancelled.");
        patientApi.getAccountDeletionRequest().then((refreshRes: any) => {
          if (refreshRes?.hasPendingRequest && refreshRes?.request) {
            setPendingDeletionRequest(refreshRes.request);
          }
        }).catch(() => {});
      } else if (err?.error === "already_cancelled") {
        setCancelError("This deletion request has already been cancelled.");
        setPendingDeletionRequest(null);
      } else if (err?.error === "already_processed") {
        setCancelError("This deletion request can no longer be cancelled.");
      } else {
        setCancelError(err?.message || "Failed to cancel deletion request. Please try again.");
      }
    } finally {
      setCancellingDeletion(false);
    }
  }

  function fmtFullDate(d: string | null | undefined): string {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return String(d);
    }
  }

  function fmtDate(d: string | null | undefined): string {
    if (!d) return "";
    try {
      return new Date(d).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return String(d);
    }
  }

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
                  {patient.address && patient.address.trim() ? (
                    patient.address.trim()
                  ) : (
                    <span className="text-gray-400 italic">Not provided</span>
                  )}
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

      {/* ── ACCOUNT SETTINGS SECTION ── */}
      <div className="bg-white rounded-3xl border border-gray-100 p-6 sm:p-8 shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900 font-sans">Account Settings</h3>
          <p className="text-xs text-gray-500 mt-0.5 font-sans">
            Manage your account status and permanent data preferences.
          </p>
        </div>

        <div className="border-t border-gray-100 pt-6 space-y-6">
          {cancelSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-sans flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span className="font-semibold">{cancelSuccess}</span>
            </div>
          )}

          {/* Deactivate Account */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-amber-50/50 border border-amber-200/60">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-gray-900 font-sans">Deactivate Account</h4>
              <p className="text-xs text-gray-600 font-sans">
                Temporarily deactivate your account. You can reactivate it later.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDeactivateError("");
                setShowDeactivateModal(true);
              }}
              className="px-4 py-2 bg-white hover:bg-amber-100/50 text-amber-800 border border-amber-300 text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 shrink-0 font-sans cursor-pointer"
            >
              Deactivate
            </button>
          </div>

          {/* Delete Account */}
          {pendingDeletionRequest ? (
            (() => {
              const isCancellationActive =
                pendingDeletionRequest.isCancellationActive ??
                (pendingDeletionRequest.status === "PENDING" &&
                 pendingDeletionRequest.cancellationDeadline &&
                 new Date(pendingDeletionRequest.cancellationDeadline).getTime() > Date.now());

              const daysRemaining =
                typeof pendingDeletionRequest.daysRemaining === "number"
                  ? pendingDeletionRequest.daysRemaining
                  : (pendingDeletionRequest.cancellationDeadline
                      ? Math.max(0, Math.ceil((new Date(pendingDeletionRequest.cancellationDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                      : 0);

              return (
                <div className={`p-5 rounded-2xl border space-y-3 font-sans transition-all ${
                  isCancellationActive ? "bg-amber-50/40 border-amber-200/70" : "bg-red-50/40 border-red-200/70"
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${
                        isCancellationActive ? "bg-amber-500 animate-pulse" : "bg-red-500"
                      }`} />
                      <h4 className="text-sm font-bold text-gray-900 font-sans">
                        Account Deletion Request Pending
                      </h4>
                    </div>
                    {isCancellationActive ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold self-start sm:self-auto font-sans">
                        <Clock size={12} className="text-amber-700" />
                        {daysRemaining} {daysRemaining === 1 ? "day" : "days"} remaining
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-900 border border-red-200 text-xs font-bold self-start sm:self-auto font-sans">
                        <AlertCircle size={12} className="text-red-700" />
                        Cancellation Period Expired
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-xs font-sans">
                    <p className="font-semibold text-gray-900">
                      Your account deletion request is pending.
                    </p>
                    {isCancellationActive ? (
                      <p className="text-gray-600">
                        You can cancel this request within 15 days.
                      </p>
                    ) : (
                      <p className="text-red-700 font-medium">
                        The 15-day cancellation period has expired. This request can no longer be cancelled and is awaiting administrator processing.
                      </p>
                    )}
                  </div>

                  {/* Request Date and Cancellation Deadline */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 py-2.5 px-3.5 bg-white/80 rounded-xl border border-gray-200/70 text-xs font-sans">
                    <div>
                      <span className="text-gray-500">Request Date: </span>
                      <span className="font-bold text-gray-900">
                        {fmtFullDate(pendingDeletionRequest.createdAt)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Cancellation Deadline: </span>
                      <span className="font-bold text-gray-900">
                        {fmtFullDate(pendingDeletionRequest.cancellationDeadline)}
                        {!isCancellationActive && " (Expired)"}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    {/* Cancel Deletion Request button - only while 15-day period is active */}
                    {isCancellationActive && (
                      <button
                        type="button"
                        onClick={() => {
                          setCancelError("");
                          setShowCancelModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer font-sans"
                      >
                        <CheckCircle2 size={13} className="text-emerald-600" />
                        Cancel Deletion Request
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleDownloadAllData}
                      disabled={exportLoading}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 font-sans active:scale-95 cursor-pointer"
                    >
                      {exportLoading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                      {exportLoading ? "Preparing Download..." : "Download All Data (.zip)"}
                    </button>
                  </div>

                  {exportSuccess && (
                    <p className="text-xs font-medium text-emerald-700 flex items-center gap-1.5 font-sans">
                      <CheckCircle2 size={13} /> {exportSuccess}
                    </p>
                  )}
                  {exportError && (
                    <p className="text-xs font-medium text-red-600 flex items-center gap-1.5 font-sans">
                      <AlertCircle size={13} /> {exportError}
                    </p>
                  )}
                </div>
              );
            })()
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-red-50/40 border border-red-200/60 font-sans">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-gray-900 font-sans">Delete Account</h4>
                <p className="text-xs text-gray-600 font-sans">
                  Request permanent deletion of your account and associated patient data.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeleteError("");
                  setDeleteSuccess(false);
                  setExportSuccess("");
                  setExportError("");
                  setShowDeleteModal(true);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 shrink-0 font-sans cursor-pointer"
              >
                Delete Account
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── DEACTIVATE CONFIRMATION DIALOG ── */}
      <Dialog open={showDeactivateModal} onOpenChange={setShowDeactivateModal}>
        <DialogContent className="max-w-md rounded-3xl bg-white p-6 font-sans border-0 shadow-2xl">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                <AlertCircle size={20} />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-gray-900" style={{ fontFamily: "'DM Sans', sans-serif" }}>Deactivate Account?</DialogTitle>
              </div>
            </div>

            <DialogDescription className="text-sm text-gray-600 leading-relaxed">
              Your account will be temporarily deactivated. You will not be able to access the Patient Portal until you reactivate your account.
            </DialogDescription>

            {deactivateError && (
              <p className="text-xs font-medium text-red-600 flex items-center gap-1.5">
                <AlertCircle size={13} /> {deactivateError}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setShowDeactivateModal(false)}
                disabled={deactivating}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeactivateAccount}
                disabled={deactivating}
                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-xs font-bold text-white transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
              >
                {deactivating ? <Loader2 size={13} className="animate-spin" /> : null}
                Deactivate Account
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── REQUEST ACCOUNT DELETION WARNING MODAL ── */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="max-w-lg rounded-3xl bg-white p-6 sm:p-7 font-sans border-0 shadow-2xl">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center text-red-700 shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-gray-900">Request Account Deletion</DialogTitle>
                <p className="text-xs text-gray-500">Permanent data removal request</p>
              </div>
            </div>

            <DialogDescription className="text-xs sm:text-sm text-gray-600 leading-relaxed space-y-2">
              <span className="block">
                Before requesting account deletion, please download and save your prescription attachments and uploaded medical documents that you want to keep. This ZIP contains those original files only; it does not contain profile information, appointments, or other database records.
              </span>
              <span className="block pt-1 text-red-700 font-medium">
                After your deletion request is approved and processed by the hospital administrator, your account and eligible associated patient data will be permanently deleted and cannot be recovered.
              </span>
            </DialogDescription>

            {/* ONE Single Download Button */}
            <div className="bg-[#fafbf9] border border-gray-200/80 rounded-2xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-gray-900">Backup Medical Attachments</p>
                  <p className="text-[11px] text-gray-500">Original prescription attachments &amp; uploaded documents.</p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadAllData}
                  disabled={exportLoading}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#2d6a4f] hover:bg-[#245640] transition-colors shadow-sm disabled:opacity-50 shrink-0 active:scale-95"
                >
                  {exportLoading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  {exportLoading ? "Preparing Download..." : "Download All Data (.zip)"}
                </button>
              </div>

              {exportSuccess && (
                <p className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 size={13} /> {exportSuccess}
                </p>
              )}
              {exportError && (
                <p className="text-xs font-medium text-red-600 flex items-center gap-1.5">
                  <AlertCircle size={13} /> {exportError}
                </p>
              )}
            </div>

            {deleteSuccess ? (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-700" />
                  Your account deletion request has been submitted. You have 15 days to cancel this request.
                </p>
                <p className="text-[11px] text-emerald-700">
                  You can cancel this request at any time during the 15-day grace period from your Patient Profile.
                </p>
              </div>
            ) : (
              <>
                {deleteError && (
                  <p className="text-xs font-medium text-red-600 flex items-center gap-1.5">
                    <AlertCircle size={13} /> {deleteError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(false)}
                    disabled={submittingDelete}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSendDeletionRequest}
                    disabled={submittingDelete}
                    className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {submittingDelete ? <Loader2 size={13} className="animate-spin" /> : null}
                    Send Deletion Request
                  </button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── CANCEL DELETION REQUEST CONFIRMATION MODAL ── */}
      <Dialog open={showCancelModal} onOpenChange={(open) => { if (!open && !cancellingDeletion) setShowCancelModal(false); }}>
        <DialogContent className="max-w-md rounded-3xl bg-white p-6 sm:p-7 font-sans border-0 shadow-2xl">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-gray-900 font-sans">
                  Cancel Deletion Request?
                </DialogTitle>
                <p className="text-xs text-gray-500 font-sans">Keep your patient account active</p>
              </div>
            </div>

            <DialogDescription className="text-xs sm:text-sm text-gray-600 leading-relaxed font-sans">
              Your account deletion request will be cancelled and your account will remain active.
            </DialogDescription>

            {cancelError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-700 flex items-center gap-2 font-sans">
                <AlertCircle size={14} className="shrink-0" />
                <span>{cancelError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                disabled={cancellingDeletion}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors font-sans cursor-pointer"
              >
                Keep Deletion Request
              </button>
              <button
                type="button"
                onClick={handleCancelDeletionRequest}
                disabled={cancellingDeletion}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 font-sans cursor-pointer"
              >
                {cancellingDeletion ? <Loader2 size={13} className="animate-spin" /> : null}
                Cancel Deletion Request
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
