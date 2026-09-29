import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  Save, Mail, Send, CheckCircle2, AlertCircle, Eye, EyeOff,
  Shield, Globe, Phone, Loader2, Stethoscope, Lock, Pill,
  Upload, QrCode, Video, Hash, Link as LinkIcon, FlaskConical,
  ToggleLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api/admin`;

function apiFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${API}${path}`, { credentials: "include", ...opts });
}

type Settings = {
  testimonialsEnabled: boolean;
  appointmentBookingEnabled: boolean;
  clinicPhone1: string;
  clinicPhone2: string;
  clinicEmail: string;
  clinicAddress: string;
  workingHours: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
  smtpFromName: string;
  smtpFromEmail: string;
  smtpSubscriberFrom: string;
  smtpConfigured: boolean;
  doctorPortalConfigured: boolean;
  pharmacyPortalConfigured: boolean;
  meetingLink: string | null;
  phonepeQrObjectPath: string | null;
  patientIdPrefix: string;
  patientIdCurrentNumber: number;
  currentPatientId: string | null;
  nextPatientId?: string;
};

const inputCls = "w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b] transition-all bg-white";
const labelCls = "block text-sm font-medium text-foreground mb-1.5";

function getNextPrefix(prefix: string): string | null {
  const chars = (prefix || "A").toUpperCase().trim().split("");
  for (let i = chars.length - 1; i >= 0; i--) {
    if (chars[i] < "Z") {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      for (let j = i + 1; j < chars.length; j++) {
        chars[j] = "A";
      }
      return chars.join("");
    }
  }
  if (chars.length < 3) {
    return "A".repeat(chars.length + 1);
  }
  return null;
}

function computeNextPatientId(prefix: string, currentNum: number | string): string {
  const p = (prefix || "A").toUpperCase().trim() || "A";
  const maxNum = p.length === 1 ? 999 : p.length === 2 ? 99 : 9;
  const num = typeof currentNum === "number" ? currentNum : parseInt(String(currentNum || 0), 10) || 0;
  let nextNum = num + 1;
  let nextPrefix: string | null = p;

  if (nextNum > maxNum) {
    nextPrefix = getNextPrefix(p);
    nextNum = 1;
  }

  if (!nextPrefix) {
    return "No next Patient ID";
  }

  const padLength = nextPrefix.length === 1 ? 3 : nextPrefix.length === 2 ? 2 : 1;
  return `${nextPrefix}${nextNum.toString().padStart(padLength, "0")}`;
}

function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer p-3.5 rounded-xl hover:bg-muted/40 transition-colors border border-border">
      <div>
        <div className="font-medium text-sm text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
      <button
        type="button" role="switch" aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none",
          checked ? "bg-emerald-600" : "bg-gray-200"
        )}
      >
        <span className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform",
          checked ? "translate-x-5" : "translate-x-0"
        )} />
      </button>
    </label>
  );
}

function Card({ title, subtitle, icon: Icon, children }: {
  title: string; subtitle: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-center gap-2.5 mb-0.5">
          <Icon size={16} className="text-[#1a3d2b]" />
          <h3 className="font-bold text-base text-foreground">{title}</h3>
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="p-6 space-y-4">{children}</div>
    </div>
  );
}

type TabId = "general" | "consultation" | "email" | "security" | "payments";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "general",      label: "General",         icon: Globe },
  { id: "consultation", label: "Consultations",    icon: Video },
  { id: "email",        label: "Email",            icon: Mail },
  { id: "security",     label: "Security",         icon: Lock },
  { id: "payments",     label: "Payments",         icon: QrCode },
];

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [form, setForm] = useState<Partial<Settings>>({
    testimonialsEnabled: true,
    appointmentBookingEnabled: true,
    clinicPhone1: "", clinicPhone2: "", clinicEmail: "",
    clinicAddress: "", workingHours: "",
    smtpHost: "", smtpPort: 587, smtpUser: "", smtpPass: "",
    smtpSecure: false,
    smtpFromName: "Susruta Hospital",
    smtpFromEmail: "noreply@susrutahospital.com",
    smtpSubscriberFrom: "updates@susrutahospital.com",
  });
  const [loading, setLoading] = useState(true);
  const [showPass, setShowPass] = useState(false);
  const [passChanged, setPassChanged] = useState(false);
  const [doctorPassword, setDoctorPassword] = useState("");
  const [showDoctorPass, setShowDoctorPass] = useState(false);
  const [pharmacyPassword, setPharmacyPassword] = useState("");
  const [showPharmacyPass, setShowPharmacyPass] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    apiFetch("/settings")
      .then(r => r.json())
      .then(d => { setForm(d); setTestTo(d.clinicEmail || ""); })
      .finally(() => setLoading(false));
  }, []);

  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    if (k === "smtpPass") setPassChanged(true);
  };
  const setChecked = (k: keyof Settings) => (v: boolean) => setForm(f => {
    const updates: Partial<Settings> = { [k]: v };
    // Auto-adjust SMTP port when toggling SSL
    if (k === "smtpSecure") {
      updates.smtpPort = v ? 465 : 587;
    }
    return { ...f, ...updates };
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveResult(null);
    try {
      const payload: any = { ...form };
      if (!passChanged) delete payload.smtpPass;
      if (doctorPassword.trim()) payload.doctorPassword = doctorPassword;
      if (pharmacyPassword.trim()) payload.pharmacyPassword = pharmacyPassword;
      if (payload.patientIdCurrentNumber !== undefined) {
        payload.patientIdCurrentNumber = parseInt(String(payload.patientIdCurrentNumber || 0), 10) || 0;
      }
      const res = await apiFetch("/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save.");
      setForm(data);
      setPassChanged(false);
      setDoctorPassword("");
      setPharmacyPassword("");
      setSaveResult({ ok: true, msg: "Settings saved successfully." });
    } catch (err: any) {
      setSaveResult({ ok: false, msg: err.message });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveResult(null), 5000);
    }
  }

  async function sendTestEmail() {
    if (!testTo.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch("/smtp-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: form.smtpHost, port: form.smtpPort, user: form.smtpUser,
          pass: form.smtpPass, secure: form.smtpSecure,
          fromName: form.smtpFromName, fromEmail: form.smtpFromEmail,
          subscriberFrom: form.smtpSubscriberFrom, testTo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Test failed.");
      setTestResult({ ok: true, msg: data.message });
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.message });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 size={22} className="animate-spin mr-2" /> Loading settings…
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Manage clinic preferences and portal configuration.</p>
      </div>

      {/* Tab bar — full width */}
      <div className="flex flex-wrap items-center justify-start gap-1 border-b border-border mb-8">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px",
                active
                  ? "border-[#D95B2F] text-[#D95B2F]"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
              )}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <form onSubmit={save} className="w-full space-y-6">

        {/* ── General Tab ── */}
        {activeTab === "general" && (
          <div className="space-y-5">
            <Card title="Contact Information" subtitle="Phone numbers, email and address shown on the public website." icon={Phone}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Primary Phone</label>
                  <input className={inputCls} value={form.clinicPhone1 || ""} onChange={set("clinicPhone1")} placeholder="+91 98765 43210" />
                </div>
                <div>
                  <label className={labelCls}>Secondary Phone</label>
                  <input className={inputCls} value={form.clinicPhone2 || ""} onChange={set("clinicPhone2")} placeholder="+91 98765 00000" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Clinic Email</label>
                <input type="email" className={inputCls} value={form.clinicEmail || ""} onChange={set("clinicEmail")} placeholder="info@susrutahospital.com" />
              </div>
              <div>
                <label className={labelCls}>Working Hours</label>
                <input className={inputCls} value={form.workingHours || ""} onChange={set("workingHours")} placeholder="Mon–Sat: 10:00 AM – 1:00 PM · 6:00 PM – 10:00 PM" />
              </div>
              <div>
                <label className={labelCls}>Physical Address</label>
                <textarea className={cn(inputCls, "resize-none")} rows={3} value={form.clinicAddress || ""} onChange={set("clinicAddress")} />
              </div>
            </Card>

            <Card title="Website Features" subtitle="Toggle public-facing features on or off instantly." icon={ToggleLeft}>
              <Toggle
                checked={!!form.appointmentBookingEnabled}
                onChange={setChecked("appointmentBookingEnabled")}
                label="Enable Online Booking"
                description="When off, the booking form is hidden and patients are asked to call."
              />
              <Toggle
                checked={!!form.testimonialsEnabled}
                onChange={setChecked("testimonialsEnabled")}
                label="Show Testimonials Section"
                description="Display patient reviews on the public website."
              />
            </Card>
          </div>
        )}

        {/* ── Consultations Tab ── */}
        {activeTab === "consultation" && (
          <div className="space-y-5">
            <Card title="Video Calls (LiveKit)" subtitle="Built-in video consultation — no external meeting link required." icon={LinkIcon}>
              <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3.5">
                <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-sm text-emerald-800 space-y-1">
                  <p className="font-semibold">LiveKit video rooms are active</p>
                  <p className="text-xs text-emerald-700">When you click "Enable Join" on an appointment, a private video room is created instantly. The patient joins directly from their dashboard — no external app needed.</p>
                  <p className="text-xs text-emerald-700">Caregivers can join via a shareable guest link shown to the patient. Up to 3 participants per call.</p>
                </div>
              </div>
              <div>
                <label className={labelCls}>
                  Fallback Meeting Link <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <input
                  className={inputCls}
                  value={(form as any).meetingLink ?? ""}
                  onChange={e => setForm(f => ({ ...f, meetingLink: e.target.value || null }))}
                  placeholder="https://meet.google.com/xxx-yyyy-zzz or Zoom link"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  If set, this link is shown to patients as an alternative if the built-in video room has issues.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">To receive an admin chime when a call ends, configure the LiveKit webhook in your LiveKit Cloud dashboard pointing to <span className="font-mono bg-muted/40 px-1 rounded">/api/livekit/webhook</span>.</p>
            </Card>

            <Card title="Patient ID Counter" subtitle="Sequential Patient ID generator: A001–Z999 → AA01–ZZ99 → AAA1–ZZZ9" icon={Hash}>
              {(form as any).currentPatientId && (
                <div className="bg-[#1a3d2b]/5 border border-[#1a3d2b]/15 rounded-xl px-5 py-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Last Assigned Patient ID</p>
                  <p className="text-4xl font-extrabold text-[#1a3d2b] tracking-widest font-mono">{(form as any).currentPatientId}</p>
                  <p className="text-xs text-muted-foreground mt-1">Current Number represents the last sequence number assigned to a newly registered patient.</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className={labelCls}>Prefix (A–Z, AA–ZZ, AAA–ZZZ)</label>
                  <input
                    type="text"
                    maxLength={3}
                    placeholder="A"
                    value={(form as any).patientIdPrefix ?? "A"}
                    onChange={e => {
                      const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
                      const maxNumForNewPrefix = v.length === 1 ? 999 : v.length === 2 ? 99 : 9;
                      setForm(f => ({
                        ...f,
                        patientIdPrefix: v,
                        patientIdCurrentNumber: Math.min(
                          typeof (f as any).patientIdCurrentNumber === "number"
                            ? (f as any).patientIdCurrentNumber
                            : parseInt((f as any).patientIdCurrentNumber || "0", 10) || 0,
                          maxNumForNewPrefix
                        ),
                      }));
                    }}
                    className={cn(inputCls, "h-12 w-full text-center font-extrabold text-xl uppercase font-mono shadow-sm")}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1.5">1 to 3 uppercase letters</p>
                </div>

                <div>
                  <label className={labelCls}>
                    Current Number (0–{((form as any).patientIdPrefix?.length ?? 1) === 1 ? 999 : ((form as any).patientIdPrefix?.length ?? 1) === 2 ? 99 : 9})
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0"
                    value={(form as any).patientIdCurrentNumber ?? 0}
                    onChange={e => {
                      const clean = e.target.value.replace(/\D/g, "");
                      if (clean === "") {
                        setForm(f => ({ ...f, patientIdCurrentNumber: "" as any }));
                        return;
                      }
                      const val = parseInt(clean, 10);
                      const maxNum = ((form as any).patientIdPrefix?.length ?? 1) === 1 ? 999 : ((form as any).patientIdPrefix?.length ?? 1) === 2 ? 99 : 9;
                      const sanitized = isNaN(val) ? 0 : Math.min(Math.max(0, val), maxNum);
                      setForm(f => ({ ...f, patientIdCurrentNumber: sanitized }));
                    }}
                    onBlur={() => {
                      const current = (form as any).patientIdCurrentNumber;
                      if (current === "" || current === undefined || current === null || isNaN(Number(current))) {
                        setForm(f => ({ ...f, patientIdCurrentNumber: 0 }));
                      }
                    }}
                    onWheel={e => {
                      e.currentTarget.blur();
                    }}
                    className={cn(inputCls, "h-12 w-full text-center font-extrabold text-xl font-mono shadow-sm")}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Current Number represents the last sequence number assigned to a newly registered patient.
                  </p>
                </div>
              </div>

              {(() => {
                const nextId = computeNextPatientId(
                  (form as any).patientIdPrefix ?? "A",
                  (form as any).patientIdCurrentNumber ?? 0
                );
                const isLimit = nextId === "No next Patient ID";

                return (
                  <div className={cn(
                    "rounded-xl p-4 space-y-1 transition-colors border",
                    isLimit ? "bg-rose-50/90 border-rose-200" : "bg-emerald-50/80 border-emerald-200"
                  )}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className={cn(
                          "text-xs font-bold uppercase tracking-wider block",
                          isLimit ? "text-rose-900" : "text-emerald-900"
                        )}>
                          Next Registered Patient ID
                        </span>
                        <span className={cn(
                          "text-xs",
                          isLimit ? "text-rose-700 font-medium" : "text-emerald-700"
                        )}>
                          {isLimit
                            ? "Sequence limit reached (ZZZ9). No more IDs can be generated."
                            : "Calculated automatically based on Prefix and Current Number"}
                        </span>
                      </div>
                      <span className={cn(
                        "font-mono px-4 py-1.5 rounded-lg border shadow-sm tracking-wide",
                        isLimit
                          ? "text-base sm:text-lg font-bold text-rose-700 bg-white border-rose-300"
                          : "text-2xl font-black text-emerald-700 bg-white border-emerald-300"
                      )}>
                        {nextId}
                      </span>
                    </div>
                    <p className={cn(
                      "text-xs font-medium pt-2 border-t mt-2",
                      isLimit ? "text-rose-800 border-rose-200/60" : "text-emerald-800 border-emerald-200/60"
                    )}>
                      {isLimit
                        ? "⚠️ The patient ID counter has reached its absolute maximum limit (ZZZ9). Existing patients remain unaffected."
                        : "ℹ️ Changing this value only affects the next NEW patient registration. Existing patients keep their assigned permanent Patient ID."}
                    </p>
                  </div>
                );
              })()}

              <div className="text-[11px] text-muted-foreground space-y-1 bg-muted/20 p-3.5 rounded-xl border border-border/50">
                <p className="font-semibold text-foreground">Counter Roll Rules:</p>
                <p>• <strong>Phase 1 (A–Z):</strong> Counter goes from <strong>001 to 999</strong> (e.g. A001–A999 → B001–B999 … → Z001–Z999).</p>
                <p>• <strong>Phase 2 (AA–ZZ):</strong> When Z999 completes, rolls to <strong>AA01–AA99</strong> → AB01–AB99 … → AZ01–AZ99 → BA01–BA99 … → ZZ01–ZZ99.</p>
                <p>• <strong>Phase 3 (AAA–ZZZ):</strong> When ZZ99 completes, rolls to <strong>AAA1–AAA9</strong> … → AAZ1–AAZ9 … → ZZA1–ZZZ9.</p>
                <p>• <strong>Sequence Limit (ZZZ9):</strong> After <strong>ZZZ9</strong>, the sequence reaches its limit and no further Patient IDs can be generated.</p>
                <p className="text-[10px] text-muted-foreground/80 pt-0.5">All patient IDs maintain a consistent 4-character format (1 letter + 3 digits, 2 letters + 2 digits, or 3 letters + 1 digit).</p>
              </div>
            </Card>
          </div>
        )}

        {/* ── Email Tab ── */}
        {activeTab === "email" && (
          <div className="space-y-5">
            <Card title="SMTP Configuration" subtitle="Connect your email server so the system can send patient alerts and appointment emails." icon={Mail}>
              <div className={cn(
                "flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium",
                form.smtpConfigured ? "bg-green-50 text-green-700 border border-green-200" : "bg-amber-50 text-amber-700 border border-amber-200"
              )}>
                {form.smtpConfigured
                  ? <><CheckCircle2 size={15} /> SMTP configured — emails are active</>
                  : <><AlertCircle size={15} /> Not yet configured — emails will only be logged to console</>}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Server</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className={labelCls}>SMTP Host</label>
                    <input className={inputCls} value={form.smtpHost || ""} onChange={set("smtpHost")} placeholder="mail.susrutahospital.com" />
                  </div>
                  <div>
                    <label className={labelCls}>Port</label>
                    <input type="number" className={inputCls} value={form.smtpPort || 587} onChange={set("smtpPort")} placeholder="587" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Username</label>
                  <input className={inputCls} value={form.smtpUser || ""} onChange={set("smtpUser")} placeholder="noreply@susrutahospital.com" autoComplete="off" />
                </div>
                <div>
                  <label className={labelCls}>Password</label>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      className={cn(inputCls, "pr-10")}
                      value={form.smtpPass || ""}
                      onChange={set("smtpPass")}
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <Toggle
                checked={!!form.smtpSecure}
                onChange={setChecked("smtpSecure")}
                label="Use SSL/TLS (port 465)"
                description="Auto-sets port to 465 (SSL) or 587 (STARTTLS). If you get authentication errors on port 587, try enabling this."
              />

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 pt-2">Sender Identity</p>
                <div className="space-y-3">
                  <div>
                    <label className={labelCls}>Display Name</label>
                    <input className={inputCls} value={form.smtpFromName || ""} onChange={set("smtpFromName")} placeholder="Susruta Hospital" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>From Email <span className="font-normal text-muted-foreground">(system)</span></label>
                      <input type="email" className={inputCls} value={form.smtpFromEmail || ""} onChange={set("smtpFromEmail")} placeholder="noreply@susrutahospital.com" />
                      <p className="text-[11px] text-muted-foreground mt-1">Patient login links, appointment alerts</p>
                    </div>
                    <div>
                      <label className={labelCls}>Subscriber From <span className="font-normal text-muted-foreground">(newsletters)</span></label>
                      <input type="email" className={inputCls} value={form.smtpSubscriberFrom || ""} onChange={set("smtpSubscriberFrom")} placeholder="updates@susrutahospital.com" />
                      <p className="text-[11px] text-muted-foreground mt-1">Appears in inbox for subscriber emails</p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card title="Send a Test Email" subtitle="Verify your SMTP settings are working correctly by sending a test message." icon={FlaskConical}>
              <div className="flex gap-2">
                <input
                  type="email"
                  className={cn(inputCls, "flex-1")}
                  value={testTo}
                  onChange={e => setTestTo(e.target.value)}
                  placeholder="Recipient email for test"
                />
                <button
                  type="button"
                  onClick={sendTestEmail}
                  disabled={testing || !testTo.trim() || !form.smtpHost}
                  className="flex items-center gap-2 px-4 py-2.5 bg-foreground text-white text-sm font-semibold rounded-xl hover:bg-foreground/90 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {testing ? "Sending…" : "Send Test"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Uses your saved settings. If you just changed the password above, click <strong>Save Settings</strong> first, then test.
              </p>
              {testResult && (
                <div className={cn(
                  "rounded-xl px-3 py-2.5 text-sm space-y-1",
                  testResult.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
                )}>
                  <div className="flex items-center gap-2">
                    {testResult.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    <span>{testResult.msg}</span>
                  </div>
                  {!testResult.ok && testResult.msg.toLowerCase().includes("auth") && (
                    <p className="text-xs pl-5 opacity-80">
                      Authentication failed — try enabling <strong>SSL/TLS (port 465)</strong> above, save, and test again. Or verify the password in your cPanel / hosting control panel.
                    </p>
                  )}
                </div>
              )}
            </Card>

            {/* DNS Checklist */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2.5 px-6 py-4 border-b border-amber-200 bg-amber-100/60">
                <Shield size={15} className="text-amber-700" />
                <h3 className="font-bold text-sm text-amber-900">Email Deliverability — DNS Checklist</h3>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-xs text-amber-800 leading-relaxed">To prevent emails from landing in spam, your domain's DNS needs these records. Ask your domain registrar or hosting provider to add them.</p>
                {[
                  { name: "SPF", status: "Required", desc: "Authorises your SMTP provider to send email for your domain.", example: 'TXT on susrutahospital.com:\n"v=spf1 include:mail.yourhostname.com ~all"' },
                  { name: "DKIM", status: "Required", desc: "Cryptographically signs outgoing mail. Get the key from your SMTP provider's dashboard.", example: "mail._domainkey.susrutahospital.com → TXT → (key from SMTP provider)" },
                  { name: "DMARC", status: "Recommended", desc: "Tells receivers what to do if SPF/DKIM fail.", example: 'TXT _dmarc.susrutahospital.com:\n"v=DMARC1; p=none; rua=mailto:admin@susrutahospital.com"' },
                  { name: "PTR / Reverse DNS", status: "Recommended", desc: "Your SMTP server's IP should resolve back to your sending domain. Ask your provider.", example: "Configured by your SMTP/hosting provider, not in your DNS panel." },
                ].map(r => (
                  <div key={r.name} className="bg-white rounded-xl border border-amber-200 p-4">
                    <div className="flex items-start gap-3">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide mt-0.5 shrink-0",
                        r.status === "Required" ? "bg-red-100 text-red-700 border border-red-200" : "bg-amber-100 text-amber-700 border border-amber-200")}>
                        {r.status}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-foreground mb-0.5">{r.name}</p>
                        <p className="text-xs text-muted-foreground mb-2">{r.desc}</p>
                        <pre className="text-[11px] bg-muted/60 rounded-lg px-3 py-2 text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">{r.example}</pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Security Tab ── */}
        {activeTab === "security" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Doctor Portal Access" subtitle="Set the password for Dr. P. Murali Krishna to log into the doctor portal at /doctor." icon={Stethoscope}>
              <div className={cn(
                "flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium",
                form.doctorPortalConfigured ? "bg-green-50 text-green-700 border border-green-200" : "bg-amber-50 text-amber-700 border border-amber-200"
              )}>
                {form.doctorPortalConfigured
                  ? <><CheckCircle2 size={15} /> Doctor portal is configured</>
                  : <><AlertCircle size={15} /> Doctor portal password not yet set — doctor cannot log in</>}
              </div>
              <div>
                <label className={labelCls}>
                  {form.doctorPortalConfigured ? "Change Doctor Portal Password" : "Set Doctor Portal Password"}
                </label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={showDoctorPass ? "text" : "password"}
                    value={doctorPassword}
                    onChange={e => setDoctorPassword(e.target.value)}
                    placeholder={form.doctorPortalConfigured ? "Leave blank to keep current password" : "Set a new password"}
                    autoComplete="new-password"
                    className={cn(inputCls, "pl-9 pr-10")}
                  />
                  <button type="button" onClick={() => setShowDoctorPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showDoctorPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">Cannot be recovered — only reset. Share with Dr. Murali Krishna only.</p>
              </div>
              <a href="/doctor" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary font-semibold hover:underline">
                <Stethoscope size={13} /> Open Doctor Portal →
              </a>
            </Card>

            <Card title="Pharmacy Portal Access" subtitle="Set the password for pharmacy staff to access the portal at /pharmacy." icon={Pill}>
              <div className={cn(
                "flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium",
                form.pharmacyPortalConfigured ? "bg-green-50 text-green-700 border border-green-200" : "bg-amber-50 text-amber-700 border border-amber-200"
              )}>
                {form.pharmacyPortalConfigured
                  ? <><CheckCircle2 size={15} /> Pharmacy portal is configured</>
                  : <><AlertCircle size={15} /> Pharmacy portal password not yet set</>}
              </div>
              <div>
                <label className={labelCls}>
                  {form.pharmacyPortalConfigured ? "Change Pharmacy Portal Password" : "Set Pharmacy Portal Password"}
                </label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={showPharmacyPass ? "text" : "password"}
                    value={pharmacyPassword}
                    onChange={e => setPharmacyPassword(e.target.value)}
                    placeholder={form.pharmacyPortalConfigured ? "Leave blank to keep current password" : "Set a new password"}
                    autoComplete="new-password"
                    className={cn(inputCls, "pl-9 pr-10")}
                  />
                  <button type="button" onClick={() => setShowPharmacyPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPharmacyPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">Cannot be recovered — only reset.</p>
              </div>
            </Card>
          </div>
        )}

        {/* ── Payments Tab ── */}
        {activeTab === "payments" && (
          <Card title="PhonePe QR Code" subtitle="Upload your UPI QR code. Patients see this when making a donation after their online consultation." icon={QrCode}>
            <div className="flex items-start gap-5">
              <div className={cn(
                "w-36 h-36 rounded-xl border-2 flex items-center justify-center bg-gray-50 shrink-0 overflow-hidden",
                form.phonepeQrObjectPath ? "border-green-300" : "border-dashed border-border"
              )}>
                {form.phonepeQrObjectPath ? (
                  <img src={`${BASE}/api/storage${form.phonepeQrObjectPath}`} alt="PhonePe QR" className="w-full h-full object-contain p-1" />
                ) : (
                  <div className="text-center text-muted-foreground px-2">
                    <QrCode size={30} className="mx-auto mb-1.5 opacity-30" />
                    <p className="text-[10px]">No QR uploaded</p>
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-3">
                <label className={cn(
                  "flex items-center gap-2.5 cursor-pointer border-2 border-dashed border-primary/30 rounded-xl px-4 py-3 hover:bg-primary/5 transition-colors text-sm text-primary font-medium",
                  qrUploading && "opacity-60 cursor-not-allowed pointer-events-none"
                )}>
                  {qrUploading
                    ? <><Loader2 size={15} className="animate-spin" /> Uploading…</>
                    : <><Upload size={15} /> {form.phonepeQrObjectPath ? "Replace QR Code" : "Upload QR Code"}</>
                  }
                  <input
                    type="file" accept="image/*" disabled={qrUploading} className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setQrUploading(true);
                      setSaveResult(null);
                      try {
                        const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
                        });
                        if (!urlRes.ok) {
                          const errData = await urlRes.json().catch(() => ({}));
                          throw new Error(errData.message || `Upload request failed (${urlRes.status})`);
                        }
                        const { uploadURL, objectPath } = await urlRes.json();
                        const uploadRes = await fetch(uploadURL, {
                          method: "PUT",
                          headers: { "Content-Type": file.type },
                          body: file,
                        });
                        if (!uploadRes.ok) throw new Error("File upload failed");
                        const saveRes = await apiFetch("/settings", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ phonepeQrObjectPath: objectPath }),
                        });
                        if (!saveRes.ok) throw new Error("Failed to save QR path");
                        const updated = await saveRes.json();
                        setForm(updated);
                        setSaveResult({ ok: true, msg: "QR code uploaded successfully!" });
                        setTimeout(() => setSaveResult(null), 5000);
                      } catch (err: any) {
                        setSaveResult({ ok: false, msg: err.message || "Upload failed. Please try again." });
                      } finally {
                        setQrUploading(false);
                        e.target.value = "";
                      }
                    }}
                  />
                </label>
                {form.phonepeQrObjectPath && (
                  <p className="text-xs text-green-700 flex items-center gap-1.5">
                    <CheckCircle2 size={12} /> QR code is active — patients can scan to pay
                  </p>
                )}
                <p className="text-xs text-muted-foreground">Accepts PNG, JPG, WebP. Recommended: 400×400px or larger.</p>
              </div>
            </div>
          </Card>
        )}

        {/* ── Sticky Save Bar ── */}
        {activeTab !== "payments" && (
          <div className="mt-6 flex items-center justify-end gap-4">
            {saveResult && (
              <div className={cn(
                "flex items-center gap-2 text-sm rounded-xl px-3 py-2",
                saveResult.ok ? "text-green-700 bg-green-50 border border-green-200" : "text-red-700 bg-red-50 border border-red-200"
              )}>
                {saveResult.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {saveResult.msg}
              </div>
            )}
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#D95B2F] text-white text-sm font-semibold rounded-xl hover:bg-[#c44e25] transition-colors disabled:opacity-50 shadow-sm"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        )}
      </form>
    </AdminLayout>
  );
}
