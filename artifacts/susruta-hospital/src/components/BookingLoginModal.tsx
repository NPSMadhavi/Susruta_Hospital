import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Leaf, ArrowRight, UserCheck } from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";

const GOOGLE_AUTH_URL = `${import.meta.env.BASE_URL ?? "/"}api/patient/auth/google`.replace(/\/\//g, "/");

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  onContinueAsGuest: () => void;
}

export function BookingLoginModal({ open, onClose, onContinueAsGuest }: Props) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  function handleGoogle() {
    window.location.href = `${GOOGLE_AUTH_URL}?next=/appointments`;
  }

  function handleEmailLogin() {
    window.location.href = "/portal?next=/appointments";
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Card */}
          <motion.div
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            {/* Green top band */}
            <div className="bg-[#1a3d2b] px-8 pt-8 pb-6 text-white text-center relative">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
              <div className="w-14 h-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-4">
                <Leaf size={26} className="text-green-300" />
              </div>
              <h2 className="text-xl font-serif font-bold mb-1">Book Smarter with an Account</h2>
              <p className="text-white/65 text-sm leading-relaxed">
                Log in to auto-fill your details, track appointments, and get follow-up reminders.
              </p>
            </div>

            {/* Body */}
            <div className="px-8 py-7 space-y-3">
              {/* Benefits */}
              <div className="flex flex-col gap-2 mb-5">
                {[
                  { icon: "📋", text: "Auto-fill your name, phone & email" },
                  { icon: "🔔", text: "Get appointment confirmation & reminders" },
                  { icon: "📅", text: "View all upcoming & past visits" },
                ].map((b) => (
                  <div key={b.text} className="flex items-center gap-3 text-sm text-foreground/70">
                    <span className="text-base">{b.icon}</span>
                    <span>{b.text}</span>
                  </div>
                ))}
              </div>

              {/* Google */}
              <button
                onClick={handleGoogle}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-border rounded-xl bg-white hover:bg-gray-50 transition-all text-sm font-medium text-foreground/80 shadow-sm hover:shadow"
              >
                <GoogleIcon />
                Continue with Google
              </button>

              {/* Email login */}
              <button
                onClick={handleEmailLogin}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
              >
                <UserCheck size={16} />
                Sign In with Email
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Skip */}
              <button
                onClick={onContinueAsGuest}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm text-muted-foreground hover:text-primary transition-colors group"
              >
                <span>Skip and book as guest</span>
                <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
              </button>

              <p className="text-center text-xs text-muted-foreground/60 pb-1">
                No account needed to make a booking — login just makes it easier.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
