import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bell, CheckCircle2, Leaf, AlertCircle, ChevronDown, Search } from "lucide-react";

const STORAGE_KEY = "susruta_popup_dismissed";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Country list with flag emojis ────────────────────────────
const COUNTRIES = [
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "AE", name: "UAE", flag: "🇦🇪" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "QA", name: "Qatar", flag: "🇶🇦" },
  { code: "KW", name: "Kuwait", flag: "🇰🇼" },
  { code: "BH", name: "Bahrain", flag: "🇧🇭" },
  { code: "OM", name: "Oman", flag: "🇴🇲" },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "SE", name: "Sweden", flag: "🇸🇪" },
  { code: "NO", name: "Norway", flag: "🇳🇴" },
  { code: "DK", name: "Denmark", flag: "🇩🇰" },
  { code: "FI", name: "Finland", flag: "🇫🇮" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭" },
  { code: "AT", name: "Austria", flag: "🇦🇹" },
  { code: "BE", name: "Belgium", flag: "🇧🇪" },
  { code: "PT", name: "Portugal", flag: "🇵🇹" },
  { code: "IE", name: "Ireland", flag: "🇮🇪" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" },
  { code: "CN", name: "China", flag: "🇨🇳" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾" },
  { code: "LK", name: "Sri Lanka", flag: "🇱🇰" },
  { code: "NP", name: "Nepal", flag: "🇳🇵" },
  { code: "BD", name: "Bangladesh", flag: "🇧🇩" },
  { code: "PK", name: "Pakistan", flag: "🇵🇰" },
  { code: "MV", name: "Maldives", flag: "🇲🇻" },
  { code: "BT", name: "Bhutan", flag: "🇧🇹" },
  { code: "MM", name: "Myanmar", flag: "🇲🇲" },
  { code: "TH", name: "Thailand", flag: "🇹🇭" },
  { code: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩" },
  { code: "VN", name: "Vietnam", flag: "🇻🇳" },
  { code: "KE", name: "Kenya", flag: "🇰🇪" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬" },
  { code: "GH", name: "Ghana", flag: "🇬🇭" },
  { code: "EG", name: "Egypt", flag: "🇪🇬" },
  { code: "MU", name: "Mauritius", flag: "🇲🇺" },
  { code: "TZ", name: "Tanzania", flag: "🇹🇿" },
  { code: "UG", name: "Uganda", flag: "🇺🇬" },
  { code: "ZW", name: "Zimbabwe", flag: "🇿🇼" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "MX", name: "Mexico", flag: "🇲🇽" },
  { code: "AR", name: "Argentina", flag: "🇦🇷" },
  { code: "CO", name: "Colombia", flag: "🇨🇴" },
  { code: "RU", name: "Russia", flag: "🇷🇺" },
  { code: "TR", name: "Turkey", flag: "🇹🇷" },
  { code: "IL", name: "Israel", flag: "🇮🇱" },
  { code: "JO", name: "Jordan", flag: "🇯🇴" },
  { code: "LB", name: "Lebanon", flag: "🇱🇧" },
  { code: "IQ", name: "Iraq", flag: "🇮🇶" },
  { code: "HK", name: "Hong Kong", flag: "🇭🇰" },
  { code: "MO", name: "Macau", flag: "🇲🇴" },
  { code: "TW", name: "Taiwan", flag: "🇹🇼" },
  { code: "Other", name: "Other", flag: "🌍" },
];

// ── Searchable Country Dropdown ───────────────────────────────
function CountryDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dropRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = COUNTRIES.find((c) => c.name === value);
  const filtered = query.trim()
    ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : COUNTRIES;

  useEffect(() => {
    if (!open) { setQuery(""); return; }
    setTimeout(() => searchRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  function pick(name: string) {
    onChange(name);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={dropRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 border border-border rounded-xl text-sm bg-white text-left focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/25 focus:border-[#1a3d2b] transition-all"
      >
        <span className="text-base leading-none">{selected?.flag ?? "🌍"}</span>
        <span className={`flex-1 ${value ? "text-foreground" : "text-muted-foreground/50"}`}>
          {value || "Select your country"}
        </span>
        <ChevronDown size={14} className={`text-muted-foreground transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scaleY: 0.95 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -4, scaleY: 0.97 }}
            transition={{ duration: 0.13 }}
            style={{ transformOrigin: "top" }}
            className="absolute z-[1100] left-0 right-0 top-full mt-1.5 bg-white border border-border rounded-2xl shadow-xl overflow-hidden"
          >
            {/* Search bar */}
            <div className="p-2 border-b border-border/60">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search country…"
                  className="w-full pl-7 pr-3 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1a3d2b]/30 bg-muted/40"
                />
              </div>
            </div>

            {/* List */}
            <ul className="max-h-44 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-4 py-3 text-xs text-muted-foreground text-center">No countries found</li>
              ) : (
                filtered.map((c) => (
                  <li key={c.code}>
                    <button
                      type="button"
                      onClick={() => pick(c.name)}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left hover:bg-primary/5 transition-colors ${value === c.name ? "bg-primary/8 font-semibold text-primary" : "text-foreground"}`}
                    >
                      <span className="text-base leading-none">{c.flag}</span>
                      <span>{c.name}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Popup ────────────────────────────────────────────────
export function SubscribePopup() {
  const [visible, setVisible] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", country: "India" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
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
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismiss}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[999]"
          />

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

                    <CountryDropdown
                      value={form.country}
                      onChange={(v) => setForm((f) => ({ ...f, country: v }))}
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
