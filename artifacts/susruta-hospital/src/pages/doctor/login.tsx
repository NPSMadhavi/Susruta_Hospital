import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Stethoscope, Lock, Eye, EyeOff, ArrowRight, RotateCcw } from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function doctorFetch(path: string, opts: RequestInit = {}) {
  const r = await fetch(`${BASE}/api/doctor${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw data;
  return data;
}

export default function DoctorLogin() {
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    doctorFetch("/me").then(() => navigate("/doctor/appointments")).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await doctorFetch("/login", { method: "POST", body: JSON.stringify({ password }) });
      navigate("/doctor/appointments");
    } catch (err: any) {
      if (err?.error === "not_configured") {
        setError("Doctor portal is not yet configured. Please ask the admin to set the doctor password in Settings.");
      } else if (err?.error === "invalid_password") {
        setError("Incorrect password. Please try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full h-[46px] py-0 border border-[#dce4ef] rounded-[12px] bg-white text-[14px] outline-none focus:border-[#93a5bf] focus:shadow-[0_0_0_3px_#93a5bf26] pl-11 pr-10 placeholder:text-[#93a5bf]";

  return (
    <div className="min-h-svh font-['DM_Sans',sans-serif] flex bg-white text-[#2d3d59]">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap" />
      <aside className="w-[48.611111%] shrink-0 flex items-center justify-center p-16 bg-cover bg-center text-white max-[1199px]:py-10 max-[1199px]:px-7 max-[1023px]:hidden" style={{ backgroundImage: `url(${BASE}/images/doctor-login-bg.png)` }}>
        <div className="w-full max-w-[572px] text-center -translate-y-[25px]">
          <div className="size-20 mx-auto mb-6 border border-[#2d846780] rounded-full flex items-center justify-center bg-[#3c796140] text-[#3de084]"><Stethoscope size={34} /></div>
          <div className="w-fit mx-auto mb-[18px] flex items-center justify-center gap-2.5 h-[31px] px-4 border border-[#177654] rounded-full bg-[#063b2cc9] text-[#8ce5c8] font-['DM_Serif_Display',Georgia,serif] text-[11px] tracking-[.25px] shadow-[0_4px_8px_#0002]"><span className="size-2 rounded-full bg-[#2dd4a0]" /> SUSRUTA HOSPITAL <span className="text-[#759e89]">•</span> DOCTOR PORTAL</div>
          <h2 className="font-['DM_Serif_Display',Georgia,serif] text-[48px] font-normal leading-[55px] tracking-[-1.5px] mb-2">Doctor Portal</h2>
          <p className="text-[#accbbb] text-base leading-6 mb-[34px]">View your online consultation appointments, review patient<br className="max-[1199px]:hidden" /> documents, and issue prescriptions from one place.</p>
          <div className="grid grid-cols-2 gap-3.5 text-left">
            {[
              { icon: "📋", title: "Patient Documents", desc: "Review uploaded reports & records before each consult" },
              { icon: "💊", title: "Issue Prescriptions", desc: "Add medicines with dosage instructions for each patient" },
              { icon: "📝", title: "Private Notes", desc: "Keep internal notes visible only to you" },
              { icon: "📅", title: "Slot Schedule", desc: "See all your booked Sunday consultation slots" },
            ].map((f, index) => (
              <div key={f.title} className="flex items-start gap-3.5 p-4 border border-[#ffffff14] rounded-[17px] bg-[#173b2cb3] max-[1199px]:gap-2.5 max-[1199px]:p-3.5">
                <div className={`shrink-0 size-10 flex items-center justify-center border rounded-[12px] text-[21px] ${index < 2 ? "bg-[#ac994026] border-[#b2a14b59]" : "bg-[#527fbc26] border-[#527fbc59]"}`} aria-hidden="true">{f.icon}</div>
                <div><h3 className="m-0 mb-1 font-['DM_Sans',sans-serif] text-[14px] leading-5 font-semibold tracking-[.25px]">{f.title}</h3><p className="max-w-[155px] text-[12px] leading-5 text-[#f0f4f1]">{f.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="hidden max-[1023px]:flex items-center gap-2.5 py-[18px] px-6 bg-[#1a3d2b] text-white text-[14px]"><Stethoscope size={18} /> Doctor Portal</div>
        <div className="flex-1 flex items-center justify-center p-12 max-[1023px]:py-8 max-[1023px]:px-6">
          <div className="w-full max-w-[532px]">
            <div className="text-center mb-10">
              <img src={logoImg} alt="Susruta Hospital" className="block w-full h-[60px] object-contain mx-auto mb-2" />
              <h1 className="font-['DM_Sans',sans-serif] text-[#647897] text-[14px] font-normal leading-5 tracking-normal">Doctor Portal</h1>
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="mb-5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                {error}
              </motion.div>
            )}

            <form onSubmit={submit} >
              <div>
                <label className="block mb-[7px] text-[14px] leading-5 font-normal" htmlFor="doctor-password">Portal Password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#93a5bf]" />
                  <input
                    id="doctor-password"
                    type={showPw ? "text" : "password"}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your portal password"
                    autoComplete="current-password"
                    className={inputCls}
                  />
                  <button type="button" aria-label={showPw ? "Hide password" : "Show password"} onClick={() => setShowPw(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#93a5bf] hover:text-foreground transition-colors">
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="w-full h-[49px] flex items-center justify-center gap-2 rounded-[12px] bg-[#da592b] text-white text-[14px] font-semibold cursor-pointer transition-[background] duration-200 hover:bg-[#c84d23] disabled:opacity-60 disabled:cursor-wait focus-visible:outline-[3px] focus-visible:outline-[#93a5bf] focus-visible:outline-offset-[3px] mt-6">
                {loading
                  ? <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <><span>Sign In to Portal</span><ArrowRight size={15} /></>
                }
              </button>
            </form>

            <div className="mt-8 text-center text-[#647897] text-[14px] leading-[22px]">
              <a href="/" className="inline-flex items-center gap-1.5 hover:text-[#da592b]">
                <RotateCcw size={13} /> Back to Susruta Hospital
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}