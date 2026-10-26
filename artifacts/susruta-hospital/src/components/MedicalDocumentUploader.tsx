import React, { useState, useRef, useEffect } from "react";
import { Camera, Upload, Loader2, AlertCircle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useScrollLock } from "@/hooks/use-scroll-lock";

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

  // Lock background scrolling while modal is open
  useScrollLock(mode === "popover" && isOpen);

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
                className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-6 bg-black/60 backdrop-blur-sm font-sans font-['DM_Sans',sans-serif] overscroll-contain select-none"
                style={{ touchAction: "none" }}
                onTouchMove={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
                onWheel={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
              >
                <motion.div
                  ref={popoverRef}
                  onClick={(e) => e.stopPropagation()}
                  initial={{ scale: 0.95, opacity: 0, y: 15 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 15 }}
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  className="bg-white w-full max-w-[380px] sm:max-w-xl md:max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto overscroll-contain select-text"
                  style={{ maxHeight: "90vh", touchAction: "auto" }}
                >
                  {/* Modal Header (Susruta Hospital Orange Theme) */}
                  <div className="bg-[#D95B2F] px-5 py-4 sm:px-6 sm:py-5 flex items-center justify-between gap-3 shrink-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-white/90 sm:text-white/80 text-[11px] sm:text-xs font-normal sm:font-medium tracking-wide sm:tracking-wider">
                        Upload or capture your medical documents
                      </p>
                      <h2 className="text-white font-bold text-lg sm:text-xl md:text-2xl leading-tight mt-0.5 sm:mt-0">
                        Medical Documents
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      aria-label="Close modal"
                      className="w-9 h-9 rounded-full sm:rounded-xl bg-white/20 sm:bg-white/10 hover:bg-white/30 sm:hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer shrink-0"
                    >
                      <X size={18} strokeWidth={2} />
                    </button>
                  </div>

                  {/* Main Content Area */}
                  <div className="p-4 sm:p-6 md:p-8 flex-1 overflow-y-auto overscroll-contain flex flex-col justify-center bg-white">
                    {/* TWO Side-by-Side Horizontal Option Cards */}
                    <div className="grid grid-cols-2 gap-3 sm:gap-6 my-auto">
                      {/* LEFT: Take Photo */}
                      <button
                        type="button"
                        onClick={handleTakeClick}
                        disabled={isUploading}
                        className="flex flex-col items-center justify-center p-3.5 py-5 sm:p-8 md:p-10 bg-[#FFF9F6] sm:bg-orange-50/60 hover:bg-[#FFF4EF] border border-dashed border-[#FDBA74] sm:border-2 sm:border-[#D95B2F]/40 hover:border-[#FB923C] sm:hover:border-[#D95B2F] rounded-2xl transition-all cursor-pointer group text-center disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                      >
                        <div className="w-13 h-13 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full bg-[#FFEAE0] sm:bg-[#FFF4EF] text-[#D95B2F] flex items-center justify-center mb-2.5 sm:mb-4 group-hover:scale-105 sm:group-hover:scale-110 transition-transform shadow-xs shrink-0">
                          <Camera size={26} className="sm:hidden" strokeWidth={1.8} />
                          <Camera size={32} className="hidden sm:block sm:w-8 sm:h-8 md:w-9 md:h-9" />
                        </div>
                        <p className="sm:hidden text-[13px] font-bold text-gray-900 group-hover:text-[#D95B2F] transition-colors leading-snug">
                          Take Photo
                        </p>
                        <p className="hidden sm:block text-lg sm:text-xl font-bold text-gray-900 group-hover:text-[#D95B2F] transition-colors mb-1">
                          📷 Take Photo
                        </p>
                        <p className="sm:hidden text-[10px] text-gray-500 mt-1 leading-tight max-w-[120px]">
                          Capture a medical document
                        </p>
                        <p className="hidden sm:block text-xs sm:text-sm text-gray-500 leading-relaxed max-w-[200px]">
                          Capture a medical document
                        </p>
                      </button>

                      {/* RIGHT: Upload Document */}
                      <button
                        type="button"
                        onClick={handleUploadClick}
                        disabled={isUploading}
                        className="flex flex-col items-center justify-center p-3.5 py-5 sm:p-8 md:p-10 bg-[#F8FAFC] sm:bg-slate-50/80 hover:bg-slate-100/90 border border-dashed border-[#BAE6FD] sm:border-2 sm:border-slate-300 hover:border-[#7DD3FC] sm:hover:border-slate-400 rounded-2xl transition-all cursor-pointer group text-center disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                      >
                        <div className="w-13 h-13 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full bg-[#E0F2FE] sm:bg-slate-200/80 text-[#0284C7] sm:text-slate-700 flex items-center justify-center mb-2.5 sm:mb-4 group-hover:scale-105 sm:group-hover:scale-110 transition-transform shadow-xs shrink-0">
                          <Upload size={26} className="sm:hidden" strokeWidth={1.8} />
                          <Upload size={32} className="hidden sm:block sm:w-8 sm:h-8 md:w-9 md:h-9" />
                        </div>
                        <p className="sm:hidden text-[13px] font-bold text-gray-900 leading-snug">
                          Upload Document
                        </p>
                        <p className="hidden sm:block text-lg sm:text-xl font-bold text-gray-900 transition-colors mb-1">
                          📄 Upload Document
                        </p>
                        <p className="sm:hidden text-[10px] text-gray-500 mt-1 leading-tight max-w-[120px]">
                          Choose a document from your device
                        </p>
                        <p className="hidden sm:block text-xs sm:text-sm text-gray-500 leading-relaxed max-w-[200px]">
                          Choose a document from your device
                        </p>
                      </button>
                    </div>

                    {errorMsg && (
                      <p className="text-xs text-red-600 mt-3 text-center font-medium">
                        {errorMsg}
                      </p>
                    )}
                  </div>

                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Mode 2: CARDS (Appointment Booking Flow) */}
      {mode === "cards" && (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 mb-3 sm:mb-4">
          <button
            type="button"
            disabled={isUploading}
            onClick={handleTakeClick}
            className="flex flex-col items-center justify-center p-3 sm:p-5 bg-orange-50/70 hover:bg-[#FFF4EF] border-2 border-dashed border-[#D95B2F]/40 hover:border-[#D95B2F] rounded-2xl transition-all cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-[#FFF4EF] text-[#D95B2F] flex items-center justify-center mb-1.5 sm:mb-2.5 group-hover:scale-105 transition-transform shrink-0">
              {isUploading ? (
                <Loader2 size={18} className="animate-spin sm:w-5 sm:h-5" />
              ) : (
                <>
                  <Camera size={18} className="sm:hidden" />
                  <Camera size={22} className="hidden sm:block" />
                </>
              )}
            </div>
            <p className="text-xs sm:text-sm font-bold text-gray-900 group-hover:text-[#D95B2F] transition-colors leading-tight">
              <span className="sm:hidden">Take Photo</span>
              <span className="hidden sm:inline">📷 Take Photo</span>
            </p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 text-center leading-tight">
              <span className="sm:hidden">Capture document</span>
              <span className="hidden sm:inline">Capture a medical document</span>
            </p>
          </button>

          <button
            type="button"
            disabled={isUploading}
            onClick={handleUploadClick}
            className="flex flex-col items-center justify-center p-3 sm:p-5 bg-slate-50/80 hover:bg-slate-100/80 border-2 border-dashed border-slate-300 hover:border-slate-400 rounded-2xl transition-all cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-slate-200/80 text-slate-700 flex items-center justify-center mb-1.5 sm:mb-2.5 group-hover:scale-105 transition-transform shrink-0">
              {isUploading ? (
                <Loader2 size={18} className="animate-spin sm:w-5 sm:h-5" />
              ) : (
                <>
                  <Upload size={18} className="sm:hidden" />
                  <Upload size={22} className="hidden sm:block" />
                </>
              )}
            </div>
            <p className="text-xs sm:text-sm font-bold text-gray-900 transition-colors leading-tight">
              <span className="sm:hidden">Upload Document</span>
              <span className="hidden sm:inline">📄 Upload Document</span>
            </p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 text-center leading-tight">
              <span className="sm:hidden">Choose from device</span>
              <span className="hidden sm:inline">Choose from your device</span>
            </p>
          </button>
        </div>
      )}
    </div>
  );
}
