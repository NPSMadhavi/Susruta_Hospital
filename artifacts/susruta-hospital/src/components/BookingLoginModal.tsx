import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Leaf, Mail, User, Phone, ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL ?? "/"}api/patient`.replace(/\/\//g, "/");

async function requestMagicLink(body: object) {
  const res = await fetch(`${API_BASE}/auth/request`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw data;
  return data;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onContinueAsGuest: () => void;
}

type Mode = "login" | "register";
type Step = "form" | "sent";

export function BookingLoginModal({ open, onClose, onContinueAsGuest }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "" });

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => { setStep("form"); setError(""); setForm({ name: "", email: "", phone: "" }); setMode("login"); }, 300);
    }
  }, [open]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await requestMagicLink({
        email: form.email,
        name: mode === "register" ? form.name : undefined,
        phone: mode === "register" && form.phone ? form.phone : undefined,
        next: "/appointments",
      });
      setSentEmail(form.email);
      setStep("sent");
    } catch (err: any) {
      if (err?.error === "name_required") {
        setError("No account found. Please create an account.");
        setMode("register");
      } else {
        setError(err?.message || "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
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
              <button onClick={onClose} className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors">
                <X size={20} />
              </button>
              <div className="w-14 h-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-4">
                <Leaf size={26} className="text-green-300" />
              </div>
              <h2 className="text-xl font-serif font-bold mb-1">Book Your Appointment</h2>
              <p className="text-white/65 text-sm">Sign in or create an account to track your bookings</p>
            </div>

            {/* Body */}
            <div className="px-8 py-7">
              <AnimatePresence mode="wait">
                {step === "form" ? (
                  <motion.div key="form" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                    {/* Tab switcher */}
                    <div className="bg-muted/60 rounded-2xl p-1 flex mb-5">
                      {(["login", "register"] as Mode[]).map((m) => (
                        <button key={m} onClick={() => { setMode(m); setError(""); }}
                          className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${mode === m ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          {m === "login" ? "Sign In" : "Create Account"}
                        </button>
                      ))}
                    </div>

                    {error && (
                      <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                        {error}
                      </div>
                    )}

                    <form onSubmit={submit} className="space-y-3.5">
                      {mode === "register" && (
                        <>
                          <div className="relative">
                            <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input type="text" required value={form.name} onChange={set("name")}
                              placeholder="Full Name *" autoComplete="name"
                              className="w-full pl-9 pr-4 py-3 border border-border rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
                          </div>
                          <div className="relative">
                            <Phone size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input type="tel" value={form.phone} onChange={set("phone")}
                              placeholder="Phone Number (optional)" autoComplete="tel"
                              className="w-full pl-9 pr-4 py-3 border border-border rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
                          </div>
                        </>
                      )}

                      <div className="relative">
                        <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input type="email" required value={form.email} onChange={set("email")}
                          placeholder="Email Address *" autoComplete="email"
                          className="w-full pl-9 pr-4 py-3 border border-border rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
                      </div>

                      <button type="submit" disabled={loading}
                        className="w-full bg-primary text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-60 shadow-lg shadow-primary/20"
                      >
                        {loading
                          ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : <><span>Send me a login link</span><ArrowRight size={14} /></>
                        }
                      </button>
                    </form>

                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-xs text-muted-foreground">or</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>

                    <button onClick={onContinueAsGuest}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm text-muted-foreground hover:text-primary transition-colors group"
                    >
                      <span>Continue as guest</span>
                      <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </motion.div>
                ) : (
                  <motion.div key="sent" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-4">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 size={32} className="text-green-600" />
                    </div>
                    <h3 className="font-serif font-bold text-lg mb-2">Check your inbox</h3>
                    <p className="text-muted-foreground text-sm mb-1">We've sent a login link to</p>
                    <p className="font-semibold text-foreground text-sm mb-4">{sentEmail}</p>
                    <p className="text-muted-foreground text-xs mb-5">
                      Click the link in the email to proceed to booking.<br />
                      Link expires in 15 minutes.
                    </p>
                    <button onClick={() => { setStep("form"); setError(""); }}
                      className="flex items-center gap-2 mx-auto text-sm text-primary hover:underline"
                    >
                      <RefreshCw size={12} /> Use a different email
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
