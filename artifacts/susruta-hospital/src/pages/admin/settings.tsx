import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Save, Mail, Send, CheckCircle2, AlertCircle, Eye, EyeOff, Shield, Globe, Phone, Loader2, FlaskConical } from "lucide-react";
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
      // If password field still shows masked value and wasn't changed, omit it
      if (!passChanged) delete payload.smtpPass;
      const res = await apiFetch("/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save settings.");
      setForm(data);
      setPassChanged(false);
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
