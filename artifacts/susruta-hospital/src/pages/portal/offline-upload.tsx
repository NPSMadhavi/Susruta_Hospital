import React, { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import {
  Upload,
  Camera,
  CheckCircle2,
  FileText,
  AlertCircle,
  Clock,
  Loader2,
  X,
  ArrowRight,
  ShieldCheck,
  Building2,
} from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";

const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

interface TokenInfo {
  valid: boolean;
  patientName: string;
  patientCode: string;
  appointmentDate: string;
  timeSlot: string;
  token: string;
  expiresAt: string;
}

interface UploadedDocItem {
  id: number;
  name: string;
  size: number;
  createdAt: string;
}

export default function OfflineUploadPage() {
  const [, paramsMain] = useRoute("/upload-documents/:token");
  const [, paramsAlt1] = useRoute("/patient/offline-upload/:token");
  const [, paramsAlt2] = useRoute("/portal/offline-upload/:token");
  const token = paramsMain?.token || paramsAlt1?.token || paramsAlt2?.token || "";
  const [, navigate] = useLocation();

  const [loading, setLoading] = useState(true);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isExpired, setIsExpired] = useState(false);

  const [uploadedFiles, setUploadedFiles] = useState<UploadedDocItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) {
      setErrorMsg("This medical document upload link is invalid. Please contact the hospital for assistance.");
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/appointments/upload-documents/${token}`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.valid) {
          if (res.status === 410 || data.error === "expired") {
            setIsExpired(true);
            setErrorMsg(data.message || "This medical document upload link has expired. Please contact the hospital or request a new QR code.");
          } else {
            setErrorMsg(data.message || "This medical document upload link is invalid. Please contact the hospital for assistance.");
          }
          setTokenInfo(null);
        } else {
          setTokenInfo(data);
        }
      })
      .catch((err) => {
        console.error("Error verifying QR token:", err);
        setErrorMsg("Unable to verify upload access. Please check your internet connection.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const processFiles = async (fileList: FileList | File[]) => {
    if (!fileList || fileList.length === 0 || !tokenInfo) return;

    setIsUploading(true);
    setErrorMsg("");

    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];

        // 1. Request upload URL from storage endpoint
        const reqRes = await fetch(`${API_BASE}/storage/uploads/request-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            contentType: file.type || "application/octet-stream",
          }),
        });

        if (!reqRes.ok) {
          throw new Error(`Failed to request upload URL for ${file.name}`);
        }

        const { uploadURL, objectPath } = await reqRes.json();

        // 2. Upload file content to storage
        const putRes = await fetch(uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });

        if (!putRes.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        // 3. Register document with backend QR token endpoint
        const docRes = await fetch(`${API_BASE}/appointments/upload-documents/${token}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: file.name,
            objectPath,
            contentType: file.type || "application/octet-stream",
            size: file.size,
          }),
        });

        if (!docRes.ok) {
          const errData = await docRes.json();
          throw new Error(errData.message || `Failed to save ${file.name}`);
        }

        const docData = await docRes.json();

        setUploadedFiles((prev) => [
          ...prev,
          {
            id: docData.document?.id || Date.now(),
            name: file.name,
            size: file.size,
            createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      }

      setUploadSuccess(true);
    } catch (err: any) {
      console.error("Upload error:", err);
      setErrorMsg(err.message || "Failed to upload file. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const handleDeviceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center max-w-sm w-full space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-[#D95B2F] mx-auto" />
          <p className="text-sm font-semibold text-slate-700">Verifying upload access…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 px-4 py-3.5 shadow-2xs">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Susruta Hospital" className="h-8 object-contain" />
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-tight">Susruta Hospital</h1>
              <p className="text-[11px] font-medium text-slate-500">Medical Document Upload Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 text-[11px] font-semibold">
            <ShieldCheck size={13} />
            <span>Secure Access</span>
          </div>
        </div>
      </header>

      {/* Hidden File Inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraChange}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        onChange={handleDeviceFileChange}
        className="hidden"
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* EXPIRED OR INVALID STATE */}
        {(isExpired || (errorMsg && !tokenInfo)) && (
          <div className="bg-white rounded-2xl border border-red-200 p-6 shadow-sm text-center space-y-4 my-8">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={28} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {isExpired ? "Upload Link Expired" : "Invalid Upload Link"}
              </h2>
              <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
                {errorMsg ||
                  (isExpired
                    ? "This medical document upload link has expired. Please contact the hospital or request a new QR code."
                    : "This medical document upload link is invalid. Please contact the hospital for assistance.")}
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl text-xs text-slate-500 font-medium">
              Please contact Susruta Hospital desk or staff for assistance with your consultation documents.
            </div>
            <button
              type="button"
              onClick={() => (window.location.href = "/portal/login")}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#D95B2F] hover:bg-[#c04e26] text-white text-xs font-bold transition-all cursor-pointer mx-auto"
            >
              <span>Continue to Patient Login</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* VALID QR TOKEN STATE */}
        {tokenInfo && (
          <>
            {/* Patient & Appointment Information Banner */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-[#D95B2F]" />
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Consultation Record
                  </span>
                </div>
                <span className="text-[11px] font-mono font-bold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-md border border-slate-200">
                  Token: {tokenInfo.token}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="block text-[11px] text-slate-400 font-medium">Patient Name</span>
                  <span className="font-bold text-slate-900 text-sm mt-0.5 block truncate">{tokenInfo.patientName}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-slate-400 font-medium">Patient ID</span>
                  <span className="font-bold font-mono text-[#D95B2F] text-sm mt-0.5 block">{tokenInfo.patientCode}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-slate-400 font-medium">Date</span>
                  <span className="font-bold text-slate-800 mt-0.5 block">{tokenInfo.appointmentDate}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-slate-400 font-medium">Slot</span>
                  <span className="font-bold text-slate-800 mt-0.5 block truncate">{tokenInfo.timeSlot}</span>
                </div>
              </div>
            </div>

            {/* Error Notification Alert */}
            {errorMsg && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-600 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{errorMsg}</span>
                </div>
                <button type="button" onClick={() => setErrorMsg("")} className="text-red-400 hover:text-red-600">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Upload Medical Documents Main Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Upload Medical Documents</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Please upload your medical documents.
                </p>
              </div>

              {/* Action Buttons: Take Picture OR Upload from Device */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-3 p-6 bg-orange-50/70 hover:bg-[#FFF4EF] border-2 border-dashed border-[#D95B2F]/40 hover:border-[#D95B2F] rounded-2xl transition-all cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-14 h-14 rounded-full bg-[#FFF4EF] text-[#D95B2F] flex items-center justify-center group-hover:scale-105 transition-transform">
                    {isUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-7 h-7" />}
                  </div>
                  <div className="text-center">
                    <span className="block text-sm font-bold text-slate-900 group-hover:text-[#D95B2F] transition-colors">
                      📷 Take a Picture
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      Use camera to photograph document
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-3 p-6 bg-slate-50/80 hover:bg-slate-100/80 border-2 border-dashed border-slate-300 hover:border-slate-400 rounded-2xl transition-all cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-14 h-14 rounded-full bg-slate-200/80 text-slate-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                    {isUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-7 h-7" />}
                  </div>
                  <div className="text-center">
                    <span className="block text-sm font-bold text-slate-900 transition-colors">
                      📁 Upload from Device
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      Select photos or PDF files from device
                    </span>
                  </div>
                </button>
              </div>

              {/* Uploading Status Indicator */}
              {isUploading && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center gap-3 text-xs font-semibold text-slate-700">
                  <Loader2 className="w-4 h-4 animate-spin text-[#D95B2F]" />
                  <span>Uploading medical documents...</span>
                </div>
              )}

              {/* Uploaded Documents List */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-2.5 pt-2 border-t border-slate-100">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Uploaded Documents ({uploadedFiles.length})
                  </h3>
                  <div className="space-y-2">
                    {uploadedFiles.map((doc, idx) => (
                      <div
                        key={doc.id || idx}
                        className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between text-xs transition-all"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                          <FileText size={15} className="text-slate-500 shrink-0" />
                          <span className="font-semibold text-slate-800 truncate">{doc.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono shrink-0">
                            ({formatFileSize(doc.size)})
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-700 shrink-0 bg-emerald-100 px-2 py-0.5 rounded-md">
                          Uploaded
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload Success Banner */}
              {uploadSuccess && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-emerald-800 text-sm">
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                    <span>✓ Documents Uploaded Successfully</span>
                  </div>
                  <p className="text-emerald-700">
                    Your medical documents have been securely associated with your patient record.
                  </p>
                </div>
              )}

              {/* Continue to Patient Login Button Footer */}
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                  <Clock size={14} className="text-slate-400" />
                  <span>Temporary upload access link expires in 24 hours</span>
                </div>

                <button
                  type="button"
                  onClick={() => (window.location.href = "/portal/login")}
                  className="w-full sm:w-auto px-6 py-2.5 bg-[#D95B2F] hover:bg-[#c04e26] text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Continue to Patient Login</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
