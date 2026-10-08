import React, { useState, useRef, useEffect } from "react";
import { Camera, Upload, Loader2, AlertCircle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface MedicalDocumentUploaderProps {
  onUploadFiles: (files: File[]) => Promise<void> | void;
  isUploading?: boolean;
  mode: "popover" | "cards";
  className?: string;
  maxSizeMB?: number;
}

export function MedicalDocumentUploader({
  onUploadFiles,
  isUploading = false,
  mode,
  className = "",
  maxSizeMB = 10,
}: MedicalDocumentUploaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close modal on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const validateAndProcessFiles = (fileList: FileList | File[]) => {
    setErrorMsg("");
    const validFiles: File[] = [];
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.size > maxSizeBytes) {
        setErrorMsg(`File "${file.name}" exceeds the ${maxSizeMB} MB size limit.`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      onUploadFiles(validFiles);
    }
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcessFiles(e.target.files);
    }
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcessFiles(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleTakeClick = () => {
    setErrorMsg("");
    setIsOpen(false);
    try {
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
      }
    } catch {
      setErrorMsg("Camera capture is unavailable on this device. Please upload a document instead.");
    }
  };

  const handleUploadClick = () => {
    setErrorMsg("");
    setIsOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className={`relative ${className}`}>
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
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,image/*,application/pdf"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Error / Warning Alert */}
      {errorMsg && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 text-xs font-medium text-red-600 rounded-xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0 text-red-500" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg("")}
            className="text-red-400 hover:text-red-600 p-0.5 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Mode 1: POPOVER / MODAL (Patient Portal -> Medical Documents Tab) */}
      {mode === "popover" && (
        <div className="inline-block">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            disabled={isUploading}
            className="bg-[#D95B2F] hover:bg-[#C84F27] text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {isUploading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Upload size={16} />
            )}
            <span>{isUploading ? "Uploading…" : "Upload Document"}</span>
          </button>

          {/* Book Appointment-Style Application Modal */}
          <AnimatePresence>
            {isOpen && (
              <div
                onClick={() => setIsOpen(false)}
                className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm font-sans font-['DM_Sans',sans-serif]"
              >
                <motion.div
                  ref={popoverRef}
                  onClick={(e) => e.stopPropagation()}
                  initial={{ y: 80, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 80, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="bg-white w-full max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
                  style={{ maxHeight: "90vh" }}
                >
                  {/* Modal Header (Susruta Hospital Orange Theme) */}
                  <div className="bg-[#D95B2F] px-6 py-5 flex items-center justify-between gap-3 shrink-0">
                    <div className="flex-1">
                      <p className="text-white/80 text-xs font-medium tracking-wider">
                        Upload or capture your medical documents
                      </p>
                      <h2 className="text-white font-bold text-lg md:text-xl leading-tight">
                        Medical Documents
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      aria-label="Close modal"
                      className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer shrink-0"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Scrollable Main Content */}
                  <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col justify-center">
                    {/* TWO Large Side-by-Side Horizontal Option Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 my-auto">
                      {/* LEFT: Take Photo */}
                      <button
                        type="button"
                        onClick={handleTakeClick}
                        disabled={isUploading}
                        className="flex flex-col items-center justify-center p-8 sm:p-10 bg-orange-50/60 hover:bg-[#FFF4EF] border-2 border-dashed border-[#D95B2F]/40 hover:border-[#D95B2F] rounded-2xl transition-all cursor-pointer group text-center disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                      >
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#FFF4EF] text-[#D95B2F] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-xs">
                          <Camera size={32} className="sm:w-9 sm:h-9" />
                        </div>
                        <p className="text-lg sm:text-xl font-bold text-gray-900 group-hover:text-[#D95B2F] transition-colors mb-1">
                          📷 Take Photo
                        </p>
                        <p className="text-xs sm:text-sm text-gray-500 leading-relaxed max-w-[200px]">
                          Capture a medical document
                        </p>
                      </button>

                      {/* RIGHT: Upload Document */}
                      <button
                        type="button"
                        onClick={handleUploadClick}
                        disabled={isUploading}
                        className="flex flex-col items-center justify-center p-8 sm:p-10 bg-slate-50/80 hover:bg-slate-100/90 border-2 border-dashed border-slate-300 hover:border-slate-400 rounded-2xl transition-all cursor-pointer group text-center disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                      >
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-200/80 text-slate-700 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-xs">
                          <Upload size={32} className="sm:w-9 sm:h-9" />
                        </div>
                        <p className="text-lg sm:text-xl font-bold text-gray-900 transition-colors mb-1">
                          📄 Upload Document
                        </p>
                        <p className="text-xs sm:text-sm text-gray-500 leading-relaxed max-w-[200px]">
                          Choose a document from your device
                        </p>
                      </button>
                    </div>
                  </div>

                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Mode 2: CARDS (Appointment Booking Flow) */}
      {mode === "cards" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-4">
          <button
            type="button"
            disabled={isUploading}
            onClick={handleTakeClick}
            className="flex flex-col items-center justify-center p-5 bg-orange-50/70 hover:bg-[#FFF4EF] border-2 border-dashed border-[#D95B2F]/40 hover:border-[#D95B2F] rounded-2xl transition-all cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-12 h-12 rounded-full bg-[#FFF4EF] text-[#D95B2F] flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
              {isUploading ? <Loader2 size={22} className="animate-spin" /> : <Camera size={22} />}
            </div>
            <p className="text-sm font-bold text-gray-900 group-hover:text-[#D95B2F] transition-colors">
              📷 Take Photo
            </p>
            <p className="text-xs text-gray-500 mt-0.5 text-center">
              Capture a medical document
            </p>
          </button>

          <button
            type="button"
            disabled={isUploading}
            onClick={handleUploadClick}
            className="flex flex-col items-center justify-center p-5 bg-slate-50/80 hover:bg-slate-100/80 border-2 border-dashed border-slate-300 hover:border-slate-400 rounded-2xl transition-all cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-12 h-12 rounded-full bg-slate-200/80 text-slate-700 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
              {isUploading ? <Loader2 size={22} className="animate-spin" /> : <Upload size={22} />}
            </div>
            <p className="text-sm font-bold text-gray-900 transition-colors">
              📄 Upload Document
            </p>
            <p className="text-xs text-gray-500 mt-0.5 text-center">
              Choose from your device
            </p>
          </button>
        </div>
      )}
    </div>
  );
}
