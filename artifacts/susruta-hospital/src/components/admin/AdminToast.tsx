import React, { useEffect, useState } from "react";
import { X, Bell } from "lucide-react";
import type { ToastItem } from "@/hooks/useAdminNotifications";

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    setVisible(false);
    setTimeout(onDismiss, 300);
  }

  return (
    <div
      onClick={dismiss}
      style={{
        transform: visible ? "translateX(0)" : "translateX(110%)",
        opacity: visible ? 1 : 0,
        transition: "transform 0.3s cubic-bezier(.22,1,.36,1), opacity 0.3s ease",
      }}
      className="flex items-start gap-3 bg-[#1a3d2b] text-white rounded-2xl shadow-2xl px-4 py-3.5 w-80 cursor-pointer select-none"
    >
      <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
        <Bell size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm leading-snug">{toast.title}</p>
        <p className="text-white/70 text-xs mt-0.5 leading-snug">{toast.body}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); dismiss(); }}
        className="flex-shrink-0 mt-0.5 text-white/50 hover:text-white transition-colors"
      >
        <X size={13} />
      </button>
    </div>
  );
}

export function AdminToastContainer({ toasts, onDismiss }: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast toast={t} onDismiss={() => onDismiss(t.id)} />
        </div>
      ))}
    </div>
  );
}
