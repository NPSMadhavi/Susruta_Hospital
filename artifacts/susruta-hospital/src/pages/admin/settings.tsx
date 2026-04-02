import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Save, Mail, Send, CheckCircle2, AlertCircle, Eye, EyeOff, Shield, Globe, Phone, Loader2, FlaskConical, Stethoscope, Lock, Pill, Upload, QrCode } from "lucide-react";
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
  phonepeQrObjectPath: string | null;
};

const inputCls = "w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b] transition-all bg-white";
const labelCls = "block text-sm font-medium text-foreground mb-1.5";

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-border bg-muted/30">
        <Icon size={16} className="text-[#1a3d2b]" />
        <h2 className="font-bold text-base text-foreground">{title}</h2>
      </div>
      <div className="p-6 space-y-4">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description: string }) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer p-3.5 rounded-xl hover:bg-muted/40 transition-colors">
      <div>
        <div className="font-medium text-sm text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none",
          checked ? "bg-[#1a3d2b]" : "bg-gray-200"
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

export default function AdminSettings() {
  const [form, setForm] = useState<Partial<Settings>>({
    testimonialsEnabled: true,
    appointmentBookingEnabled: true,
    clinicPhone1: "",
    clinicPhone2: "",
    clinicEmail: "",
    clinicAddress: "",
    workingHours: "",
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPass: "",
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
      .then((r) => r.json())
      .then((d) => {
        setForm(d);
        setTestTo(d.clinicEmail || "");
      })
      .finally(() => setLoading(false));
  }, []);

  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (k === "smtpPass") setPassChanged(true);
  };

  const setChecked = (k: keyof Settings) => (v: boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveResult(null);
    try {
      const payload: any = { ...form };
      if (!passChanged) delete payload.smtpPass;
      if (doctorPassword.trim()) payload.doctorPassword = doctorPassword;
      if (pharmacyPassword.trim()) payload.pharmacyPassword = pharmacyPassword;
      const res = await apiFetch("/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save settings.");
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
          host: form.smtpHost,
          port: form.smtpPort,
          user: form.smtpUser,
          pass: passChanged ? form.smtpPass : form.smtpPass,
          secure: form.smtpSecure,
          fromName: form.smtpFromName,
          fromEmail: form.smtpFromEmail,
          subscriberFrom: form.smtpSubscriberFrom,
          testTo,
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
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage website features, contact info, and email configuration.</p>
      </div>

      <form onSubmit={save} className="max-w-2xl space-y-6">

        {/* ── Website Features ── */}
        <SectionCard title="Website Features" icon={Globe}>
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
        </SectionCard>

        {/* ── Contact Info ── */}
        <SectionCard title="Contact Information" icon={Phone}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Primary Phone</label>
              <input className={inputCls} value={form.clinicPhone1 || ""} onChange={set("clinicPhone1")} />
            </div>
            <div>
              <label className={labelCls}>Secondary Phone</label>
              <input className={inputCls} value={form.clinicPhone2 || ""} onChange={set("clinicPhone2")} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Clinic Email (admin contact)</label>
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
        </SectionCard>

        {/* ── Email / SMTP Settings ── */}
        <SectionCard title="Email & SMTP Settings" icon={Mail}>
          {/* Status badge */}
          <div className={cn(
            "flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium",
            form.smtpConfigured ? "bg-green-50 text-green-700 border border-green-200" : "bg-amber-50 text-amber-700 border border-amber-200"
          )}>
            {form.smtpConfigured
              ? <><CheckCircle2 size={15} /> SMTP configured — emails are active</>
              : <><AlertCircle size={15} /> SMTP not yet configured — emails will be logged to console only</>}
          </div>

          <div className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-4 py-3 leading-relaxed">
            <strong>How it works:</strong> System emails (patient verifications, appointment alerts) send from{" "}
            <strong>From Email</strong>. Subscriber communications (acknowledgements, newsletters) send from{" "}
            <strong>Subscriber From</strong> so they appear as <em>updates@susrutahospital.com</em> in inboxes.
          </div>

          {/* SMTP Server */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">SMTP Server</p>
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
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          <Toggle
            checked={!!form.smtpSecure}
            onChange={setChecked("smtpSecure")}
            label="Use SSL/TLS (port 465)"
            description="Enable for port 465. Leave off for port 587 STARTTLS (recommended)."
          />

          {/* From Addresses */}
          <div className="pt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Sender Identity</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Display Name</label>
                <input className={inputCls} value={form.smtpFromName || ""} onChange={set("smtpFromName")} placeholder="Susruta Hospital" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>From Email <span className="text-xs text-muted-foreground font-normal">(system / auth)</span></label>
                  <input type="email" className={inputCls} value={form.smtpFromEmail || ""} onChange={set("smtpFromEmail")} placeholder="noreply@susrutahospital.com" />
                  <p className="text-[11px] text-muted-foreground mt-1">Used for patient login links, appointment alerts</p>
                </div>
                <div>
                  <label className={labelCls}>Subscriber From <span className="text-xs text-muted-foreground font-normal">(newsletters)</span></label>
                  <input type="email" className={inputCls} value={form.smtpSubscriberFrom || ""} onChange={set("smtpSubscriberFrom")} placeholder="updates@susrutahospital.com" />
                  <p className="text-[11px] text-muted-foreground mt-1">Appears in inbox for subscriber emails</p>
                </div>
              </div>
            </div>
          </div>

          {/* Test Email */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <FlaskConical size={12} /> Send a Test Email
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                className={cn(inputCls, "flex-1")}
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="Recipient email for test"
              />
              <button
                type="button"
                onClick={sendTestEmail}
                disabled={testing || !testTo.trim() || !form.smtpHost}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#1a3d2b] text-white text-sm font-semibold rounded-xl hover:bg-[#1a3d2b]/90 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {testing ? "Sending…" : "Send Test"}
              </button>
            </div>
            {testResult && (
              <div className={cn(
                "mt-2 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm",
                testResult.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
              )}>
                {testResult.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {testResult.msg}
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── Doctor Portal ── */}
        <SectionCard title="Doctor Portal Access" icon={Stethoscope}>
          <div className={cn(
            "flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium",
            form.doctorPortalConfigured
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-amber-50 text-amber-700 border border-amber-200"
          )}>
            {form.doctorPortalConfigured
              ? <><CheckCircle2 size={15} /> Doctor portal is configured — the doctor can log in at /doctor</>
              : <><AlertCircle size={15} /> Doctor portal password not yet set — doctor cannot log in until configured</>}
          </div>
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-4 py-3 leading-relaxed">
            Set a shared password for Dr. P. Murali Krishna to access the doctor portal at{" "}
            <strong>/doctor</strong>. The doctor can view patient documents, issue prescriptions, and write private notes.
            The password is stored as a secure hash — leave this field blank to keep the current password unchanged.
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
            <p className="text-xs text-muted-foreground mt-1.5">Share this password with Dr. Murali Krishna. It cannot be recovered — only reset.</p>
          </div>
          <div className="pt-1">
            <a href="/doctor" target="_blank" rel="noopener noreferrer"
              className="text-sm text-primary font-semibold hover:underline flex items-center gap-1.5">
              <Stethoscope size={13} /> Open Doctor Portal →
            </a>
          </div>
        </SectionCard>

        {/* ── Pharmacy Portal ── */}
        <SectionCard title="Pharmacy Portal Access & PhonePe QR" icon={Pill}>
          <div className={cn(
            "flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium",
            form.pharmacyPortalConfigured
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-amber-50 text-amber-700 border border-amber-200"
          )}>
            {form.pharmacyPortalConfigured
              ? <><CheckCircle2 size={15} /> Pharmacy portal is configured — pharmacist can log in at /pharmacy</>
              : <><AlertCircle size={15} /> Pharmacy portal password not yet set — pharmacist cannot log in until configured</>}
          </div>
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-4 py-3 leading-relaxed">
            Set a shared password for the pharmacy staff to access the pharmacy portal at <strong>/pharmacy</strong>.
            They can review medicine orders, verify availability, confirm payments, and update shipping.
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
            <p className="text-xs text-muted-foreground mt-1.5">Share this password with pharmacy staff only. It cannot be recovered — only reset.</p>
          </div>

          {/* PhonePe QR Upload */}
          <div>
            <label className={labelCls}><QrCode size={13} className="inline mr-1" /> PhonePe QR Code Image</label>
            <div className="text-xs text-muted-foreground mb-2">
              Upload the PhonePe UPI QR code image. Patients will see this when they need to pay for medicine orders.
            </div>
            {form.phonepeQrObjectPath && (
              <div className="mb-3 flex items-center gap-3">
                <img
                  src={`${BASE}/api/storage${form.phonepeQrObjectPath}`}
                  alt="Current PhonePe QR"
                  className="w-28 h-28 object-contain border border-border rounded-xl bg-white p-1"
                />
                <div>
                  <p className="text-xs text-green-700 font-medium flex items-center gap-1.5"><CheckCircle2 size={12} /> QR code uploaded</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Upload a new image to replace it</p>
                </div>
              </div>
            )}
            <label className={cn(
              "flex items-center gap-2.5 cursor-pointer border-2 border-dashed border-primary/30 rounded-xl px-4 py-3 hover:bg-primary/5 transition-colors text-sm text-primary font-medium",
              qrUploading && "opacity-60 cursor-not-allowed"
            )}>
              {qrUploading
                ? <><Loader2 size={15} className="animate-spin" /> Uploading…</>
                : <><Upload size={15} /> {form.phonepeQrObjectPath ? "Replace QR Code Image" : "Upload QR Code Image"}</>
              }
              <input
                type="file"
                accept="image/*"
                disabled={qrUploading}
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setQrUploading(true);
                  try {
                    const fd = new FormData();
                    fd.append("file", file);
                    fd.append("visibility", "public");
                    const res = await fetch(`${BASE}/api/storage/objects`, {
                      method: "POST", credentials: "include", body: fd,
                    });
                    if (!res.ok) throw new Error("Upload failed");
                    const { objectPath } = await res.json();
                    // Save to settings
                    const r2 = await apiFetch("/settings", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ phonepeQrObjectPath: objectPath }),
                    });
                    const updated = await r2.json();
                    setForm(updated);
                    setSaveResult({ ok: true, msg: "PhonePe QR code uploaded successfully." });
                    setTimeout(() => setSaveResult(null), 4000);
                  } catch (err: any) {
                    setSaveResult({ ok: false, msg: err.message || "Upload failed" });
                  } finally {
                    setQrUploading(false);
                    e.target.value = "";
                  }
                }}
              />
            </label>
          </div>

          <div className="pt-1">
            <a href="/pharmacy" target="_blank" rel="noopener noreferrer"
              className="text-sm text-primary font-semibold hover:underline flex items-center gap-1.5">
              <Pill size={13} /> Open Pharmacy Portal →
            </a>
          </div>
        </SectionCard>

        {/* DNS / Deliverability Checklist */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-amber-200 bg-amber-100/60">
            <Shield size={16} className="text-amber-700" />
            <h2 className="font-bold text-base text-amber-900">Email Deliverability — DNS Checklist</h2>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-amber-800 leading-relaxed">
              To prevent emails from going to spam, your domain's DNS must have these records configured. Ask your domain registrar or hosting provider to add them.
            </p>
            <div className="space-y-3">
              {[
                {
                  name: "SPF",
                  status: "Required",
                  desc: "Tells receiving servers that your SMTP provider is authorised to send email for your domain.",
                  example: 'TXT record on susrutahospital.com:\n"v=spf1 include:mail.yourhostname.com ~all"',
                },
                {
                  name: "DKIM",
                  status: "Required",
                  desc: "Cryptographically signs outgoing mail. Get the DKIM key from your SMTP provider's dashboard and add it as a TXT record.",
                  example: "Usually looks like:\nmail._domainkey.susrutahospital.com → TXT → (key from SMTP provider)",
                },
                {
                  name: "DMARC",
                  status: "Recommended",
                  desc: 'Tells receivers what to do if SPF/DKIM fail. Add this TXT record to protect your domain from spoofing.',
                  example: 'TXT record _dmarc.susrutahospital.com:\n"v=DMARC1; p=none; rua=mailto:admin@susrutahospital.com"',
                },
                {
                  name: "PTR / Reverse DNS",
                  status: "Recommended",
                  desc: "The IP address of your SMTP server should resolve back to your sending domain. Ask your SMTP provider if this is set.",
                  example: "Typically configured by your SMTP/hosting provider, not in DNS panel.",
                },
              ].map((r) => (
                <div key={r.name} className="bg-white rounded-xl border border-amber-200 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
                        r.status === "Required" ? "bg-red-100 text-red-700 border border-red-200" : "bg-amber-100 text-amber-700 border border-amber-200")}>
                        {r.status}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-foreground mb-1">{r.name}</p>
                      <p className="text-sm text-muted-foreground mb-2 leading-relaxed">{r.desc}</p>
                      <pre className="text-[11px] bg-muted/60 rounded-lg px-3 py-2 text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">{r.example}</pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-amber-700 flex items-start gap-1.5 pt-1">
              <Shield size={12} className="flex-shrink-0 mt-0.5" />
              Gmail and Yahoo now require SPF + DKIM + a working List-Unsubscribe link for any bulk sender. These are already set in the email code — you just need the DNS records in place.
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#1a3d2b] text-white font-bold rounded-xl hover:bg-[#1a3d2b]/90 transition-colors disabled:opacity-60 text-sm"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? "Saving…" : "Save All Settings"}
          </button>
          {saveResult && (
            <div className={cn(
              "flex items-center gap-2 text-sm rounded-xl px-3 py-2",
              saveResult.ok ? "text-green-700" : "text-red-600"
            )}>
              {saveResult.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {saveResult.msg}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground flex items-center gap-1.5 pb-4">
          <Shield size={12} /> SMTP credentials are stored securely in your database and never exposed publicly.
        </p>
      </form>
    </AdminLayout>
  );
}
