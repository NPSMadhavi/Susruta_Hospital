import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Leaf, Mail, Lock, Eye, EyeOff, User, Phone, ArrowRight, Globe, KeyRound, CheckCircle2 } from "lucide-react";
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
}

type Mode = "login" | "register" | "forgot";

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

async function detectCountryCode(): Promise<string> {
  try {
    const res = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data.country_code ?? "IN";
  } catch {
    return "IN";
  }
}

export function BookingLoginModal({ open, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [forgotEmail, setForgotEmail] = useState("");
  const [agreeDisclaimer, setAgreeDisclaimer] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    detectCountryCode().then(code => {
      const match = COUNTRIES.find(c => c.code === code);
      if (match) setForm(f => ({ ...f, countryCode: match.code }));
    });
  }, []);

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
        setError(""); setSuccess(""); setShowPw(false); setShowConfirmPw(false);
        setForm(defaultForm); setForgotEmail("");
        setMode("login");
        setAgreeDisclaimer(false);
        setAgreeTerms(false);
      }, 300);
    }
  }, [open]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail.trim()) { setError("Please enter your email address."); return; }
    setLoading(true); setError("");
    try {
      await apiPost("/auth/forgot-password", { email: forgotEmail.trim() });
    } catch {
      // Always show success to avoid email enumeration
    } finally {
      setSuccess("If an account exists for that email, a reset link has been sent. Please check your inbox.");
      setLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "register") {
      if (form.password.length < 6) { setError("Password must be at least 6 characters."); return; }
      if (form.password !== form.confirmPassword) { setError("Passwords do not match."); return; }
      if (!agreeDisclaimer) { setError("Please read and accept the Privacy & Medical Data Disclaimer."); return; }
      if (!agreeTerms) { setError("Please accept the Terms & Conditions and Privacy Policy."); return; }
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
                {mode === "forgot"
                  ? <KeyRound size={22} className="text-green-300" />
                  : <Leaf size={22} className="text-green-300" />
                }
              </div>
              <h2 className="text-lg font-serif font-bold mb-0.5">
                {mode === "forgot" ? "Reset Your Password" : "Book Your Appointment"}
              </h2>
              <p className="text-white/60 text-xs">
                {mode === "forgot"
                  ? "We'll email you a link to reset your password"
                  : "Sign in to track your bookings and get reminders"}
              </p>
            </div>

            {/* Form body */}
            <div className="px-8 py-6 overflow-y-auto">

              {/* ── Forgot password view ── */}
              <AnimatePresence mode="wait">
                {mode === "forgot" && (
                  <motion.div key="forgot"
                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    {error && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                        {error}
                      </motion.div>
                    )}

                    {success ? (
                      <div className="space-y-4">
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-4 flex items-start gap-3">
                          <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                          <span>{success}</span>
                        </div>
                        <button
                          onClick={() => { setMode("login"); setSuccess(""); setForgotEmail(""); setError(""); }}
                          className="w-full py-3 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted/40 transition-all"
                        >
                          ← Back to Sign In
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={submitForgot} className="space-y-4">
                        <div className="relative">
                          <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <input
                            type="email" required value={forgotEmail}
                            onChange={e => setForgotEmail(e.target.value)}
                            placeholder="Your registered email address"
                            autoComplete="email" className={inputCls}
                          />
                        </div>
                        <button type="submit" disabled={loading}
                          className="w-full bg-primary text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-60 shadow-lg shadow-primary/20"
                        >
                          {loading
                            ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            : <><span>Send Reset Link</span><ArrowRight size={14} /></>
                          }
                        </button>
                        <button type="button"
                          onClick={() => { setMode("login"); setError(""); setForgotEmail(""); }}
                          className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                        >
                          ← Back to Sign In
                        </button>
                      </form>
                    )}
                  </motion.div>
                )}

                {/* ── Login / Register view ── */}
                {(mode === "login" || mode === "register") && (
                  <motion.div key="main"
                    initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                  >
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

                      {/* Forgot password link — login mode only */}
                      {mode === "login" && (
                        <div className="flex justify-end -mt-1">
                          <button type="button"
                            onClick={() => { setMode("forgot"); setError(""); setForgotEmail(form.email); }}
                            className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                          >
                            Forgot password?
                          </button>
                        </div>
                      )}

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

                      {/* Consent checkboxes — register only */}
                      <AnimatePresence initial={false}>
                        {mode === "register" && (
                          <motion.div key="consent"
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden space-y-2.5"
                          >
                            <label className="flex items-start gap-3 cursor-pointer">
                              <div className="mt-0.5 shrink-0">
                                <input
                                  type="checkbox"
                                  checked={agreeDisclaimer}
                                  onChange={e => setAgreeDisclaimer(e.target.checked)}
                                  className="w-4 h-4 rounded border-gray-300 accent-[#1a3d2b] cursor-pointer"
                                />
                              </div>
                              <span className="text-xs text-gray-600 leading-relaxed">
                                I have read and agree to the{" "}
                                <a href="/medical-disclaimer" target="_blank" rel="noopener noreferrer"
                                  className="text-[#1a3d2b] font-semibold underline underline-offset-2 hover:text-[#1a3d2b]/80"
                                  onClick={e => e.stopPropagation()}>
                                  Privacy & Medical Data Disclaimer
                                </a>
                              </span>
                            </label>

                            <label className="flex items-start gap-3 cursor-pointer">
                              <div className="mt-0.5 shrink-0">
                                <input
                                  type="checkbox"
                                  checked={agreeTerms}
                                  onChange={e => setAgreeTerms(e.target.checked)}
                                  className="w-4 h-4 rounded border-gray-300 accent-[#1a3d2b] cursor-pointer"
                                />
                              </div>
                              <span className="text-xs text-gray-600 leading-relaxed">
                                I agree to the{" "}
                                <a href="/terms" target="_blank" rel="noopener noreferrer"
                                  className="text-[#1a3d2b] font-semibold underline underline-offset-2 hover:text-[#1a3d2b]/80"
                                  onClick={e => e.stopPropagation()}>
                                  Terms & Conditions
                                </a>
                                {" "}and{" "}
                                <a href="/privacy-policy" target="_blank" rel="noopener noreferrer"
                                  className="text-[#1a3d2b] font-semibold underline underline-offset-2 hover:text-[#1a3d2b]/80"
                                  onClick={e => e.stopPropagation()}>
                                  Privacy Policy
                                </a>
                              </span>
                            </label>
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
