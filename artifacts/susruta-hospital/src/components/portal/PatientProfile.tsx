import React, { useState, useEffect } from "react";
import {
  User, Mail, Phone, Hash, Pencil, CheckCircle2, AlertCircle,
  Loader2, ShieldCheck, X, RotateCcw, KeyRound, MapPin, Download, AlertTriangle, Clock,
  Calendar, Settings, Shield, Trash2
} from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@/components/ui/input-otp";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { patientApi } from "@/lib/patient-api";
import { COUNTRIES, validatePatientPhone, detectCountryFromPhone } from "@workspace/patient-contact";
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
  // Modal states for editing individual personal info fields
  const [editNameModal, setEditNameModal] = useState(false);
  const [nameInput, setNameInput] = useState(patient.name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");
  const [nameSuccess, setNameSuccess] = useState("");

  const [editAgeModal, setEditAgeModal] = useState(false);
  const [ageInput, setAgeInput] = useState(patient.age ? String(patient.age) : "");
  const [savingAge, setSavingAge] = useState(false);
  const [ageError, setAgeError] = useState("");

  const [editGenderModal, setEditGenderModal] = useState(false);
  const [genderInput, setGenderInput] = useState(patient.gender || "");
  const [savingGender, setSavingGender] = useState(false);
  const [genderError, setGenderError] = useState("");

  const [editAddressModal, setEditAddressModal] = useState(false);
  const [addressInput, setAddressInput] = useState(patient.address || "");
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [addressSuccess, setAddressSuccess] = useState("");

  const [detailsSuccess, setDetailsSuccess] = useState("");

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
  const [phoneCountryCode, setPhoneCountryCode] = useState<string>("IN");
  const [newPhone, setNewPhone] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [phoneSuccess, setPhoneSuccess] = useState("");
  const [phoneCooldown, setPhoneCooldown] = useState(0);

  const phoneCountry = detectCountryFromPhone(patient.phone);
  const selectedPhoneCountry = COUNTRIES.find((c) => c.code === phoneCountryCode) || COUNTRIES[0];

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

  const isAnyProfileModalOpen =
    editNameModal ||
    editAgeModal ||
    editGenderModal ||
    editAddressModal ||
    showEmailModal ||
    showPhoneModal ||
    showDeactivateModal ||
    showDeleteModal ||
    showCancelModal;

  useScrollLock(isAnyProfileModalOpen);

  useEffect(() => {
    patientApi.getAccountDeletionRequest()
      .then((res: any) => {
        if (res?.hasPendingRequest && res?.request) {
          setPendingDeletionRequest(res.request);
        } else {
          setPendingDeletionRequest(null);
        }
      })
      .catch(() => {
        setPendingDeletionRequest(null);
      });
  }, []);

  // Sync inputs if patient props change
  useEffect(() => {
    if (!editNameModal) setNameInput(patient.name || "");
  }, [patient.name, editNameModal]);

  useEffect(() => {
    if (!editAgeModal) setAgeInput(patient.age ? String(patient.age) : "");
  }, [patient.age, editAgeModal]);

  useEffect(() => {
    if (!editGenderModal) setGenderInput(patient.gender || "");
  }, [patient.gender, editGenderModal]);

  useEffect(() => {
    if (!editAddressModal) setAddressInput(patient.address || "");
  }, [patient.address, editAddressModal]);

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

  // Save Full Name
  async function handleSaveName() {
    setNameError("");
    setNameSuccess("");
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed.length < 2) {
      setNameError("Please enter your full name (at least 2 characters).");
      return;
    }
    setSavingName(true);
    try {
      const res = await patientApi.updateName(trimmed);
      if (res.patient) {
        onPatientUpdate(res.patient);
        setNameSuccess("Full name updated successfully!");
        setEditNameModal(false);
        setTimeout(() => setNameSuccess(""), 3500);
      }
    } catch (err: any) {
      setNameError(err?.message || "Failed to update name. Please try again.");
    } finally {
      setSavingName(false);
    }
  }

  // Save Age
  async function handleSaveAge() {
    setAgeError("");
    const parsedAge = Number(ageInput);
    if (!ageInput || isNaN(parsedAge) || parsedAge < 1 || parsedAge > 120) {
      setAgeError("Please enter a valid age between 1 and 120.");
      return;
    }
    setSavingAge(true);
    try {
      const res = await patientApi.updateDetails({ age: parsedAge });
      if (res.patient) {
        onPatientUpdate(res.patient);
        setDetailsSuccess("Age updated successfully!");
        setEditAgeModal(false);
        setTimeout(() => setDetailsSuccess(""), 3500);
      }
    } catch (err: any) {
      setAgeError(err?.message || "Failed to update age. Please try again.");
    } finally {
      setSavingAge(false);
    }
  }

  // Save Gender
  async function handleSaveGender() {
    setGenderError("");
    if (!genderInput || !["Male", "Female", "Other"].includes(genderInput)) {
      setGenderError("Please select a valid gender.");
      return;
    }
    setSavingGender(true);
    try {
      const res = await patientApi.updateDetails({ gender: genderInput });
      if (res.patient) {
        onPatientUpdate(res.patient);
        setDetailsSuccess("Gender updated successfully!");
        setEditGenderModal(false);
        setTimeout(() => setDetailsSuccess(""), 3500);
      }
    } catch (err: any) {
      setGenderError(err?.message || "Failed to update gender. Please try again.");
    } finally {
      setSavingGender(false);
    }
  }

  // Save Address
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
        setEditAddressModal(false);
        setTimeout(() => setAddressSuccess(""), 3500);
      }
    } catch (err: any) {
      setAddressError(err?.message || "Failed to update address. Please try again.");
    } finally {
      setSavingAddress(false);
    }
  }

  // Request Email OTP
  async function handleRequestEmailOtp() {
    setEmailError("");
    setEmailSuccess("");
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    if (trimmed === patient.email.toLowerCase()) {
      setEmailError("This is already your registered email address.");
      return;
    }
    setEmailLoading(true);
    try {
      await patientApi.requestEmailOtp(trimmed);
      setEmailStep("otp");
      setEmailCooldown(60);
      setEmailOtp("");
    } catch (err: any) {
      setEmailError(err?.message || "Failed to send verification code. Please try again.");
    } finally {
      setEmailLoading(false);
    }
  }

  // Verify Email OTP
  async function handleVerifyEmailOtp() {
    setEmailError("");
    setEmailSuccess("");
    if (emailOtp.length !== 6) {
      setEmailError("Please enter the complete 6-digit verification code.");
      return;
    }
    setEmailLoading(true);
    try {
      const res = await patientApi.verifyEmailOtp(newEmail.trim().toLowerCase(), emailOtp);
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

  // Request Phone OTP
  async function handleRequestPhoneOtp() {
    setPhoneError("");
    setPhoneSuccess("");
    const validation = validatePatientPhone(newPhone, phoneCountryCode);
    if (!validation.valid) {
      setPhoneError(validation.message);
      return;
    }
    const formatted = validation.e164;
    if (formatted === patient.phone) {
      setPhoneError("This is already your registered phone number.");
      return;
    }
    setPhoneLoading(true);
    try {
      await patientApi.requestPhoneOtp(formatted, phoneCountryCode);
      setPhoneStep("otp");
      setPhoneCooldown(60);
      setPhoneOtp("");
    } catch (err: any) {
      setPhoneError(err?.message || "Failed to send verification code. Please try again.");
    } finally {
      setPhoneLoading(false);
    }
  }

  // Verify Phone OTP
  async function handleVerifyPhoneOtp() {
    setPhoneError("");
    setPhoneSuccess("");
    if (phoneOtp.length !== 6) {
      setPhoneError("Please enter the complete 6-digit verification code.");
      return;
    }
    const validation = validatePatientPhone(newPhone, phoneCountryCode);
    if (!validation.valid) {
      setPhoneError(validation.message);
      return;
    }
    const formatted = validation.e164;
    setPhoneLoading(true);
    try {
      const res = await patientApi.verifyPhoneOtp(formatted, phoneOtp, phoneCountryCode);
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

  // Deactivate Account
  async function handleDeactivateAccount() {
    setDeactivateError("");
    setDeactivating(true);
    try {
      await patientApi.deactivateAccount();
      window.location.href = `${BASE}/portal/login?deactivated=1`;
    } catch (err: any) {
      setDeactivateError(err?.message || "Failed to deactivate account. Please try again.");
      setDeactivating(false);
    }
  }

  // Download All Patient Data (ZIP)
  async function handleDownloadAllData() {
    setExportError("");
    setExportSuccess("");
    setExportLoading(true);
    try {
      const [myOnline, myPhysical, docs] = await Promise.all([
        fetch(`${BASE}/api/online-appointments/mine`, { credentials: "include" })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
        patientApi.getAppointments().catch(() => []),
        fetch(`${BASE}/api/patient/documents`, { credentials: "include" })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
      ]);

      const zip = new JSZip();
      zip.folder("Prescriptions");
      zip.folder("Medical_Documents");

      const rxUsedNames = new Set<string>();
      const allApptsForRx = [
        ...(Array.isArray(myOnline) ? myOnline : []).map((a: any) => ({
          id: a.id,
          type: "online" as const,
          slot: a.slot,
          apptDate: a.slot?.date || a.apptDate || a.date || "",
          timeLabel: a.slot?.startTime ? `${a.slot.startTime} - ${a.slot.endTime}` : (a.timeLabel || ""),
          prescription: a.prescription,
        })),
        ...(Array.isArray(myPhysical) ? myPhysical : []).map((a: any) => ({
          id: a.id,
          type: "offline" as const,
          slot: { id: 0, date: a.date || a.apptDate || "", startTime: "", endTime: "" },
          apptDate: a.date || a.apptDate || "",
          timeLabel: a.timeSlot || a.timeLabel || "",
          prescription: a.prescription,
        })),
      ];

      const apptsWithRx = allApptsForRx.filter((a: any) => hasAppointmentPrescription(a.prescription));

      for (const item of apptsWithRx) {
        const rx = item.prescription;
        if (!rx) continue;

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
            console.warn("Could not download prescription file, attempting server fallback:", fileErr);
            try {
              const fallbackRes = await fetch(`${BASE}/api/patient/prescriptions/appointment/${item.type}/${item.id}/download`, { credentials: "include" });
              if (fallbackRes.ok) {
                const fallbackBlob = await fallbackRes.blob();
                const safeName = getDeduplicatedFilename(`Prescription_${item.apptDate || "document"}.pdf`, rxUsedNames);
                zip.folder("Prescriptions")?.file(safeName, fallbackBlob);
              }
            } catch {}
          }
        } else {
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
            console.warn("Could not render digital prescription PDF, attempting server fallback:", pdfErr);
            try {
              const fallbackRes = await fetch(`${BASE}/api/patient/prescriptions/appointment/${item.type}/${item.id}/download`, { credentials: "include" });
              if (fallbackRes.ok) {
                const fallbackBlob = await fallbackRes.blob();
                const safeName = getDeduplicatedFilename(`Prescription_${item.apptDate || "digital"}.pdf`, rxUsedNames);
                zip.folder("Prescriptions")?.file(safeName, fallbackBlob);
              }
            } catch {}
          }
        }
      }

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

  // Send Deletion Request
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

  // Cancel Deletion Request
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

  // Initials for avatar
  const initials = (patient.name || "P")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  return (
    <div className="w-full space-y-6 pb-12 animate-in fade-in duration-200 font-sans">
      {/* ── Page Header ── */}
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight font-sans">Profile</h1>
        <p className="text-xs sm:text-sm text-gray-500 font-medium font-sans">
          Manage your personal details and securely update your registered email or phone number.
        </p>
      </div>

      {/* Global Success Banners */}
      {nameSuccess && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs sm:text-sm font-semibold animate-in fade-in">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{nameSuccess}</span>
        </div>
      )}
      {detailsSuccess && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs sm:text-sm font-semibold animate-in fade-in">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{detailsSuccess}</span>
        </div>
      )}
      {addressSuccess && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs sm:text-sm font-semibold animate-in fade-in">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{addressSuccess}</span>
        </div>
      )}
      {emailSuccess && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs sm:text-sm font-semibold animate-in fade-in">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{emailSuccess}</span>
        </div>
      )}
      {phoneSuccess && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs sm:text-sm font-semibold animate-in fade-in">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{phoneSuccess}</span>
        </div>
      )}
      {cancelSuccess && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs sm:text-sm font-semibold animate-in fade-in">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{cancelSuccess}</span>
        </div>
      )}

      {/* ── Orange Hero Banner Card ── */}
      <div className="bg-[#D95B2F] text-white rounded-2xl sm:rounded-3xl p-6 sm:p-7 shadow-sm flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center shrink-0">
          <span className="text-2xl font-black text-white tracking-wider font-sans">{initials}</span>
        </div>
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight truncate font-sans">
            {patient.name}
          </h2>
          <div className="flex flex-wrap items-center gap-2.5 mt-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full border border-white/40 bg-white/10 text-xs font-bold text-white font-mono">
              <Hash size={12} className="text-white" />
              {patient.patientCode || "—"}
            </span>
            {(patient.age || patient.gender) && (
              <span className="inline-flex items-center px-3 py-0.5 rounded-full border border-white/40 bg-white/10 text-xs font-semibold text-white">
                {[patient.age ? `${patient.age} Yrs` : null, patient.gender].filter(Boolean).join(" • ")}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full border border-white/40 bg-white/10 text-xs font-semibold text-white">
              <CheckCircle2 size={13} className="text-emerald-300" />
              Verified
            </span>
          </div>
        </div>
      </div>

      {/* ── Two-Column Grid: Personal Information & Account Information ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Left Column: Personal Information Card */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-sm p-6 sm:p-7 space-y-6 h-full">
          <div className="flex items-center gap-3">
            <User size={20} className="text-gray-700" />
            <div>
              <h3 className="text-base font-bold text-gray-900 font-sans">
                Personal Information
              </h3>
              <p className="text-xs text-gray-400 font-medium font-sans">
                Your basic personal details.
              </p>
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {/* 1. Full Name */}
            <div className="py-3.5 first:pt-0">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0 mt-0.5">
                  <User size={16} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-500">
                      Full Name
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setNameInput(patient.name || "");
                        setNameError("");
                        setEditNameModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold text-[#D95B2F] bg-[#FFF2EC] border border-[#FCD9C8] hover:bg-[#FEE5D8] transition-colors shrink-0 active:scale-95 cursor-pointer font-sans"
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                  </div>

                  <p className="mt-1">
                    <span className="font-bold text-sm text-gray-900 break-words">
                      {patient.name}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Age */}
            <div className="py-3.5">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0 mt-0.5">
                  <Calendar size={16} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-500">
                      Age
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setAgeInput(patient.age ? String(patient.age) : "");
                        setAgeError("");
                        setEditAgeModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold text-[#D95B2F] bg-[#FFF2EC] border border-[#FCD9C8] hover:bg-[#FEE5D8] transition-colors shrink-0 active:scale-95 cursor-pointer font-sans"
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                  </div>

                  <p className="mt-1">
                    <span className="font-bold text-sm text-gray-900">
                      {patient.age ? (
                        `${patient.age} Years`
                      ) : (
                        <span className="text-gray-400 font-normal italic">
                          Not provided
                        </span>
                      )}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* 3. Gender */}
            <div className="py-3.5">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0 mt-0.5">
                  <User size={16} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-500">
                      Gender
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setGenderInput(patient.gender || "");
                        setGenderError("");
                        setEditGenderModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold text-[#D95B2F] bg-[#FFF2EC] border border-[#FCD9C8] hover:bg-[#FEE5D8] transition-colors shrink-0 active:scale-95 cursor-pointer font-sans"
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                  </div>

                  <p className="mt-1">
                    <span className="font-bold text-sm text-gray-900">
                      {patient.gender || (
                        <span className="text-gray-400 font-normal italic">
                          Not provided
                        </span>
                      )}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* 4. Address */}
            <div className="py-3.5 last:pb-0">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0 mt-0.5">
                  <MapPin size={16} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-500">
                      Address
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setAddressInput(patient.address || "");
                        setAddressError("");
                        setEditAddressModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold text-[#D95B2F] bg-[#FFF2EC] border border-[#FCD9C8] hover:bg-[#FEE5D8] transition-colors shrink-0 active:scale-95 cursor-pointer font-sans"
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                  </div>

                  <p className="mt-1">
                    <span className="font-bold text-sm text-gray-900 whitespace-pre-line leading-relaxed break-words">
                      {patient.address && patient.address.trim() ? (
                        patient.address.trim()
                      ) : (
                        <span className="text-gray-400 font-normal italic">
                          Not provided
                        </span>
                      )}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Account Information Card */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-sm p-6 sm:p-7 space-y-6 h-full">
          <div className="flex items-center gap-3">
            <Settings size={20} className="text-gray-700" />

            <div>
              <h3 className="text-base font-bold text-gray-900 font-sans">
                Account Information
              </h3>

              <p className="text-xs text-gray-400 font-medium font-sans">
                Details used for login, communication and identification.
              </p>
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {/* 1. Patient Code */}
            <div className="py-3.5 first:pt-0">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 mt-0.5 font-bold text-sm">
                  <Hash size={16} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-semibold text-gray-500">
                      Patient Code
                    </span>
                  </div>

                  <p className="text-xs text-gray-400 mt-1 leading-normal font-sans">
                    <span className="font-mono font-black text-sm sm:text-base text-gray-900">
                      {patient.patientCode || "—"}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Registered Email */}
            <div className="py-3.5">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 mt-0.5">
                  <Mail size={16} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-500">
                      Registered Email
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setNewEmail("");
                        setEmailOtp("");
                        setEmailError("");
                        setEmailStep("input");
                        setShowEmailModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold text-[#D95B2F] bg-[#FFF2EC] border border-[#FCD9C8] hover:bg-[#FEE5D8] transition-colors shrink-0 active:scale-95 cursor-pointer font-sans"
                    >
                      <Pencil size={12} />
                      Change Email
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="font-bold text-sm text-gray-900 truncate">
                      {patient.email}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Phone Number */}
            <div className="py-3.5 last:pb-0">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 mt-0.5">
                  <Phone size={16} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-500">
                      Phone Number{phoneCountry ? ` (${phoneCountry.name})` : ""}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setPhoneCountryCode(phoneCountry?.code || "IN");
                        setNewPhone("");
                        setPhoneOtp("");
                        setPhoneError("");
                        setPhoneStep("input");
                        setShowPhoneModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold text-[#D95B2F] bg-[#FFF2EC] border border-[#FCD9C8] hover:bg-[#FEE5D8] transition-colors shrink-0 active:scale-95 cursor-pointer font-sans"
                    >
                      <Pencil size={12} />
                      Change Phone
                    </button>
                  </div>

                  <div className="mt-1">
                    <span className="font-bold text-sm text-gray-900 font-mono tracking-wider flex items-center gap-2">
                      {patient.phone ? (
                        <>
                          {phoneCountry?.flag && <span>{phoneCountry.flag}</span>}
                          <span>{patient.phone}</span>
                        </>
                      ) : (
                        <span className="text-gray-400 font-normal italic font-sans">
                          Not provided
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Full-Width Card: Account Settings ── */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-sm p-6 sm:p-7 space-y-5">
        <div className="flex items-center gap-3">
          <Shield size={20} className="text-gray-700" />
          <div>
            <h3 className="text-base font-bold text-gray-900 font-sans">Account Settings</h3>
            <p className="text-xs text-gray-400 font-medium font-sans">Manage your account status and permanent data preferences.</p>
          </div>
        </div>

        <div className="space-y-4 pt-1">
          {/* 1. Deactivate Account Box */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl border border-amber-300 bg-white hover:bg-amber-50/20 transition-colors">
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0 font-bold">
                <AlertCircle size={18} />
              </div>
              <div>
                <h4 className="text-sm sm:text-base font-bold text-gray-900 font-sans">Deactivate Account</h4>
                <p className="text-xs text-gray-500 font-sans mt-0.5">
                  Temporarily deactivate your account. You can reactivate it later.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setDeactivateError("");
                setShowDeactivateModal(true);
              }}
              className="px-6 py-2 rounded-xl border border-amber-500 text-amber-600 hover:bg-amber-50 text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0 font-sans cursor-pointer self-start sm:self-auto"
            >
              Deactivate
            </button>
          </div>

          {/* 2. Delete Account Box / 15-day Grace Period Status */}
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl border border-red-200 bg-white hover:bg-red-50/20 transition-colors">
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center text-red-500 shrink-0">
                  <Trash2 size={18} />
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-gray-900 font-sans">Delete Account</h4>
                  <p className="text-xs text-gray-500 font-sans mt-0.5">
                    Request permanent deletion of your account and eligible associated patient data.
                  </p>
                </div>
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
                className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0 font-sans cursor-pointer self-start sm:self-auto"
              >
                Delete Account
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── EDIT FULL NAME MODAL ── */}
      <Dialog open={editNameModal} onOpenChange={setEditNameModal}>
        <DialogContent className="max-w-md rounded-3xl bg-white p-6 font-sans border-0 shadow-2xl">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-100 flex items-center justify-center text-[#D95B2F] shrink-0">
                <User size={20} />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-gray-900">Edit Full Name</DialogTitle>
                <DialogDescription className="text-xs text-gray-500">Update your official full name.</DialogDescription>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold text-gray-600 block">Full Name</label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Enter full name"
                maxLength={100}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all"
              />
              {nameError && (
                <p className="text-xs font-medium text-red-600 flex items-center gap-1.5">
                  <AlertCircle size={13} /> {nameError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setEditNameModal(false)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveName}
                disabled={savingName || nameInput.trim().length < 2}
                className="px-5 py-2.5 rounded-xl bg-[#D95B2F] hover:bg-[#C84F27] text-xs font-bold text-white transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
              >
                {savingName ? <Loader2 size={13} className="animate-spin" /> : null}
                Save Changes
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── EDIT AGE MODAL ── */}
      <Dialog open={editAgeModal} onOpenChange={setEditAgeModal}>
        <DialogContent className="max-w-md rounded-3xl bg-white p-6 font-sans border-0 shadow-2xl">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-100 flex items-center justify-center text-[#D95B2F] shrink-0">
                <Calendar size={20} />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-gray-900">Edit Age</DialogTitle>
                <DialogDescription className="text-xs text-gray-500">Update your age in years.</DialogDescription>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold text-gray-600 block">Age (Years)</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={3}
                value={ageInput}
                onChange={(e) => setAgeInput(e.target.value.replace(/\D/g, "").slice(0, 3))}
                placeholder="e.g. 25"
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all"
              />
              {ageError && (
                <p className="text-xs font-medium text-red-600 flex items-center gap-1.5">
                  <AlertCircle size={13} /> {ageError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setEditAgeModal(false)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAge}
                disabled={savingAge || !ageInput}
                className="px-5 py-2.5 rounded-xl bg-[#D95B2F] hover:bg-[#C84F27] text-xs font-bold text-white transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
              >
                {savingAge ? <Loader2 size={13} className="animate-spin" /> : null}
                Save Changes
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── EDIT GENDER MODAL ── */}
      <Dialog open={editGenderModal} onOpenChange={setEditGenderModal}>
        <DialogContent className="max-w-md rounded-3xl bg-white p-6 font-sans border-0 shadow-2xl">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-100 flex items-center justify-center text-[#D95B2F] shrink-0">
                <User size={20} />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-gray-900">Edit Gender</DialogTitle>
                <DialogDescription className="text-xs text-gray-500">Select your gender.</DialogDescription>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold text-gray-600 block">Gender</label>
              <select
                value={genderInput}
                onChange={(e) => setGenderInput(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all"
              >
                <option value="" disabled>Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
              {genderError && (
                <p className="text-xs font-medium text-red-600 flex items-center gap-1.5">
                  <AlertCircle size={13} /> {genderError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setEditGenderModal(false)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveGender}
                disabled={savingGender || !genderInput}
                className="px-5 py-2.5 rounded-xl bg-[#D95B2F] hover:bg-[#C84F27] text-xs font-bold text-white transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
              >
                {savingGender ? <Loader2 size={13} className="animate-spin" /> : null}
                Save Changes
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── EDIT ADDRESS MODAL ── */}
      <Dialog open={editAddressModal} onOpenChange={setEditAddressModal}>
        <DialogContent className="max-w-md rounded-3xl bg-white p-6 font-sans border-0 shadow-2xl">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-100 flex items-center justify-center text-[#D95B2F] shrink-0">
                <MapPin size={20} />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-gray-900">Edit Address</DialogTitle>
                <DialogDescription className="text-xs text-gray-500">Update your residential address.</DialogDescription>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold text-gray-600 block">Residential Address</label>
              <textarea
                rows={3}
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                placeholder="Enter full address"
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all resize-none"
              />
              {addressError && (
                <p className="text-xs font-medium text-red-600 flex items-center gap-1.5">
                  <AlertCircle size={13} /> {addressError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setEditAddressModal(false)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAddress}
                disabled={savingAddress || !addressInput.trim()}
                className="px-5 py-2.5 rounded-xl bg-[#D95B2F] hover:bg-[#C84F27] text-xs font-bold text-white transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
              >
                {savingAddress ? <Loader2 size={13} className="animate-spin" /> : null}
                Save Changes
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── CHANGE EMAIL MODAL ── */}
      <Dialog open={showEmailModal} onOpenChange={setShowEmailModal}>
        <DialogContent className="max-w-md rounded-3xl bg-white p-6 font-sans border-0 shadow-2xl">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-100 flex items-center justify-center text-[#D95B2F] shrink-0">
                <KeyRound size={20} />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-gray-900 font-sans">Change Registered Email</DialogTitle>
                <DialogDescription className="text-xs text-gray-500 font-sans">
                  {emailStep === "input" ? "Enter your new email to receive a verification OTP." : `Verification code sent to ${newEmail}`}
                </DialogDescription>
              </div>
            </div>

            {emailStep === "input" ? (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-600 block">New Email Address</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="new.email@example.com"
                    autoFocus
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all font-sans"
                  />
                  {emailError && (
                    <p className="text-xs font-medium text-red-600 flex items-center gap-1.5 font-sans">
                      <AlertCircle size={13} /> {emailError}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEmailModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors font-sans"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleRequestEmailOtp}
                    disabled={emailLoading || !newEmail.trim()}
                    className="px-5 py-2.5 bg-[#D95B2F] hover:bg-[#C84F27] text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5 font-sans active:scale-95"
                  >
                    {emailLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                    Send Verification Code
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-2">
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

                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={handleRequestEmailOtp}
                    disabled={emailCooldown > 0 || emailLoading}
                    className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors disabled:opacity-60 flex items-center gap-1.5 font-sans"
                  >
                    <RotateCcw size={13} />
                    {emailCooldown > 0 ? `Resend (${emailCooldown}s)` : "Resend Code"}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEmailStep("input")}
                      className="px-3 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleVerifyEmailOtp}
                      disabled={emailLoading || emailOtp.length !== 6}
                      className="px-5 py-2.5 bg-[#D95B2F] hover:bg-[#C84F27] text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5 font-sans active:scale-95"
                    >
                      {emailLoading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={14} />}
                      Verify &amp; Update
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── CHANGE PHONE MODAL ── */}
      <Dialog open={showPhoneModal} onOpenChange={setShowPhoneModal}>
        <DialogContent className="max-w-md rounded-3xl bg-white p-6 font-sans border-0 shadow-2xl">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-100 flex items-center justify-center text-[#D95B2F] shrink-0">
                <Phone size={20} />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-gray-900 font-sans">Change Phone Number</DialogTitle>
                <DialogDescription className="text-xs text-gray-500 font-sans">
                  {phoneStep === "input"
                    ? selectedPhoneCountry.code === "IN"
                      ? "Enter your 10-digit Indian mobile number."
                      : `Enter your ${selectedPhoneCountry.name} mobile number.`
                    : `Verification code sent to your registered email (${patient.email})`}
                </DialogDescription>
              </div>
            </div>

            {phoneStep === "input" ? (
              <div className="space-y-4 pt-2">
                {/* Mobile Number with country code auto-inherited from account creation */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-600 block">
                    Mobile Number ({selectedPhoneCountry.name})
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-100 border border-gray-300 rounded-xl text-sm font-bold text-gray-700 select-none shrink-0 font-sans">
                      <span>{selectedPhoneCountry.code}</span>
                      <span>{selectedPhoneCountry.dial}</span>
                    </div>
                    <input
                      type="tel"
                      value={newPhone}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, selectedPhoneCountry.maxLength);
                        setNewPhone(val);
                        if (phoneError) setPhoneError("");
                      }}
                      placeholder={selectedPhoneCountry.placeholder}
                      autoFocus
                      maxLength={selectedPhoneCountry.maxLength}
                      className="flex-1 px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-mono font-bold tracking-widest text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 font-sans">
                    {selectedPhoneCountry.code === "IN"
                      ? `Must start with 6, 7, 8, or 9 (${newPhone.length}/10 digits).`
                      : `${selectedPhoneCountry.localFormat} after ${selectedPhoneCountry.dial} (${newPhone.length}/${selectedPhoneCountry.maxLength} digits).`}
                  </p>
                  {phoneError && (
                    <p className="text-xs font-medium text-red-600 flex items-center gap-1.5 font-sans">
                      <AlertCircle size={13} /> {phoneError}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPhoneModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors font-sans cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleRequestPhoneOtp}
                    disabled={phoneLoading || !validatePatientPhone(newPhone, phoneCountryCode).valid}
                    className="px-5 py-2.5 bg-[#D95B2F] hover:bg-[#C84F27] text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5 font-sans active:scale-95 cursor-pointer"
                  >
                    {phoneLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                    Send Verification Code
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-900 space-y-1 font-sans">
                  <p>
                    <span className="font-bold">Email Verification Code Sent:</span> A 6-digit verification code has been sent to your registered email{" "}
                    <strong className="font-semibold underline">{patient.email}</strong> to verify updating your phone number to{" "}
                    <strong className="font-mono font-bold">
                      {validatePatientPhone(newPhone, phoneCountryCode).valid
                        ? (validatePatientPhone(newPhone, phoneCountryCode) as any).e164
                        : `${selectedPhoneCountry.dial} ${newPhone}`}
                    </strong>.
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

                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={handleRequestPhoneOtp}
                    disabled={phoneCooldown > 0 || phoneLoading}
                    className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors disabled:opacity-60 flex items-center gap-1.5 font-sans"
                  >
                    <RotateCcw size={13} />
                    {phoneCooldown > 0 ? `Resend (${phoneCooldown}s)` : "Resend Code"}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPhoneStep("input")}
                      className="px-3 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleVerifyPhoneOtp}
                      disabled={phoneLoading || phoneOtp.length !== 6}
                      className="px-5 py-2.5 bg-[#D95B2F] hover:bg-[#C84F27] text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5 font-sans active:scale-95"
                    >
                      {phoneLoading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={14} />}
                      Verify &amp; Update
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
                className="px-5 py-2.5 rounded-xl bg-[#D95B2F] hover:bg-amber-700 text-xs font-bold text-white transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
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
                <DialogTitle className="text-lg font-bold text-gray-900"style={{ fontFamily: "'DM Sans', sans-serif" }}>Request Account Deletion</DialogTitle>
                <p className="text-xs text-gray-500">Permanent data removal request</p>
              </div>
            </div>

            <DialogDescription className="text-xs sm:text-sm text-gray-600 leading-relaxed space-y-2">
              <span className="block">
                Before requesting account deletion, please download and save any prescriptions and medical documents you want to keep.
              </span>
              <span className="block pt-1 text-red-700 font-medium">
                Once submitted, a 15-day grace period will start. During this 15-day period, you can cancel the request anytime. If not cancelled, the administrator will review and process permanent deletion.
              </span>
            </DialogDescription>

            {/* Backup Download Button */}
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
