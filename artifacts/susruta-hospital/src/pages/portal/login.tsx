import React, { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Leaf, Mail, Lock, User, Phone, Eye, EyeOff, ArrowRight, Sparkles } from "lucide-react";
import { patientApi } from "@/lib/patient-api";
import logoImg from "@assets/logo_1773840200056.png";

type Mode = "login" | "register";

const GOOGLE_AUTH_BASE = `${import.meta.env.BASE_URL ?? "/"}api/patient/auth/google`.replace(/\/\//g, "/");

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

export default function PortalLogin() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const nextUrl = params.get("next") || "/portal/dashboard";

  const [mode, setMode] = useState<Mode>("login");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });

  useEffect(() => {
    patientApi.me().then(() => navigate(nextUrl)).catch(() => {});
    patientApi.googleStatus().then((s) => setGoogleEnabled(s.enabled)).catch(() => {});
  }, []);

  useEffect(() => {
    const err = params.get("error");
    if (err === "google_denied") setError("Google sign-in was cancelled.");
    else if (err === "google_failed") setError("Google sign-in failed. Please try again or use email.");
    else if (err === "google_not_configured") setError("Google sign-in is not available right now.");
  }, [search]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await patientApi.login({ email: form.email, password: form.password });
      } else {
        await patientApi.register({ name: form.name, email: form.email, phone: form.phone || undefined, password: form.password });
      }
      navigate(nextUrl);
    } catch (err: any) {
      setError(err?.message || (mode === "login" ? "Incorrect email or password" : "Registration failed. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleLogin() {
    setGoogleLoading(true);
    const url = nextUrl !== "/portal/dashboard"
      ? `${GOOGLE_AUTH_BASE}?next=${encodeURIComponent(nextUrl)}`
      : GOOGLE_AUTH_BASE;
    window.location.href = url;
  }

  const fields = mode === "login"
    ? [
        { key: "email", label: "Email Address", type: "email", icon: <Mail size={16} />, placeholder: "you@example.com" },
        { key: "password", label: "Password", type: showPass ? "text" : "password", icon: <Lock size={16} />, placeholder: "Your password", togglePass: true },
      ]
    : [
        { key: "name", label: "Full Name", type: "text", icon: <User size={16} />, placeholder: "Dr. / Mr. / Ms. Your Name" },
        { key: "email", label: "Email Address", type: "email", icon: <Mail size={16} />, placeholder: "you@example.com" },
        { key: "phone", label: "Phone Number", type: "tel", icon: <Phone size={16} />, placeholder: "+91 9876543210 (optional)" },
        { key: "password", label: "Password", type: showPass ? "text" : "password", icon: <Lock size={16} />, placeholder: "Min. 8 characters", togglePass: true },
      ];

  return (
    <div className="min-h-screen flex">
      {/* Left panel — decorative (desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#1a3d2b] relative overflow-hidden flex-col items-center justify-center p-14 text-white">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")"
        }} />
        <div className="relative z-10 max-w-md text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-8 backdrop-blur-sm border border-white/20">
              <Leaf size={36} className="text-green-300" />
            </div>
            <h2 className="text-3xl font-serif font-bold mb-4">Your Health, Your Journey</h2>
            <p className="text-white/70 text-lg leading-relaxed mb-10">
              Access your Ayurvedic care records, track appointments, and stay connected with Dr. P. Murali Krishna's expert guidance.
            </p>
            <div className="grid grid-cols-2 gap-4 text-left">
              {[
                { icon: "📅", title: "Book Appointments", desc: "Choose your preferred date & time" },
                { icon: "📋", title: "Track Visits", desc: "View upcoming & past appointments" },
                { icon: "🔔", title: "Follow-up Alerts", desc: "Never miss a follow-up visit" },
                { icon: "🌿", title: "Holistic Care", desc: "30+ years of Ayurvedic expertise" },
              ].map((f) => (
                <div key={f.title} className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm border border-white/10">
                  <div className="text-2xl mb-2">{f.icon}</div>
                  <div className="font-semibold text-sm">{f.title}</div>
                  <div className="text-white/60 text-xs mt-0.5">{f.desc}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col min-h-screen bg-gradient-to-br from-white via-green-50/30 to-white">
        {/* Mobile header */}
        <div className="lg:hidden bg-[#1a3d2b] py-4 px-5 flex items-center gap-3">
          <Leaf size={20} className="text-green-300" />
          <span className="text-white font-semibold text-sm">Patient Login</span>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            {/* Logo */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
              <img src={logoImg} alt="Susruta Hospital" className="h-10 w-auto object-contain mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Patient Portal</p>
            </motion.div>

            {/* Google Sign-in — only when configured */}
            {googleEnabled && (
              <>
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={googleLoading}
                  className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-border rounded-xl bg-white hover:bg-gray-50 transition-all text-sm font-medium text-foreground/80 shadow-sm hover:shadow mb-5 disabled:opacity-60"
                >
                  {googleLoading ? (
                    <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  ) : (
                    <GoogleIcon />
                  )}
                  Continue with Google
                </button>

                <div className="flex items-center gap-3 mb-5">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground font-medium">or use email</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              </>
            )}

            {/* Tab switcher */}
            <div className="bg-muted/60 rounded-2xl p-1 flex mb-6">
              {(["login", "register"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(""); }}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
                    mode === m ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "login" ? "Sign In" : "Create Account"}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.form
                key={mode}
                initial={{ opacity: 0, x: mode === "login" ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: mode === "login" ? 20 : -20 }}
                transition={{ duration: 0.25 }}
                onSubmit={submit}
                className="space-y-4"
              >
                {error && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                    {error}
                  </motion.div>
                )}

                {fields.map((field) => (
                  <div key={field.key} className="relative">
                    <label className="block text-sm font-medium text-foreground/80 mb-1.5">{field.label}</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">{field.icon}</span>
                      <input
                        type={field.type}
                        placeholder={field.placeholder}
                        value={form[field.key as keyof typeof form]}
                        onChange={set(field.key as keyof typeof form)}
                        required={field.key !== "phone"}
                        autoComplete={field.key === "password" ? (mode === "login" ? "current-password" : "new-password") : field.key === "email" ? "email" : "off"}
                        className="w-full pl-10 pr-10 py-3 border border-border rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                      />
                      {field.togglePass && (
                        <button type="button" onClick={() => setShowPass((s) => !s)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-60 shadow-lg shadow-primary/20 hover:-translate-y-0.5 active:translate-y-0 mt-2"
                >
                  {loading ? (
                    <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      {mode === "login" ? "Sign In to Portal" : "Create My Account"}
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </motion.form>
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
