import React, { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Leaf, Mail, Lock, Eye, EyeOff, User, Phone, ArrowRight, Sparkles } from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";
import { patientApi } from "@/lib/patient-api";

type Mode = "login" | "register";

export default function PortalLogin() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const nextUrl = params.get("next") || "/portal/dashboard";

  const [mode, setMode] = useState<Mode>("login");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });

  useEffect(() => {
    patientApi.me().then(() => navigate(nextUrl)).catch(() => {});
  }, []);

  useEffect(() => {
    const err = params.get("error");
    if (err === "expired_token") setError("This verification link has expired. Please sign in and request a new one.");
    else if (err === "invalid_token") setError("This verification link is invalid.");
  }, [search]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

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
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full pl-9 pr-4 py-3 border border-border rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all";

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
          <div className="w-full max-w-[400px]">
            <div className="text-center mb-7">
              <img src={logoImg} alt="Susruta Hospital" className="h-10 w-auto object-contain mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Patient Portal</p>
            </div>

            <AnimatePresence mode="wait">
              <motion.div key="form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                {/* Tab switcher */}
                <div className="bg-muted/60 rounded-2xl p-1 flex mb-6">
                  {(["login", "register"] as Mode[]).map((m) => (
                    <button key={m} onClick={() => { setMode(m); setError(""); setShowPw(false); }}
                      className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${mode === m ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {m === "login" ? "Sign In" : "Create Account"}
                    </button>
                  ))}
                </div>

                {error && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                    {error}
                  </motion.div>
                )}

                <form onSubmit={submit} className="space-y-4">
                  <AnimatePresence initial={false}>
                    {mode === "register" && (
                      <motion.div key="reg"
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                        className="space-y-4 overflow-hidden"
                      >
                        <div>
                          <label className="block text-sm font-medium text-foreground/80 mb-1.5">Full Name *</label>
                          <div className="relative">
                            <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input type="text" required value={form.name} onChange={set("name")}
                              placeholder="Your full name" autoComplete="name" className={inputCls} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-foreground/80 mb-1.5">Phone Number</label>
                          <div className="relative">
                            <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input type="tel" value={form.phone} onChange={set("phone")}
                              placeholder="+91 9876543210 (optional)" autoComplete="tel" className={inputCls} />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-1.5">Email Address *</label>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input type="email" required value={form.email} onChange={set("email")}
                        placeholder="you@example.com" autoComplete="email" className={inputCls} />
                    </div>
                  </div>

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

                  <button type="submit" disabled={loading}
                    className="w-full bg-primary text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-60 shadow-lg shadow-primary/20"
                  >
                    {loading
                      ? <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <><span>{mode === "login" ? "Sign In to Portal" : "Create Account"}</span><ArrowRight size={15} /></>
                    }
                  </button>
                </form>
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
