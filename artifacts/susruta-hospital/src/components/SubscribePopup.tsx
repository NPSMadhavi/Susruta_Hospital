import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bell, CheckCircle2, Leaf, AlertCircle } from "lucide-react";

const STORAGE_KEY = "susruta_popup_dismissed";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function SubscribePopup() {
  const [visible, setVisible] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Show after 2.5 seconds, only once per browser session
    if (sessionStorage.getItem(STORAGE_KEY)) return;
    const t = setTimeout(() => setVisible(true), 2500);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    sessionStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok && !data.already_subscribed) {
        throw new Error(data.message || "Something went wrong. Please try again.");
      }
      setSuccess(true);
      sessionStorage.setItem(STORAGE_KEY, "1");
      setTimeout(() => setVisible(false), 3500);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/25 focus:border-[#1a3d2b] transition-all bg-white placeholder:text-muted-foreground/50";

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismiss}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[999]"
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="bg-[#1a3d2b] px-6 pt-6 pb-5 relative">
                <button
                  onClick={dismiss}
                  className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                >
                  <X size={18} />
                </button>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                    <Bell size={18} className="text-[#D4AF37]" />
                  </div>
                  <div>
                    <p className="text-[#D4AF37] text-xs font-semibold tracking-wider uppercase">Coming Soon</p>
                    <h2 className="text-white font-serif font-bold text-lg leading-snug">
                      Online Services Launching Soon!
                    </h2>
                  </div>
                </div>
                <p className="text-white/70 text-sm leading-relaxed">
                  Our online appointment booking, patient portal, and other digital healthcare services are on their way. Subscribe now and be the first to know the moment they go live.
                </p>
              </div>

              {/* Body */}
              <div className="px-6 py-5">
                {success ? (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center py-4"
                  >
                    <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 size={28} className="text-green-600" />
                    </div>
                    <h3 className="font-serif font-bold text-foreground text-lg mb-1">You're on the list!</h3>
                    <p className="text-muted-foreground text-sm">
                      Thank you for subscribing. We'll send you an update as soon as our services are ready. 🙏
                    </p>
                  </motion.div>
                ) : (
                  <form onSubmit={submit} className="space-y-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Leaf size={12} className="text-[#1a3d2b]" />
                      Stay connected with Susruta Hospital
                    </div>

                    <input
                      required
                      type="text"
                      placeholder="Your full name"
                      value={form.name}
                      onChange={set("name")}
                      className={inputCls}
                    />
                    <input
                      required
                      type="tel"
                      placeholder="Phone number"
                      value={form.phone}
                      onChange={set("phone")}
                      className={inputCls}
                    />
                    <input
                      required
                      type="email"
                      placeholder="Email address"
                      value={form.email}
                      onChange={set("email")}
                      className={inputCls}
                    />

                    {error && (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-700">
                        <AlertCircle size={14} className="flex-shrink-0" /> {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-[#1a3d2b] text-white font-bold py-3 rounded-2xl hover:bg-[#1a3d2b]/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
                    >
                      {loading ? (
                        <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Subscribing…</>
                      ) : (
                        <><Bell size={15} /> Notify Me When Live</>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={dismiss}
                      className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                    >
                      No thanks, I'll check back later
                    </button>
                  </form>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
