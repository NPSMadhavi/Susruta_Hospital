import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Leaf, Mail, Lock, Eye, EyeOff, User, Phone, ArrowRight, Globe } from "lucide-react";
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

const COUNTRIES = [
  { code: "IN", name: "India", dial: "+91", flag: "🇮🇳" },
  { code: "AE", name: "UAE", dial: "+971", flag: "🇦🇪" },
  { code: "SA", name: "Saudi Arabia", dial: "+966", flag: "🇸🇦" },
  { code: "QA", name: "Qatar", dial: "+974", flag: "🇶🇦" },
  { code: "KW", name: "Kuwait", dial: "+965", flag: "🇰🇼" },
  { code: "OM", name: "Oman", dial: "+968", flag: "🇴🇲" },
  { code: "BH", name: "Bahrain", dial: "+973", flag: "🇧🇭" },
  { code: "US", name: "United States", dial: "+1", flag: "🇺🇸" },
  { code: "CA", name: "Canada", dial: "+1", flag: "🇨🇦" },
  { code: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧" },
  { code: "AU", name: "Australia", dial: "+61", flag: "🇦🇺" },
  { code: "NZ", name: "New Zealand", dial: "+64", flag: "🇳🇿" },
  { code: "SG", name: "Singapore", dial: "+65", flag: "🇸🇬" },
  { code: "MY", name: "Malaysia", dial: "+60", flag: "🇲🇾" },
  { code: "ZA", name: "South Africa", dial: "+27", flag: "🇿🇦" },
  { code: "DE", name: "Germany", dial: "+49", flag: "🇩🇪" },
  { code: "FR", name: "France", dial: "+33", flag: "🇫🇷" },
  { code: "NL", name: "Netherlands", dial: "+31", flag: "🇳🇱" },
  { code: "CH", name: "Switzerland", dial: "+41", flag: "🇨🇭" },
  { code: "JP", name: "Japan", dial: "+81", flag: "🇯🇵" },
];

const defaultForm = { name: "", email: "", phone: "", countryCode: "IN", confirmPassword: "", password: "" };

export function BookingLoginModal({ open, onClose, onContinueAsGuest }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [, navigate] = useLocation();

  const selectedCountry = COUNTRIES.find(c => c.code === form.countryCode) ?? COUNTRIES[0];

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
        setError(""); setShowPw(false); setShowConfirmPw(false);
        setForm(defaultForm);
        setMode("login");
      }, 300);
    }
  }, [open]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "register") {
      if (form.password.length < 6) { setError("Password must be at least 6 characters."); return; }
      if (form.password !== form.confirmPassword) { setError("Passwords do not match."); return; }
    }
    setLoading(true);
    try {
      if (mode === "login") {
        await apiPost("/auth/login", { email: form.email, password: form.password });
      } else {
        const fullPhone = `${selectedCountry.dial}${form.phone.trim()}`;
        await apiPost("/auth/register", {
          name: form.name,
          email: form.email,
          phone: fullPhone,
          password: form.password,
          country: selectedCountry.name,
        });
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
  const selectCls = "w-full pl-9 pr-4 py-3 border border-border rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all appearance-none";

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
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden max-h-[96vh] flex flex-col"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            {/* Green header */}
            <div className="bg-[#1a3d2b] px-8 pt-7 pb-6 text-white text-center relative shrink-0">
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
            <div className="px-8 py-6 overflow-y-auto">
              {/* Tabs */}
              <div className="bg-muted/60 rounded-2xl p-1 flex mb-5">
                {(["login", "register"] as Mode[]).map((m) => (
                  <button key={m} onClick={() => { setMode(m); setError(""); setShowPw(false); setShowConfirmPw(false); }}
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
                      {/* Full Name */}
                      <div className="relative">
                        <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input type="text" required value={form.name} onChange={set("name")}
                          placeholder="Full Name *" autoComplete="name" className={inputCls} />
                      </div>

                      {/* Country */}
                      <div className="relative">
                        <Globe size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10" />
                        <select value={form.countryCode} onChange={set("countryCode")} className={selectCls} required>
                          {COUNTRIES.map(c => (
                            <option key={c.code} value={c.code}>
                              {c.flag} {c.name} ({c.dial})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Phone with dial code */}
                      <div className="flex border border-border rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-all bg-white">
                        <div className="flex items-center gap-1 px-3 bg-muted/40 border-r border-border shrink-0 text-sm font-medium text-foreground/70 select-none">
                          <span>{selectedCountry.flag}</span>
                          <span>{selectedCountry.dial}</span>
                        </div>
                        <input
                          type="tel" required value={form.phone} onChange={set("phone")}
                          placeholder="Phone Number *" autoComplete="tel"
                          className="flex-1 px-3 py-3 bg-white text-sm focus:outline-none"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Email */}
                <div className="relative">
                  <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="email" required value={form.email} onChange={set("email")}
                    placeholder="Email Address *" autoComplete="email" className={inputCls} />
                </div>

                {/* Password */}
                <div className="relative">
                  <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type={showPw ? "text" : "password"} required value={form.password} onChange={set("password")}
                    placeholder={mode === "register" ? "Password (min 6 chars) *" : "Your password"}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    className={`${inputCls} pr-10`}
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>

                {/* Confirm Password — register only */}
                <AnimatePresence initial={false}>
                  {mode === "register" && (
                    <motion.div key="confirm-pw"
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="relative">
                        <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input type={showConfirmPw ? "text" : "password"} required value={form.confirmPassword} onChange={set("confirmPassword")}
                          placeholder="Confirm Password *" autoComplete="new-password"
                          className={`${inputCls} pr-10`}
                        />
                        <button type="button" onClick={() => setShowConfirmPw(v => !v)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showConfirmPw ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

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
