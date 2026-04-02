import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Stethoscope, LogOut, FileText, Plus, Trash2,
  Save, CheckCircle2, AlertCircle, Loader2, User, Calendar, Clock,
  StickyNote, Pill, RefreshCw, Video, UserCheck, ZoomIn, ZoomOut,
  Maximize2, X, ChevronRight, FileImage, Eye, ChevronDown
} from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";
import { cn } from "@/lib/utils";

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

type MedicineRow = { medicine: string; instructions: string };
type DocFile = { name: string; objectPath: string; contentType: string; size: number };
type Prescription = { id: number; medicines: MedicineRow[]; doctorNotes?: string | null; createdAt: string; updatedAt: string };
type Patient = { id: number; name: string; email: string; phone?: string };
type OfflinePatient = { id: number | null; name: string; email: string | null; phone: string | null };

type OnlineAppt = {
  id: number; type: "online"; status: string; reason: string | null;
  documents: DocFile[]; meetingLink: string | null; createdAt: string;
  date: string; timeLabel: string; slotId: number; patient: Patient;
  prescription: Prescription | null;
};
type OfflineAppt = {
  id: number; type: "offline"; status: string; reason: string | null;
  documents: any[]; meetingLink: null; createdAt: string;
  date: string; timeLabel: string; patient: OfflinePatient; prescription: null;
  notes: string | null;
};

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-700 border-blue-200",
  arrived: "bg-teal-100 text-teal-700 border-teal-200",
  reschedule_accepted: "bg-purple-100 text-purple-700 border-purple-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};
const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed", arrived: "Arrived", reschedule_accepted: "Rescheduled",
  completed: "Completed", cancelled: "Cancelled",
};

// ── Document Viewer ───────────────────────────────────────────
function DocumentViewer({ doc, onClose }: { doc: DocFile; onClose: () => void }) {
  const [zoom, setZoom] = useState(100);
  const viewerRef = useRef<HTMLDivElement>(null);
  const isImage = doc.contentType.startsWith("image/");
  const isPdf = doc.contentType === "application/pdf";
  const docUrl = `${BASE}/api/storage${doc.objectPath}`;

  function zoomIn() { setZoom(z => Math.min(z + 25, 300)); }
  function zoomOut() { setZoom(z => Math.max(z - 25, 25)); }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      viewerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#1a1a2e]">
      {/* Viewer toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#16213e] border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isImage ? <FileImage size={14} className="text-blue-400 shrink-0" /> : <FileText size={14} className="text-orange-400 shrink-0" />}
          <span className="text-sm font-medium text-white/90 truncate">{doc.name}</span>
          <span className="text-xs text-white/40 shrink-0">{fmtBytes(doc.size)}</span>
        </div>
        <div className="flex items-center gap-1 bg-white/10 rounded-lg px-1 py-0.5">
          <button onClick={zoomOut} className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-md transition-colors" title="Zoom out">
            <ZoomOut size={13} />
          </button>
          <span className="text-xs font-mono text-white/80 w-10 text-center">{zoom}%</span>
          <button onClick={zoomIn} className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-md transition-colors" title="Zoom in">
            <ZoomIn size={13} />
          </button>
        </div>
        <button onClick={toggleFullscreen}
          className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-md transition-colors" title="Fullscreen">
          <Maximize2 size={13} />
        </button>
        <button onClick={onClose}
          className="p-1.5 text-white/60 hover:text-red-400 hover:bg-white/10 rounded-md transition-colors" title="Close document">
          <X size={14} />
        </button>
      </div>

      {/* Document area */}
      <div ref={viewerRef} className="flex-1 overflow-auto bg-[#0f0f1a] flex items-start justify-center p-4 scrollbar-thin">
        {isImage ? (
          <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center", transition: "transform 0.15s ease" }}>
            <img src={docUrl} alt={doc.name}
              className="max-w-full rounded-lg shadow-2xl"
              style={{ maxHeight: zoom > 100 ? "none" : "calc(100vh - 160px)" }}
            />
          </div>
        ) : isPdf ? (
          <iframe
            src={`${docUrl}#zoom=${zoom}&toolbar=1&navpanes=1`}
            className="w-full rounded-lg shadow-2xl border-0"
            style={{
              height: "calc(100vh - 160px)",
              width: zoom === 100 ? "100%" : `${zoom}%`,
              minWidth: "100%",
              transition: "width 0.15s ease"
            }}
            title={doc.name}
          />
        ) : (
          <div className="flex flex-col items-center gap-4 py-16 text-white/40">
            <FileText size={48} />
            <p className="text-sm">Preview not available for this file type.</p>
            <a href={docUrl} target="_blank" rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:text-blue-300 underline">
              Open in new tab →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Left panel compact list card ──────────────────────────────
function ListCard({
  name, statusKey, time, date, reason, notes, docCount, isSelected,
  typeBadge, typeBadgeColor, onClick
}: {
  name: string; statusKey: string; time: string; date: string;
  reason?: string | null; notes?: string | null; docCount: number;
  isSelected: boolean; typeBadge: string; typeBadgeColor: string; onClick: () => void;
}) {
  const sc = STATUS_COLORS[statusKey] ?? STATUS_COLORS["confirmed"];
  return (
    <button onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-3 border-b border-border/60 transition-all hover:bg-muted/40 flex items-start gap-3 group",
        isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"
      )}
    >
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors",
        isSelected ? "bg-primary text-white" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
      )}>
        <User size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <span className="text-base font-bold text-foreground truncate">{name}</span>
          {docCount > 0 && (
            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5">
              <FileText size={9} /> {docCount} doc{docCount !== 1 && "s"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <span className={cn("text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border", typeBadgeColor)}>
            {typeBadge}
          </span>
          <span className={cn("text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border", sc)}>
            {STATUS_LABELS[statusKey] ?? statusKey}
          </span>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Calendar size={11} /> {date}
          <Clock size={11} className="ml-1" /> {time}
        </p>
        {(reason || notes) && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate italic opacity-70">
            {notes ?? reason}
          </p>
        )}
      </div>
      <ChevronRight size={12} className={cn("shrink-0 mt-2 transition-colors", isSelected ? "text-primary" : "text-muted-foreground/40")} />
    </button>
  );
}

// ── Right panel: Online patient detail + Rx + docs ────────────
function OnlineDetailPanel({
  appt, onUpdated, onOpenDoc
}: {
  appt: OnlineAppt;
  onUpdated: (a: OnlineAppt) => void;
  onOpenDoc: (doc: DocFile) => void;
}) {
  const [medicines, setMedicines] = useState<MedicineRow[]>(
    appt.prescription?.medicines?.length ? appt.prescription.medicines : [{ medicine: "", instructions: "" }]
  );
  const [notes, setNotes] = useState<string>(appt.prescription?.doctorNotes ?? "");
  const [savingRx, setSavingRx] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [rxResult, setRxResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [notesResult, setNotesResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [rxOpen, setRxOpen] = useState(true);

  useEffect(() => {
    setMedicines(appt.prescription?.medicines?.length ? appt.prescription.medicines : [{ medicine: "", instructions: "" }]);
    setNotes(appt.prescription?.doctorNotes ?? "");
    setRxResult(null);
    setNotesResult(null);
  }, [appt.id]);

  function addRow() { setMedicines(m => [...m, { medicine: "", instructions: "" }]); }
  function removeRow(i: number) { setMedicines(m => m.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, k: keyof MedicineRow) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setMedicines(m => m.map((row, idx) => idx === i ? { ...row, [k]: e.target.value } : row));
  }

  async function savePrescription() {
    const valid = medicines.filter(m => m.medicine.trim());
    if (valid.length === 0) { setRxResult({ ok: false, msg: "Add at least one medicine." }); return; }
    setSavingRx(true); setRxResult(null);
    try {
      await doctorFetch(`/appointments/${appt.id}/prescription`, {
        method: "PUT", body: JSON.stringify({ medicines: valid }),
      });
      setRxResult({ ok: true, msg: "Saved!" });
      onUpdated({ ...appt, status: "completed", prescription: { ...appt.prescription!, medicines: valid } });
    } catch { setRxResult({ ok: false, msg: "Failed to save." }); }
    finally { setSavingRx(false); }
  }

  async function saveNotes() {
    setSavingNotes(true); setNotesResult(null);
    try {
      await doctorFetch(`/appointments/${appt.id}/notes`, {
        method: "PUT", body: JSON.stringify({ notes }),
      });
      setNotesResult({ ok: true, msg: "Notes saved!" });
    } catch { setNotesResult({ ok: false, msg: "Failed." }); }
    finally { setSavingNotes(false); }
  }

  const inputCls = "w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white";
  const sc = STATUS_COLORS[appt.status] ?? STATUS_COLORS["confirmed"];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50">
      {/* Patient header */}
      <div className="bg-white border-b border-border px-6 py-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
            <User size={20} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-foreground">{appt.patient.name}</h2>
              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">Online</span>
              <span className={cn("text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border", sc)}>
                {STATUS_LABELS[appt.status] ?? appt.status}
              </span>
              {appt.prescription && (
                <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 flex items-center gap-1">
                  <Pill size={8} /> Rx Saved
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{appt.patient.email}{appt.patient.phone && ` · ${appt.patient.phone}`}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Calendar size={10} /> {fmtDate(appt.date)} <Clock size={10} className="ml-1" /> {appt.timeLabel}
            </p>
          </div>
        </div>
        {appt.reason && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <p className="text-xs font-semibold text-amber-800 mb-0.5">Reason for consultation</p>
            <p className="text-sm text-amber-900">{appt.reason}</p>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Documents */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
            <FileText size={14} className="text-primary" />
            <span className="text-sm font-bold text-foreground">Patient Documents</span>
            <span className="ml-auto text-xs text-muted-foreground">{appt.documents.length} file{appt.documents.length !== 1 && "s"}</span>
          </div>
          {appt.documents.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <FileText size={24} className="mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">No documents uploaded</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {appt.documents.map((doc, i) => (
                <button key={i} onClick={() => onOpenDoc(doc)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-primary/5 transition-colors group">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                    {doc.contentType.startsWith("image/") ? <FileImage size={14} className="text-blue-600" /> : <FileText size={14} className="text-blue-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                    <p className="text-[10px] text-muted-foreground">{fmtBytes(doc.size)} · {doc.contentType.split("/")[1]?.toUpperCase()}</p>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                    <Eye size={10} /> View
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Prescription */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <button onClick={() => setRxOpen(v => !v)}
            className="w-full px-4 py-3 border-b border-border/60 flex items-center gap-2 hover:bg-muted/20 transition-colors">
            <Pill size={14} className="text-primary" />
            <span className="text-sm font-bold text-foreground">Prescription</span>
            <ChevronDown size={14} className={cn("ml-auto text-muted-foreground transition-transform", rxOpen && "rotate-180")} />
          </button>
          {rxOpen && (
            <div className="p-4 space-y-3">
              {medicines.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start">
                  <input value={row.medicine} onChange={updateRow(i, "medicine")}
                    placeholder={`Medicine ${i + 1}`} className={inputCls} />
                  <input value={row.instructions} onChange={updateRow(i, "instructions")}
                    placeholder="Dosage & instructions" className={inputCls} />
                  <button onClick={() => removeRow(i)} disabled={medicines.length === 1}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 mt-0.5">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-3 pt-1">
                <button onClick={addRow}
                  className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:text-primary/80 transition-colors">
                  <Plus size={12} /> Add Medicine
                </button>
                <button onClick={savePrescription} disabled={savingRx}
                  className="flex items-center gap-1.5 ml-auto px-4 py-2 bg-[#1a3d2b] text-white rounded-xl text-xs font-bold hover:bg-[#1a3d2b]/90 transition-colors disabled:opacity-60">
                  {savingRx ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  {savingRx ? "Saving…" : "Save Prescription"}
                </button>
                {rxResult && (
                  <span className={cn("flex items-center gap-1 text-xs", rxResult.ok ? "text-green-700" : "text-red-600")}>
                    {rxResult.ok ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />} {rxResult.msg}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Private Notes */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
            <StickyNote size={14} className="text-amber-600" />
            <span className="text-sm font-bold text-foreground">Private Notes</span>
            <span className="text-[10px] text-muted-foreground ml-1">(not visible to patient)</span>
          </div>
          <div className="p-4">
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Internal notes for this patient…"
              className={cn(inputCls, "resize-none")} />
            <div className="flex items-center gap-3 mt-2">
              <button onClick={saveNotes} disabled={savingNotes}
                className="flex items-center gap-1.5 px-4 py-2 bg-muted border border-border text-foreground rounded-xl text-xs font-semibold hover:bg-muted/80 transition-colors disabled:opacity-60">
                {savingNotes ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {savingNotes ? "Saving…" : "Save Notes"}
              </button>
              {notesResult && (
                <span className={cn("flex items-center gap-1 text-xs", notesResult.ok ? "text-green-700" : "text-red-600")}>
                  {notesResult.ok ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />} {notesResult.msg}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Right panel: Offline patient detail ───────────────────────
function OfflineDetailPanel({
  appt, onDone
}: {
  appt: OfflineAppt;
  onDone: (id: number) => void;
}) {
  const [marking, setMarking] = useState(false);
  const [doctorNotes, setDoctorNotes] = useState(appt.notes ?? "");
  const sc = STATUS_COLORS[appt.status] ?? STATUS_COLORS["confirmed"];

  useEffect(() => { setDoctorNotes(appt.notes ?? ""); }, [appt.id]);

  async function markDone() {
    setMarking(true);
    try {
      await doctorFetch(`/offline-appointments/${appt.id}/done`, { method: "PATCH" });
      onDone(appt.id);
    } catch { /* ignore */ }
    finally { setMarking(false); }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50">
      {/* Patient header */}
      <div className="bg-white border-b border-border px-6 py-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
            <UserCheck size={20} className="text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-foreground">{appt.patient.name}</h2>
              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">In-Person</span>
              <span className={cn("text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border", sc)}>
                {STATUS_LABELS[appt.status] ?? appt.status}
              </span>
            </div>
            {appt.patient.phone && <p className="text-xs text-muted-foreground mt-0.5">{appt.patient.phone}</p>}
            {appt.patient.email && <p className="text-xs text-muted-foreground">{appt.patient.email}</p>}
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Calendar size={10} /> {fmtDate(appt.date)} <Clock size={10} className="ml-1" /> {appt.timeLabel}
            </p>
          </div>
          {["confirmed", "arrived", "reschedule_accepted"].includes(appt.status) && (
            <button onClick={markDone} disabled={marking}
              className="shrink-0 flex items-center gap-1.5 bg-green-600 text-white text-xs font-bold px-3 py-2.5 rounded-xl hover:bg-green-700 transition-colors disabled:opacity-60">
              {marking ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              Mark Done
            </button>
          )}
        </div>
        {appt.reason && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <p className="text-xs font-semibold text-amber-800 mb-0.5">Reason</p>
            <p className="text-sm text-amber-900">{appt.reason}</p>
          </div>
        )}
      </div>

      {/* Notes display */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
            <StickyNote size={14} className="text-amber-600" />
            <span className="text-sm font-bold text-foreground">Doctor's Notes</span>
          </div>
          <div className="p-4">
            {doctorNotes ? (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{doctorNotes}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No notes recorded for this patient.</p>
            )}
          </div>
        </div>

        {/* No documents for offline */}
        <div className="mt-4 bg-white rounded-2xl border border-dashed border-border p-6 text-center">
          <FileText size={28} className="mx-auto mb-2 text-muted-foreground/25" />
          <p className="text-xs text-muted-foreground">In-person visits don't have uploaded documents.</p>
        </div>
      </div>
    </div>
  );
}

// ── Empty state panel ──────────────────────────────────────────
function EmptyPanel({ type }: { type: "online" | "offline" }) {
  return (
    <div className="h-full flex items-center justify-center bg-gray-50/80">
      <div className="text-center">
        <div className="w-20 h-20 rounded-3xl bg-primary/5 border border-primary/10 flex items-center justify-center mx-auto mb-4">
          {type === "online" ? <Video size={32} className="text-primary/30" /> : <UserCheck size={32} className="text-primary/30" />}
        </div>
        <p className="text-base font-semibold text-muted-foreground">Select a patient</p>
        <p className="text-sm text-muted-foreground/60 mt-1">Click any appointment on the left to view details<br />and open patient documents here</p>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function DoctorAppointments() {
  const [, navigate] = useLocation();
  const [onlineAppts, setOnlineAppts] = useState<OnlineAppt[]>([]);
  const [offlineAppts, setOfflineAppts] = useState<OfflineAppt[]>([]);
  const [mainTab, setMainTab] = useState<"online" | "offline">("online");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "confirmed" | "completed">("all");
  const [selectedOnlineId, setSelectedOnlineId] = useState<number | null>(null);
  const [selectedOfflineId, setSelectedOfflineId] = useState<number | null>(null);
  const [activeDoc, setActiveDoc] = useState<DocFile | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await doctorFetch("/all-appointments");
      setOnlineAppts(data.online ?? []);
      setOfflineAppts(data.offline ?? []);
    } catch (err: any) {
      if (err?.error === "unauthorized") navigate("/doctor");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  async function logout() {
    await doctorFetch("/logout", { method: "POST" });
    navigate("/doctor");
  }

  function updateOnline(updated: OnlineAppt) {
    setOnlineAppts(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a));
  }
  function markOfflineDone(id: number) {
    setOfflineAppts(prev => prev.map(a => a.id === id ? { ...a, status: "completed" } : a));
  }

  const shownOnline = filter === "all" ? onlineAppts : onlineAppts.filter(a => a.status === filter);
  const selectedOnline = onlineAppts.find(a => a.id === selectedOnlineId) ?? null;
  const selectedOffline = offlineAppts.find(a => a.id === selectedOfflineId) ?? null;

  const confirmedCount = onlineAppts.filter(a => a.status === "confirmed").length
    + offlineAppts.filter(a => ["confirmed", "arrived"].includes(a.status)).length;
  const completedCount = onlineAppts.filter(a => a.status === "completed").length
    + offlineAppts.filter(a => a.status === "completed").length;

  function handleSelectOnline(id: number) {
    setSelectedOnlineId(id);
    setActiveDoc(null);
  }
  function handleSelectOffline(id: number) {
    setSelectedOfflineId(id);
    setActiveDoc(null);
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="bg-[#1a3d2b] text-white px-4 py-2 flex items-center gap-4 shrink-0 shadow-lg z-40">
        <img src={logoImg} alt="Susruta Hospital" className="h-8 w-auto object-contain brightness-200" />
        <div className="hidden sm:block">
          <p className="text-[10px] text-green-300 font-medium">Doctor Portal</p>
          <p className="text-sm font-bold">Dr. P. Murali Krishna</p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={load} disabled={loading}
            className="p-2 rounded-xl text-white/60 hover:bg-white/10 hover:text-white transition-colors">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 rounded-xl transition-colors font-medium">
            <LogOut size={14} /> Logout
          </button>
        </div>
      </header>

      {/* ── Body: Left + Right panels ────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left Panel ─────────────────────────────────────── */}
        <div className="w-[380px] flex flex-col border-r border-border bg-white shrink-0 overflow-hidden">
          {/* Type tabs */}
          <div className="grid grid-cols-2 border-b border-border shrink-0">
            <button onClick={() => { setMainTab("online"); setActiveDoc(null); }}
              className={cn("flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-all border-b-2",
                mainTab === "online" ? "border-blue-600 text-blue-700 bg-blue-50" : "border-transparent text-muted-foreground hover:bg-muted/50")}>
              <Video size={12} /> Online
              <span className={cn("text-[9px] font-bold px-1 py-0.5 rounded-full",
                mainTab === "online" ? "bg-blue-200 text-blue-800" : "bg-muted text-muted-foreground")}>
                {onlineAppts.length}
              </span>
            </button>
            <button onClick={() => { setMainTab("offline"); setActiveDoc(null); }}
              className={cn("flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-all border-b-2",
                mainTab === "offline" ? "border-orange-500 text-orange-700 bg-orange-50" : "border-transparent text-muted-foreground hover:bg-muted/50")}>
              <UserCheck size={12} /> In-Person
              <span className={cn("text-[9px] font-bold px-1 py-0.5 rounded-full",
                mainTab === "offline" ? "bg-orange-200 text-orange-800" : "bg-muted text-muted-foreground")}>
                {offlineAppts.length}
              </span>
            </button>
          </div>

          {/* Sub-filter for online */}
          {mainTab === "online" && (
            <div className="grid grid-cols-3 bg-muted/30 border-b border-border shrink-0">
              {([["all", "All"], ["confirmed", "Pending"], ["completed", "Done"]] as const).map(([val, label]) => (
                <button key={val} onClick={() => setFilter(val)}
                  className={cn("py-1.5 text-[10px] font-semibold transition-colors",
                    filter === val ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-xs">Loading…</span>
              </div>
            ) : mainTab === "online" ? (
              shownOnline.length === 0 ? (
                <div className="text-center py-12">
                  <Video size={28} className="mx-auto mb-2 text-muted-foreground/25" />
                  <p className="text-xs text-muted-foreground">No appointments</p>
                </div>
              ) : shownOnline.map(a => (
                <ListCard key={a.id}
                  name={a.patient.name} statusKey={a.status}
                  time={a.timeLabel} date={fmtDate(a.date)}
                  reason={a.reason} docCount={a.documents.length}
                  typeBadge="Online" typeBadgeColor="bg-blue-50 text-blue-700 border-blue-200"
                  isSelected={selectedOnlineId === a.id}
                  onClick={() => handleSelectOnline(a.id)}
                />
              ))
            ) : (
              offlineAppts.length === 0 ? (
                <div className="text-center py-12">
                  <UserCheck size={28} className="mx-auto mb-2 text-muted-foreground/25" />
                  <p className="text-xs text-muted-foreground">No appointments</p>
                </div>
              ) : offlineAppts.map(a => (
                <ListCard key={a.id}
                  name={a.patient.name} statusKey={a.status}
                  time={a.timeLabel} date={fmtDate(a.date)}
                  reason={a.reason} notes={a.notes} docCount={0}
                  typeBadge="In-Person" typeBadgeColor="bg-orange-50 text-orange-700 border-orange-200"
                  isSelected={selectedOfflineId === a.id}
                  onClick={() => handleSelectOffline(a.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Right Panel ────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            {activeDoc ? (
              <motion.div key="docviewer" className="h-full"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.18 }}>
                <DocumentViewer doc={activeDoc} onClose={() => setActiveDoc(null)} />
              </motion.div>
            ) : mainTab === "online" && selectedOnline ? (
              <motion.div key={`online-${selectedOnline.id}`} className="h-full"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}>
                <OnlineDetailPanel
                  appt={selectedOnline}
                  onUpdated={updateOnline}
                  onOpenDoc={(doc) => setActiveDoc(doc)}
                />
              </motion.div>
            ) : mainTab === "offline" && selectedOffline ? (
              <motion.div key={`offline-${selectedOffline.id}`} className="h-full"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}>
                <OfflineDetailPanel appt={selectedOffline} onDone={markOfflineDone} />
              </motion.div>
            ) : (
              <motion.div key="empty" className="h-full"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <EmptyPanel type={mainTab} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
