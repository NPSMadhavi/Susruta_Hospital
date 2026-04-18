import React, { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Video, User, Calendar, Clock, RefreshCw, CheckCircle2, AlertCircle,
  Loader2, FileText, ChevronDown, ChevronUp, ImageIcon, Upload, Camera,
  ExternalLink, X, Play, Square, Link
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function adminFetch(path: string, opts: RequestInit = {}) {
  const r = await fetch(`${BASE}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw data;
  return data;
}

type DocFile = { name: string; objectPath: string; contentType: string; size: number };
type Prescription = { photoObjectPath: string | null; notes: string | null; updatedAt: string };
type OnlineAppt = {
  id: number; status: string; reason: string | null;
  documents: DocFile[]; joinEnabled: boolean; joinEnabledAt: string | null; createdAt: string;
  slot: { id: number; date: string; startTime: string; endTime: string };
  patient: { id: number; patientCode: string | null; name: string; email: string; phone: string | null };
  prescription: Prescription | null;
};

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-700 border-yellow-200",
  confirmed: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};

// ── Prescription Photo Upload (admin side) ────────────────────
function PrescriptionUpload({ apptId, prescription, onUploaded }: {
  apptId: number;
  prescription: Prescription | null;
  onUploaded: (rx: Prescription) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [err, setErr] = useState("");

  function handleFile(file: File) {
    setErr("");
    setPreview(URL.createObjectURL(file));
    setPendingFile(file);
  }

  async function confirmUpload() {
    if (!pendingFile) return;
    setUploading(true);
    setErr("");
    try {
      const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pendingFile.name, contentType: pendingFile.type, size: pendingFile.size }),
      });
      if (!urlRes.ok) throw new Error("Upload URL failed");
      const { uploadURL, objectPath } = await urlRes.json();

      const upRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": pendingFile.type }, body: pendingFile });
      if (!upRes.ok) throw new Error("Upload failed");

      const saveRes = await adminFetch(`/online-appointments/admin/${apptId}/prescription`, {
        method: "PUT",
        body: JSON.stringify({ photoObjectPath: objectPath }),
      });
      setPreview(null); setPendingFile(null);
      onUploaded(saveRes);
    } catch (e: any) {
      setErr(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      {prescription?.photoObjectPath && !preview && (
        <div className="bg-gray-50 rounded-xl overflow-hidden border border-border">
          <img src={`${BASE}/api/storage${prescription.photoObjectPath}`} alt="Rx" className="w-full max-h-40 object-contain" />
        </div>
      )}
      {preview && (
        <div className="space-y-2">
          <div className="bg-gray-50 rounded-xl overflow-hidden border-2 border-primary/30">
            <img src={preview} alt="Preview" className="w-full max-h-48 object-contain" />
          </div>
          <div className="flex gap-2">
            <button onClick={confirmUpload} disabled={uploading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#1a3d2b] text-white font-bold rounded-xl text-sm hover:bg-[#1a3d2b]/90 disabled:opacity-60">
              {uploading ? <><Loader2 size={13} className="animate-spin" /> Uploading…</> : <><CheckCircle2 size={13} /> Upload</>}
            </button>
            <button onClick={() => { setPreview(null); setPendingFile(null); }} disabled={uploading}
              className="px-3 py-2 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted/40 disabled:opacity-60">
              <X size={13} />
            </button>
          </div>
        </div>
      )}
      {err && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} />{err}</p>}
      {!preview && (
        <div className="flex gap-2">
          <label className="flex-1 flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-primary/30 rounded-xl text-xs text-primary font-semibold cursor-pointer hover:bg-primary/5">
            <Camera size={13} /> Camera
            <input type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
          <label className="flex-1 flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-border rounded-xl text-xs text-muted-foreground font-semibold cursor-pointer hover:bg-muted/30">
            <Upload size={13} /> {prescription?.photoObjectPath ? "Replace" : "Upload"}
            <input type="file" accept="image/*,application/pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
        </div>
      )}
    </div>
  );
}

// ── Appointment Card ───────────────────────────────────────────
function ApptCard({ appt, meetingLink, onJoinToggle, onPrescriptionUploaded }: {
  appt: OnlineAppt;
  meetingLink: string | null;
  onJoinToggle: (id: number, enable: boolean) => Promise<void>;
  onPrescriptionUploaded: (id: number, rx: Prescription) => void;
}) {
  const [open, setOpen] = useState(appt.joinEnabled);
  const [toggling, setToggling] = useState(false);
  const sc = STATUS_COLORS[appt.status] ?? STATUS_COLORS.confirmed;

  async function toggleJoin() {
    setToggling(true);
    await onJoinToggle(appt.id, !appt.joinEnabled);
    setToggling(false);
  }

  return (
    <div className={cn(
      "bg-white rounded-2xl border shadow-sm overflow-hidden transition-all",
      appt.joinEnabled ? "border-green-400 ring-2 ring-green-100" : "border-border"
    )}>
      <button className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/20 transition-colors"
        onClick={() => setOpen(v => !v)}>
        {/* Patient ID */}
        <div className={cn("w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0",
          appt.joinEnabled ? "bg-green-100" : "bg-blue-50")}>
          {appt.patient.patientCode ? (
            <span className="font-extrabold text-[#1a3d2b] text-xs">{appt.patient.patientCode}</span>
          ) : (
            <User size={18} className="text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
            {appt.patient.patientCode && (
              <span className="font-extrabold text-[#1a3d2b] text-sm">[{appt.patient.patientCode}]</span>
            )}
            <span className="font-bold text-sm truncate">{appt.patient.name}</span>
            {appt.joinEnabled && (
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-green-600 text-white animate-pulse">
                🟢 Live
              </span>
            )}
            <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${sc}`}>
              {appt.status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            <Calendar size={10} className="inline mr-1" />{fmtDate(appt.slot.date)}
            <Clock size={10} className="inline ml-2 mr-1" />{fmtTime(appt.slot.startTime)} – {fmtTime(appt.slot.endTime)}
          </p>
          {appt.patient.phone && <p className="text-xs text-muted-foreground mt-0.5">{appt.patient.phone}</p>}
        </div>

        {/* Enable/Disable Join button — inline */}
        <button
          onClick={e => { e.stopPropagation(); toggleJoin(); }}
          disabled={toggling || (!meetingLink && !appt.joinEnabled)}
          title={!meetingLink && !appt.joinEnabled ? "Set meeting link in Settings first" : ""}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition-all",
            appt.joinEnabled
              ? "bg-red-100 text-red-700 hover:bg-red-200 border border-red-200"
              : "bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          )}>
          {toggling ? <Loader2 size={12} className="animate-spin" /> : appt.joinEnabled ? <Square size={12} /> : <Play size={12} />}
          {appt.joinEnabled ? "End" : "Enable Join"}
        </button>

        {open ? <ChevronUp size={15} className="text-muted-foreground shrink-0 mt-1" /> : <ChevronDown size={15} className="text-muted-foreground shrink-0 mt-1" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="border-t border-border px-4 pb-5 pt-4 space-y-4">
              {/* Patient details */}
              <div className="bg-[#1a3d2b]/5 rounded-xl px-4 py-3">
                {appt.patient.patientCode && (
                  <p className="text-3xl font-extrabold text-[#1a3d2b] tracking-widest mb-1">{appt.patient.patientCode}</p>
                )}
                <p className="font-bold">{appt.patient.name}</p>
                <p className="text-xs text-muted-foreground">{appt.patient.email}</p>
                {appt.patient.phone && <p className="text-xs text-muted-foreground">{appt.patient.phone}</p>}
              </div>

              {/* Reason */}
              {appt.reason && (
                <p className="text-sm text-muted-foreground bg-muted/30 rounded-xl px-3 py-2">
                  <span className="font-medium text-foreground">Reason:</span> {appt.reason}
                </p>
              )}

              {/* Documents */}
              {appt.documents.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <FileText size={11} /> Documents ({appt.documents.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {appt.documents.map((d, i) => (
                      <a key={i} href={`${BASE}/api/storage${d.objectPath}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-1.5 font-medium hover:bg-blue-100 flex items-center gap-1.5">
                        <FileText size={11} /> {d.name}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Prescription upload */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <ImageIcon size={11} /> Prescription Photo
                </p>
                <PrescriptionUpload
                  apptId={appt.id}
                  prescription={appt.prescription}
                  onUploaded={rx => onPrescriptionUploaded(appt.id, rx)}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function AdminOnlineAppointments() {
  const [appts, setAppts] = useState<OnlineAppt[]>([]);
  const [meetingLink, setMeetingLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [list, settings] = await Promise.all([
        adminFetch("/online-appointments/admin"),
        adminFetch("/admin/settings"),
      ]);
      setAppts(list);
      setMeetingLink(settings.meetingLink ?? null);
    } catch {
      setErr("Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleJoin(id: number, enable: boolean) {
    try {
      await adminFetch(`/online-appointments/admin/${id}/${enable ? "enable-join" : "disable-join"}`, { method: "POST" });
      setAppts(prev => prev.map(a => a.id === id
        ? { ...a, joinEnabled: enable, status: enable ? "confirmed" : "completed" }
        : enable ? { ...a, joinEnabled: false } : a
      ));
    } catch {
      setErr("Action failed. Please try again.");
    }
  }

  function handlePrescriptionUploaded(id: number, rx: Prescription) {
    setAppts(prev => prev.map(a => a.id === id ? { ...a, prescription: rx } : a));
  }

  // Sort: live first, then by date desc
  const sorted = [...appts].sort((a, b) => {
    if (a.joinEnabled && !b.joinEnabled) return -1;
    if (!a.joinEnabled && b.joinEnabled) return 1;
    return new Date(b.slot.date).getTime() - new Date(a.slot.date).getTime();
  });

  const liveCount = appts.filter(a => a.joinEnabled).length;

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-foreground">Online Consultations</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Enable join meeting for each patient when doctor is ready</p>
          </div>
          <button onClick={load} className="p-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted/40">
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Meeting link banner */}
        <div className={cn(
          "rounded-2xl p-4 flex items-start gap-3 border",
          meetingLink ? "bg-blue-50 border-blue-200" : "bg-amber-50 border-amber-200"
        )}>
          <Link size={18} className={meetingLink ? "text-blue-600 shrink-0 mt-0.5" : "text-amber-600 shrink-0 mt-0.5"} />
          <div className="flex-1 min-w-0">
            {meetingLink ? (
              <>
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1">Active Meeting Link</p>
                <a href={meetingLink} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-blue-700 font-medium truncate block hover:underline flex items-center gap-1">
                  {meetingLink} <ExternalLink size={11} />
                </a>
                <p className="text-xs text-blue-600 mt-1 opacity-70">All patients will join this link when you enable join</p>
              </>
            ) : (
              <>
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">No Meeting Link Set</p>
                <p className="text-xs text-amber-700">
                  Go to <a href="/admin/settings" className="font-bold underline">Settings → Online Consultation</a> to add the Google Meet / Zoom link
                </p>
              </>
            )}
          </div>
        </div>

        {/* Live session indicator */}
        {liveCount > 0 && (
          <div className="bg-green-600 text-white rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Video size={16} />
            </div>
            <div>
              <p className="font-extrabold text-sm">Session Active</p>
              <p className="text-xs opacity-80">Doctor is currently consulting — Enable the next patient when ready</p>
            </div>
          </div>
        )}

        {err && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle size={14} /> {err}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-10 text-center">
            <Video size={36} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-semibold text-muted-foreground">No online appointments yet</p>
            <p className="text-xs text-muted-foreground mt-1">Patients can book via the patient portal</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map(appt => (
              <ApptCard
                key={appt.id}
                appt={appt}
                meetingLink={meetingLink}
                onJoinToggle={toggleJoin}
                onPrescriptionUploaded={handlePrescriptionUploaded}
              />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
