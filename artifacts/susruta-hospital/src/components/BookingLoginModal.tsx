import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Leaf, Mail, Lock, Eye, EyeOff, User, Phone, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

const API_BASE = `${import.meta.env.BASE_URL ?? "/"}api/patient`.replace(/\/\//g, "/");

async function apiPost(path: string, body: object) {
  const res = await fetch(`${API_BASE}${path}`, {
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

export function BookingLoginModal({ open, onClose, onContinueAsGuest }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [, navigate] = useLocation();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setError(""); setShowPw(false);
        setForm({ name: "", email: "", phone: "", password: "" });
        setMode("login");
      }, 300);
    }
  }, [open]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await apiPost("/auth/login", { email: form.email, password: form.password });
      } else {
        await apiPost("/auth/register", { name: form.name, email: form.email, phone: form.phone || undefined, password: form.password });
      }
      onClose();
      navigate("/portal/dashboard");
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full pl-9 pr-4 py-3 border border-border rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all";

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            {/* Green header */}
            <div className="bg-[#1a3d2b] px-8 pt-7 pb-6 text-white text-center relative">
              <button onClick={onClose} className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors">
                <X size={20} />
              </button>
              <div className="w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-3">
                <Leaf size={22} className="text-green-300" />
              </div>
              <h2 className="text-lg font-serif font-bold mb-0.5">Book Your Appointment</h2>
              <p className="text-white/60 text-xs">Sign in to track your bookings and get reminders</p>
            </div>

            {/* Form body */}
            <div className="px-8 py-6">
              {/* Tabs */}
              <div className="bg-muted/60 rounded-2xl p-1 flex mb-5">
                {(["login", "register"] as Mode[]).map((m) => (
                  <button key={m} onClick={() => { setMode(m); setError(""); setShowPw(false); }}
                    className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${mode === m ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {m === "login" ? "Sign In" : "Create Account"}
                  </button>
                ))}
              </div>

              {error && (
                <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                  className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                  {error}
                </motion.div>
              )}

              <form onSubmit={submit} className="space-y-3.5">
                <AnimatePresence initial={false}>
                  {mode === "register" && (
                    <motion.div key="reg-fields"
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      className="space-y-3.5 overflow-hidden"
                    >
                      <div className="relative">
                        <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input type="text" required value={form.name} onChange={set("name")}
                          placeholder="Full Name *" autoComplete="name" className={inputCls} />
                      </div>
                      <div className="relative">
                        <Phone size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input type="tel" value={form.phone} onChange={set("phone")}
                          placeholder="Phone Number (optional)" autoComplete="tel" className={inputCls} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Email */}
                <div>
                  {mode === "login" && <label className="block text-sm font-medium text-foreground/80 mb-1.5">Email Address</label>}
                  <div className="relative">
                    <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input type="email" required value={form.email} onChange={set("email")}
                      placeholder="you@example.com" autoComplete="email" className={inputCls} />
                  </div>
                </div>

                {/* Password */}
                <div>
                  {mode === "login" && <label className="block text-sm font-medium text-foreground/80 mb-1.5">Password</label>}
                  <div className="relative">
                    <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input type={showPw ? "text" : "password"} required value={form.password} onChange={set("password")}
                      placeholder={mode === "register" ? "Create a password (min 6 chars)" : "Your password"}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      className={`${inputCls} pr-10`}
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full bg-primary text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-60 shadow-lg shadow-primary/20 mt-1"
                >
                  {loading
                    ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <><span>{mode === "login" ? "Sign In to Portal" : "Create Account"}</span><ArrowRight size={14} /></>
                  }
                </button>
              </form>

              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <button onClick={onContinueAsGuest}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
              >
                <span>Continue as guest</span>
                <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
