import React, { useEffect, useState, useRef, useCallback } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Users, Search, BadgeCheck, Clock, Phone, Mail, Send, Trash2, Loader2, RefreshCw, Video, PhoneOff, Monitor, Pencil, Save, AlertTriangle } from "lucide-react";
import { AdminVideoRoom } from "@/components/VideoCall";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api/admin`;

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${API}${path}`, { credentials: "include", ...opts });
}

interface Patient {
  id: number;
  patientCode: string | null;
  name: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  createdAt: string;
}
interface DirectCall {
  id: number;
  status: string;
  roomName: string;
  startedAt: string;
  patientJoinedAt: string | null;
  patient: Pick<Patient, "id" | "patientCode" | "name" | "email" | "phone">;
}
type MonitorCredentials = { token: string; serverUrl: string };

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const POLL_INTERVAL_MS = 20_000;

function EditPatientDialog({
  patient,
  onClose,
  onSaved,
}: {
  patient: Patient;
  onClose: () => void;
  onSaved: (patient: Patient, message: string, ok: boolean) => void;
}) {
  const [name, setName] = useState(patient.name);
  const [email, setEmail] = useState(patient.email);
  const [phone, setPhone] = useState(patient.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const emailChanged = email.trim().toLowerCase() !== patient.email.trim().toLowerCase();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (trimmedName.length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (phone.trim().length > 20) {
      setError("Phone number must be 20 characters or fewer.");
      return;
    }

    setSaving(true);
    try {
      const response = await apiFetch(`/patients/${patient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          phone: phone.trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || "Could not update patient. Please try again.");
        return;
      }

      onSaved(
        data.patient,
        data.message || "Patient record updated successfully.",
        !(data.emailChanged && data.verificationEmailSent === false),
      );
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={open => {
      if (!open && !saving) onClose();
    }}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto rounded-3xl border-0 bg-white p-0 shadow-2xl"
        onEscapeKeyDown={event => {
          if (saving) event.preventDefault();
        }}
        onPointerDownOutside={event => {
          if (saving) event.preventDefault();
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 pb-4 pt-6 pr-14 sm:px-7 sm:pr-14">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-1">Patient details</p>
            <DialogTitle className="text-xl font-bold text-gray-900">Edit {patient.name}</DialogTitle>
            <DialogDescription className="mt-1 text-xs text-gray-500">{patient.patientCode || "No patient ID assigned"}</DialogDescription>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 sm:px-7 py-5 space-y-5">
          {error && (
            <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="edit-patient-name" className="text-sm font-semibold text-gray-800">Full name</label>
            <input
              id="edit-patient-name"
              value={name}
              onChange={event => setName(event.target.value)}
              minLength={2}
              maxLength={100}
              required
              autoFocus
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="edit-patient-email" className="text-sm font-semibold text-gray-800">Email address</label>
            <input
              id="edit-patient-email"
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              maxLength={255}
              required
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>

          {emailChanged && (
            <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
              <p>
                <strong>New email requires verification.</strong> Saving this address will mark the patient unverified and send a fresh verification link.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="edit-patient-phone" className="text-sm font-semibold text-gray-800">
              Phone number <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              id="edit-patient-phone"
              type="tel"
              value={phone}
              onChange={event => setPhone(event.target.value)}
              maxLength={20}
              placeholder="Phone number"
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPatients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<Patient | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCalls, setActiveCalls] = useState<DirectCall[]>([]);
  const [monitoring, setMonitoring] = useState<MonitorCredentials | null>(null);
  const [monitoringCallId, setMonitoringCallId] = useState<number | null>(null);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const fetchPatients = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    if (silent) setRefreshing(true);
    try {
      const r = await apiFetch("/patients");
      const data = await r.json();
      setPatients(Array.isArray(data) ? data : []);
      setLastUpdated(new Date());
    } catch {
      if (!silent) setPatients([]);
    } finally {
      if (!silent) setLoading(false);
      if (silent) setRefreshing(false);
    }
  }, []);

  const fetchActiveCalls = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/direct-calls/admin/active`, { credentials: "include" });
      const data = await r.json();
      setActiveCalls(Array.isArray(data) ? data : []);
    } catch {
      setActiveCalls([]);
    }
  }, []);

  useEffect(() => {
    fetchPatients(false);
    fetchActiveCalls();
    pollRef.current = setInterval(() => { fetchPatients(true); fetchActiveCalls(); }, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchPatients, fetchActiveCalls]);

  const filtered = patients.filter(p => {
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      (p.phone ?? "").includes(q) ||
      (p.patientCode ?? "").toLowerCase().includes(q)
    );
  });

  async function resendVerification(p: Patient) {
    setActionLoading(prev => ({ ...prev, [p.id]: "resend" }));
    try {
      const r = await apiFetch(`/patients/${p.id}/resend-verification`, { method: "POST" });
      const data = await r.json();
      if (r.ok) {
        showToast(data.message || `Verification email sent to ${p.email}`);
      } else {
        showToast(data.message || "Failed to send email.", false);
      }
    } catch {
      showToast("Network error. Please try again.", false);
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[p.id]; return n; });
    }
  }

  async function deletePatient(p: Patient) {
    setConfirmDelete(null);
    setActionLoading(prev => ({ ...prev, [p.id]: "delete" }));
    try {
      const r = await apiFetch(`/patients/${p.id}`, { method: "DELETE" });
      if (r.ok) {
        setPatients(prev => prev.filter(x => x.id !== p.id));
        showToast(`${p.name} has been removed.`);
      } else {
        const data = await r.json();
        showToast(data.message || "Failed to delete patient.", false);
      }
    } catch {
      showToast("Network error. Please try again.", false);
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[p.id]; return n; });
    }
  }

  function handlePatientSaved(updatedPatient: Patient, message: string, ok: boolean) {
    setPatients(prev => prev.map(p => p.id === updatedPatient.id ? updatedPatient : p));
    setEditingPatient(null);
    showToast(message, ok);
  }

  async function startDirectCall(p: Patient) {
    setActionLoading(prev => ({ ...prev, [p.id]: "call" }));
    try {
      const r = await fetch(`${BASE}/api/direct-calls/admin`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: p.id }),
      });
      const data = await r.json();
      if (!r.ok) {
        showToast(data.message || "Could not start the direct call.", false);
        return;
      }
      setActiveCalls([data]);
      showToast(`Direct call started for ${p.name}. The doctor and patient have been notified.`);
    } catch {
      showToast("Network error. Please try again.", false);
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[p.id]; return n; });
    }
  }

  async function endDirectCall(call: DirectCall) {
    setActionLoading(prev => ({ ...prev, [call.patient.id]: "end-call" }));
    try {
      const r = await fetch(`${BASE}/api/direct-calls/admin/${call.id}/end`, { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error();
      setActiveCalls(prev => prev.filter(c => c.id !== call.id));
      if (monitoringCallId === call.id) { setMonitoring(null); setMonitoringCallId(null); }
      showToast(`Direct call with ${call.patient.name} ended.`);
    } catch {
      showToast("Could not end the direct call.", false);
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[call.patient.id]; return n; });
    }
  }

  async function monitorDirectCall(call: DirectCall) {
    setActionLoading(prev => ({ ...prev, [call.patient.id]: "monitor" }));
    try {
      const r = await fetch(`${BASE}/api/livekit/direct-admin-token/${call.id}`, { credentials: "include" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "Could not open the call monitor.");
      setMonitoring(data);
      setMonitoringCallId(call.id);
    } catch (err: any) {
      showToast(err.message || "Could not open the call monitor.", false);
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[call.patient.id]; return n; });
    }
  }

  return (
    <AdminLayout>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-2xl shadow-lg text-sm font-semibold text-white transition-all ${toast.ok ? "bg-emerald-600" : "bg-red-500"}`}>
          {toast.msg}
        </div>
      )}

      {monitoring && monitoringCallId !== null && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col">
          <div className="h-12 px-4 flex items-center justify-between bg-[#1c1c1e] border-b border-white/10 shrink-0">
            <p className="text-white text-sm font-bold">Monitoring direct call</p>
            <button onClick={() => { setMonitoring(null); setMonitoringCallId(null); }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-white hover:bg-white/20">
              Close monitor
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <AdminVideoRoom token={monitoring.token} serverUrl={monitoring.serverUrl} onLeave={() => { setMonitoring(null); setMonitoringCallId(null); }} />
          </div>
        </div>
      )}

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-7">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Patient?</h3>
            <p className="text-sm text-gray-600 mb-1">
              This will permanently delete <strong>{confirmDelete.name}</strong> ({confirmDelete.email}) and all their appointments and data.
            </p>
            <p className="text-xs text-red-600 font-semibold mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => deletePatient(confirmDelete)}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {editingPatient && (
        <EditPatientDialog
          patient={editingPatient}
          onClose={() => setEditingPatient(null)}
          onSaved={handlePatientSaved}
        />
      )}

      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Registered Patients</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-muted-foreground text-sm">
              {loading ? "Loading…" : `${patients.length} patient${patients.length !== 1 ? "s" : ""} registered`}
            </p>
            {lastUpdated && !loading && (
              <span className="text-xs text-muted-foreground/60">
                · Updated {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            {refreshing && (
              <RefreshCw size={12} className="text-muted-foreground/60 animate-spin" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Manual refresh */}
          <button
            onClick={() => fetchPatients(true)}
            disabled={refreshing || loading}
            title="Refresh now"
            className="p-2 border border-border rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40 shrink-0"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>

          {/* Search */}
          <div className="relative flex-1 sm:w-72">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, ID, email, phone…"
              className="w-full pl-9 pr-4 py-2 border border-border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            />
          </div>
        </div>
      </div>

      {activeCalls.map(call => (
        <div key={call.id} className="mb-5 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-4 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Video size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-emerald-950 truncate">Direct video call active with {call.patient.name}</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                {call.patientJoinedAt ? "Patient has joined the call." : "Waiting for the patient to join."}
              </p>
            </div>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => monitorDirectCall(call)} disabled={!!actionLoading[call.patient.id]}
              className="flex-1 md:flex-none inline-flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-xl disabled:opacity-50">
              {actionLoading[call.patient.id] === "monitor" ? <Loader2 size={13} className="animate-spin" /> : <Monitor size={13} />}
              Monitor
            </button>
            <button onClick={() => endDirectCall(call)} disabled={!!actionLoading[call.patient.id]}
              className="flex-1 md:flex-none inline-flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50">
              {actionLoading[call.patient.id] === "end-call" ? <Loader2 size={13} className="animate-spin" /> : <PhoneOff size={13} />}
              End call
            </button>
          </div>
        </div>
      ))}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
          Loading patients…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Users size={40} className="opacity-20" />
          <p className="text-sm">{search ? "No patients match your search." : "No registered patients yet."}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Patient ID</th>
                <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Name</th>
                <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">Contact</th>
                <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Registered</th>
                <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-4">
                    {p.patientCode
                      ? <span className="font-black text-primary font-mono text-base tracking-widest">{p.patientCode}</span>
                      : <span className="text-muted-foreground text-xs italic">—</span>
                    }
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-foreground">{p.name}</p>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell">
                    <div className="space-y-0.5">
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <Mail size={12} className="shrink-0" /> {p.email}
                      </p>
                      {p.phone && (
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone size={12} className="shrink-0" /> {p.phone}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock size={12} /> {fmtDate(p.createdAt)}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {p.emailVerified
                      ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
                          <BadgeCheck size={12} /> Verified
                        </span>
                      : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                          <Clock size={12} /> Unverified
                        </span>
                    }
                  </td>
                  <td className="px-5 py-4">
                     <div className="flex flex-wrap items-center gap-2">
                       <button
                         onClick={() => setEditingPatient(p)}
                         disabled={!!actionLoading[p.id]}
                         title={`Edit ${p.name}`}
                         aria-label={`Edit ${p.name}`}
                         className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-lg transition-colors disabled:opacity-50"
                       >
                         <Pencil size={12} />
                         <span className="hidden sm:inline">Edit</span>
                       </button>
                      {!p.emailVerified && (
                        <button
                          onClick={() => resendVerification(p)}
                          disabled={!!actionLoading[p.id]}
                          title="Resend verification email"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {actionLoading[p.id] === "resend"
                            ? <Loader2 size={12} className="animate-spin" />
                            : <Send size={12} />
                          }
                          <span className="hidden sm:inline">Resend Email</span>
                        </button>
                      )}
                      <button
                        onClick={() => startDirectCall(p)}
                        disabled={!!actionLoading[p.id] || activeCalls.length > 0}
                        title={activeCalls.length > 0 ? "End the active direct call before starting another" : `Start a direct video call with ${p.name}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {actionLoading[p.id] === "call"
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Video size={12} />
                        }
                        <span className="hidden sm:inline">Call Patient</span>
                      </button>
                      <button
                        onClick={() => setConfirmDelete(p)}
                        disabled={!!actionLoading[p.id]}
                        title="Delete patient"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {actionLoading[p.id] === "delete"
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Trash2 size={12} />
                        }
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
