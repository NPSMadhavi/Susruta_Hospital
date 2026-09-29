import React from "react";
import { Trash2, Loader2 } from "lucide-react";

interface ConfirmDeleteDialogProps {
  isOpen: boolean;
  title: string;
  description: React.ReactNode;
  warningText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmDeleteDialog({
  isOpen,
  title,
  description,
  warningText = "This action cannot be undone.",
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  isLoading = false,
  onConfirm,
  onClose,
}: ConfirmDeleteDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 sm:p-7 border border-border animate-in zoom-in-95 duration-150">
        <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-4">
          <Trash2 size={24} />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        <div className="text-sm text-gray-600 mb-1 leading-relaxed">
          {description}
        </div>
        {warningText && (
          <p className="text-xs text-red-600 font-semibold mb-6">{warningText}</p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer shadow-sm shadow-red-600/20"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : null}
            {isLoading ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
