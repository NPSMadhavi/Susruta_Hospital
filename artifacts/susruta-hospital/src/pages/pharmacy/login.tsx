import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Pill, Lock, Eye, EyeOff, ArrowRight, Leaf } from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function pharmaFetch(path: string, opts: RequestInit = {}) {
  const r = await fetch(`${BASE}/api/pharmacy${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw data;
  return data;
}

export default function PharmacyLogin() {
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    pharmaFetch("/me").then(() => navigate("/pharmacy/orders")).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await pharmaFetch("/login", { method: "POST", body: JSON.stringify({ password }) });
      navigate("/pharmacy/orders");
    } catch (err: any) {
      if (err?.error === "not_configured") {
        setError("Pharmacy portal is not yet configured. Please ask the admin to set the pharmacy password in Settings.");
      } else if (err?.error === "invalid_password") {
        setError("Incorrect password. Please try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full pl-9 pr-10 py-3 border border-border rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all";

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[45%] bg-[#1a3d2b] relative overflow-hidden flex-col items-center justify-center p-14 text-white">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")"
        }} />
        <div className="relative z-10 max-w-md text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-8 border border-white/20">
              <Pill size={42} className="text-green-300" />
            </div>
            <h2 className="text-3xl font-serif font-bold mb-4">Pharmacy Portal</h2>
            <p className="text-white/65 text-base leading-relaxed mb-10">
              Manage medicine orders from patients, verify availability, confirm payments, and update shipping details.
            </p>
            <div className="grid grid-cols-1 gap-4 text-left">
              {[
                { icon: "💊", title: "Order Management", desc: "Review all incoming medicine orders with real-time notifications" },
                { icon: "✅", title: "Availability Check", desc: "Mark medicine availability and notify patients instantly" },
                { icon: "💳", title: "Payment Tracking", desc: "Confirm PhonePe QR payments and mark orders paid" },
                { icon: "🚚", title: "Shipping Updates", desc: "Add courier tracking numbers to complete deliveries" },
              ].map(f => (
                <div key={f.title} className="bg-white/10 rounded-2xl p-4 border border-white/10 flex items-start gap-3">
                  <div className="text-2xl">{f.icon}</div>
                  <div>
                    <div className="font-semibold text-sm">{f.title}</div>
                    <div className="text-white/55 text-xs mt-0.5">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col min-h-screen bg-gradient-to-br from-white via-green-50/20 to-white">
        <div className="lg:hidden bg-[#1a3d2b] py-4 px-5 flex items-center gap-2.5">
          <Pill size={18} className="text-green-300" />
          <span className="text-white font-semibold text-sm">Pharmacy Portal</span>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-[380px]">
            <div className="text-center mb-8">
              <img src={logoImg} alt="Susruta Hospital" className="h-10 w-auto object-contain mx-auto mb-3" />
              <h1 className="text-xl font-serif font-bold text-foreground">Pharmacy Portal</h1>
              <p className="text-muted-foreground text-sm mt-1">Sign in to manage medicine orders</p>
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="mb-5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                {error}
              </motion.div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1.5">Portal Password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter pharmacy portal password"
                    autoComplete="current-password"
                    className={inputCls}
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="w-full bg-primary text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-60 shadow-lg shadow-primary/20">
                {loading
                  ? <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <><span>Sign In to Pharmacy</span><ArrowRight size={15} /></>
                }
              </button>
            </form>

            <div className="mt-6 text-center">
              <a href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5">
                <Leaf size={13} /> Back to Susruta Hospital
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
