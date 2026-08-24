import React, { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Leaf, Mail, Lock, Eye, EyeOff, User, ArrowRight, Sparkles, Globe, CheckCircle2, KeyRound } from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";
import { patientApi } from "@/lib/patient-api";
import { COUNTRIES, normalizePatientEmail, validatePatientPhone } from "@workspace/patient-contact";

type Mode = "login" | "register" | "forgot" | "reset";

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

export default function PortalLogin() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const nextUrl = params.get("next") || "/portal/dashboard";

  const resetToken = params.get("reset_token");

  const [mode, setMode] = useState<Mode>(resetToken ? "reset" : "login");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [agreeDisclaimer, setAgreeDisclaimer] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  const selectedCountry = COUNTRIES.find(c => c.code === form.countryCode) ?? COUNTRIES[0];

  useEffect(() => {
    if (!resetToken) {
      patientApi.me().then(() => navigate(nextUrl)).catch(() => {});
    }
    detectCountryCode().then(code => {
      const match = COUNTRIES.find(c => c.code === code);
      if (match) setForm(f => ({ ...f, countryCode: match.code }));
    });
  }, []);

  useEffect(() => {
    const err = params.get("error");
    if (err === "expired_token") setError("This verification link has expired. Please sign in and request a new one.");
    else if (err === "invalid_token") setError("This verification link is invalid.");
  }, [search]);

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail.trim()) { setError("Please enter your email address."); return; }
    setLoading(true); setError("");
    try {
      await patientApi.forgotPassword(forgotEmail.trim());
      setSuccess("If an account exists for that email, a reset link has been sent. Please check your inbox.");
    } catch {
      setSuccess("If an account exists for that email, a reset link has been sent. Please check your inbox.");
    } finally { setLoading(false); }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (newPassword !== confirmNewPassword) { setError("Passwords do not match."); return; }
    setLoading(true); setError("");
    try {
      await patientApi.resetPassword(resetToken!, newPassword);
      navigate(nextUrl);
    } catch (err: any) {
      setError(err?.message || "This reset link is invalid or has expired. Please request a new one.");
    } finally { setLoading(false); }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "register") {
      if (form.password.length < 6) { setError("Password must be at least 6 characters."); return; }
      if (form.password !== form.confirmPassword) { setError("Passwords do not match."); return; }
      if (!agreeDisclaimer) { setError("Please read and accept the Privacy & Medical Data Disclaimer to continue."); return; }
      if (!agreeTerms) { setError("Please accept the Terms & Conditions and Privacy Policy to continue."); return; }

      const normalizedEmail = normalizePatientEmail(form.email);
      if (!normalizedEmail) { setError("Please enter a valid email address."); return; }
      const phoneValidation = validatePatientPhone(form.phone, selectedCountry.code);
      if (!phoneValidation.valid) { setError(phoneValidation.message); return; }

      setLoading(true);
      try {
        await patientApi.register({
          name: form.name.trim(),
          email: normalizedEmail,
          phone: phoneValidation.e164,
          countryCode: selectedCountry.code,
          password: form.password,
        });
        navigate(nextUrl);
      } catch (err: any) {
        setError(err?.message || "Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        await patientApi.login({ email: form.email, password: form.password });
      }
      navigate(nextUrl);
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full pl-9 pr-4 py-3 border border-border rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all";
  const selectCls = "w-full pl-9 pr-4 py-3 border border-border rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all appearance-none";

  return (
    <div className="min-h-screen flex">
      {/* Left panel — desktop only */}
      <div className="hidden lg:flex lg:w-[45%] bg-[#1a3d2b] relative overflow-hidden flex-col items-center justify-center p-14 text-white">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")"
        }} />
        <div className="relative z-10 max-w-md text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-8 border border-white/20">
              <Leaf size={36} className="text-green-300" />
            </div>
            <h2 className="text-3xl font-serif font-bold mb-4">Your Health, Your Journey</h2>
            <p className="text-white/65 text-base leading-relaxed mb-10">
              Access your Ayurvedic care records, track appointments, and stay connected with Dr. P. Murali Krishna's expert guidance.
            </p>
            <div className="grid grid-cols-2 gap-4 text-left">
              {[
                { icon: "📅", title: "Book Appointments", desc: "Choose your preferred date & time" },
                { icon: "📋", title: "Track Visits", desc: "View upcoming & past appointments" },
                { icon: "🔔", title: "Follow-up Alerts", desc: "Never miss a follow-up visit" },
                { icon: "🌿", title: "Holistic Care", desc: "30+ years of Ayurvedic expertise" },
              ].map((f) => (
                <div key={f.title} className="bg-white/10 rounded-2xl p-4 border border-white/10">
                  <div className="text-2xl mb-2">{f.icon}</div>
                  <div className="font-semibold text-sm">{f.title}</div>
                  <div className="text-white/55 text-xs mt-0.5">{f.desc}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col min-h-screen bg-gradient-to-br from-white via-green-50/20 to-white">
        <div className="lg:hidden bg-[#1a3d2b] py-4 px-5 flex items-center gap-2.5">
          <Leaf size={18} className="text-green-300" />
          <span className="text-white font-semibold text-sm">Patient Portal</span>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-[420px]">
            <div className="text-center mb-7">
              <img src={logoImg} alt="Susruta Hospital" className="h-10 w-auto object-contain mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Patient Portal</p>
            </div>

            <AnimatePresence mode="wait">
              <motion.div key="form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                {/* Tab switcher — hidden in forgot/reset modes */}
                {(mode === "login" || mode === "register") && (
                  <div className="bg-muted/60 rounded-2xl p-1 flex mb-6">
                    {(["login", "register"] as Mode[]).map((m) => (
                      <button key={m} onClick={() => { setMode(m); setError(""); setSuccess(""); setShowPw(false); setShowConfirmPw(false); }}
                        className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${mode === m ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {m === "login" ? "Sign In" : "Create Account"}
                      </button>
                    ))}
                  </div>
                )}

                {/* Forgot/Reset header */}
                {(mode === "forgot" || mode === "reset") && (
                  <div className="mb-6">
                    <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                      <KeyRound size={20} className="text-primary" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground">
                      {mode === "forgot" ? "Forgot your password?" : "Set a new password"}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {mode === "forgot"
                        ? "Enter your registered email and we'll send you a reset link."
                        : "Choose a strong password for your account."}
                    </p>
                  </div>
                )}

                {error && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                    {error}
                  </motion.div>
                )}

                {success && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
                    <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                    <span>{success}</span>
                  </motion.div>
                )}

                {/* ── Forgot password form ── */}
                {mode === "forgot" && !success && (
                  <form onSubmit={submitForgot} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground/80 mb-1.5">Email Address *</label>
                      <div className="relative">
                        <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input type="email" required value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                          placeholder="you@example.com" autoComplete="email" className={inputCls} />
                      </div>
                    </div>
                    <button type="submit" disabled={loading}
                      className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-60 transition-all shadow-sm shadow-primary/20">
                      {loading ? "Sending..." : "Send Reset Link"}
                      {!loading && <ArrowRight size={15} />}
                    </button>
                    <button type="button" onClick={() => { setMode("login"); setError(""); setSuccess(""); }}
                      className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors">
                      ← Back to Sign In
                    </button>
                  </form>
                )}

                {mode === "forgot" && success && (
                  <button onClick={() => { setMode("login"); setSuccess(""); setForgotEmail(""); }}
                    className="w-full py-3 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted/40 transition-all">
                    ← Back to Sign In
                  </button>
                )}

                {/* ── Reset password form ── */}
                {mode === "reset" && (
                  <form onSubmit={submitReset} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground/80 mb-1.5">New Password *</label>
                      <div className="relative">
                        <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input type={showPw ? "text" : "password"} required value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="At least 6 characters" autoComplete="new-password"
                          className={`${inputCls} pr-10`} />
                        <button type="button" onClick={() => setShowPw(v => !v)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                          {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground/80 mb-1.5">Confirm Password *</label>
                      <div className="relative">
                        <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input type={showConfirmPw ? "text" : "password"} required value={confirmNewPassword}
                          onChange={e => setConfirmNewPassword(e.target.value)}
                          placeholder="Re-enter your new password" autoComplete="new-password"
                          className={`${inputCls} pr-10`} />
                        <button type="button" onClick={() => setShowConfirmPw(v => !v)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                          {showConfirmPw ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                    <button type="submit" disabled={loading}
                      className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-60 transition-all shadow-sm shadow-primary/20">
                      {loading ? "Updating..." : "Set New Password"}
                      {!loading && <ArrowRight size={15} />}
                    </button>
                  </form>
                )}

                {/* ── Main login / register form ── */}
                {(mode === "login" || mode === "register") && (
                <form onSubmit={submit} className="space-y-4">
                  <AnimatePresence initial={false}>
                    {mode === "register" && (
                      <motion.div key="reg"
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                        className="space-y-4 overflow-hidden"
                      >
                        {/* Full Name */}
                        <div>
                          <label className="block text-sm font-medium text-foreground/80 mb-1.5">Full Name *</label>
                          <div className="relative">
                            <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input type="text" required value={form.name} onChange={set("name")}
                              placeholder="Your full name" autoComplete="name" className={inputCls} />
                          </div>
                        </div>

                        {/* Country */}
                        <div>
                          <label className="block text-sm font-medium text-foreground/80 mb-1.5">Country *</label>
                          <div className="relative">
                            <Globe size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10" />
                            <select value={form.countryCode} onChange={set("countryCode")} className={selectCls} required>
                              {COUNTRIES.map(c => (
                                <option key={c.code} value={c.code}>
                                  {c.flag} {c.name} ({c.dial})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Phone with dial code */}
                        <div>
                          <label className="block text-sm font-medium text-foreground/80 mb-1.5">Phone Number *</label>
                          <div className="flex border border-border rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-all bg-white">
                            <div className="flex items-center gap-1.5 px-3 bg-muted/40 border-r border-border shrink-0 text-sm font-medium text-foreground/70 select-none">
                              <span>{selectedCountry.flag}</span>
                              <span>{selectedCountry.dial}</span>
                            </div>
                            <input
                              type="tel" required value={form.phone} onChange={set("phone")}
                               placeholder={`e.g. ${selectedCountry.localFormat}`}
                               autoComplete="tel" inputMode="tel"
                              className="flex-1 px-3 py-3 bg-white text-sm focus:outline-none"
                            />
                          </div>
                           <p className="mt-1.5 text-xs text-muted-foreground">
                             Enter {selectedCountry.localFormat} after {selectedCountry.dial}.
                           </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-1.5">Email Address *</label>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input type="email" required value={form.email} onChange={set("email")}
                        placeholder="you@example.com" autoComplete="email" className={inputCls} />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-1.5">Password *</label>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type={showPw ? "text" : "password"} required value={form.password} onChange={set("password")}
                        placeholder={mode === "register" ? "Create a password (min 6 chars)" : "Your password"}
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        className={`${inputCls} pr-10`}
                      />
                      <button type="button" onClick={() => setShowPw(v => !v)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password — register only */}
                  <AnimatePresence initial={false}>
                    {mode === "register" && (
                      <motion.div key="confirm-pw"
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div>
                          <label className="block text-sm font-medium text-foreground/80 mb-1.5">Confirm Password *</label>
                          <div className="relative">
                            <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                              type={showConfirmPw ? "text" : "password"} required value={form.confirmPassword} onChange={set("confirmPassword")}
                              placeholder="Re-enter your password"
                              autoComplete="new-password"
                              className={`${inputCls} pr-10`}
                            />
                            <button type="button" onClick={() => setShowConfirmPw(v => !v)}
                              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {showConfirmPw ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Consent checkboxes — register only */}
                  <AnimatePresence initial={false}>
                    {mode === "register" && (
                      <motion.div key="consent"
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden space-y-3"
                      >
                        {/* Medical Disclaimer */}
                        <label className="flex items-start gap-3 cursor-pointer group">
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

                        {/* Terms & Privacy Policy */}
                        <label className="flex items-start gap-3 cursor-pointer group">
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

                  {/* Forgot password link — login mode only */}
                  {mode === "login" && (
                    <div className="text-right -mt-1">
                      <button type="button"
                        onClick={() => { setMode("forgot"); setError(""); setSuccess(""); setForgotEmail(form.email); }}
                        className="text-xs text-primary/80 hover:text-primary font-medium underline underline-offset-2 transition-colors">
                        Forgot password?
                      </button>
                    </div>
                  )}

                  <button type="submit" disabled={loading}
                    className="w-full bg-primary text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-60 shadow-lg shadow-primary/20"
                  >
                    {loading
                      ? <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <><span>{mode === "login" ? "Sign In to Portal" : "Create Account"}</span><ArrowRight size={15} /></>
                    }
                  </button>
                </form>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="mt-6 text-center">
              <a href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5">
                <Sparkles size={13} /> Back to Susruta Hospital Website
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
