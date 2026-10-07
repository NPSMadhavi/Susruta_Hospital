import React, { useState, useEffect, useRef, useCallback } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminToastContainer } from "@/components/admin/AdminToast";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, XCircle, Clock, Banknote, Smartphone,
  Calendar, RefreshCw, Bell, BellOff, UserCheck, ChevronDown, ChevronUp, X,
  Video, Loader2, Camera, Upload, ImageIcon, Play, Square,
  AlertCircle, FileText, MapPin, User, Mic, Eye, RotateCcw, Trash2, Users, Printer
} from "lucide-react";
import QRCode from "qrcode";
import logoImg from "@assets/logo_1773840200056.png";
import { format, parseISO } from "date-fns";

import { AdminVideoRoom } from "@/components/VideoCall";
import { cn } from "@/lib/utils";
import { todayIST, fmtTimestamp, fmtTimeIST } from "@/lib/ist";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { playAppointmentChime } from "@/lib/sound";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

type ParticipantPerm = {
  name: string;
  role: "patient" | "guest";
  camera: boolean | null;
  mic: boolean | null;
  updatedAt: number;
};

function PermBadge({ icon, granted }: { icon: "cam" | "mic"; granted: boolean | null }) {
  const Icon = icon === "cam" ? Camera : Mic;
  if (granted === true) return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
      <Icon size={9} /> ✓
    </span>
  );
  if (granted === false) return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-500 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
      <Icon size={9} /> ✗
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-gray-400 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">
      <Icon size={9} /> ?
    </span>
  );
}

function GuestCountBadge({ apptId }: { apptId: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    async function fetchQueue() {
      try {
        const r = await fetch(`${BASE}/api/guest/status/${apptId}`);
        if (!r.ok || !alive) return;
        const { waitingCount } = await r.json();
        if (alive) setCount(waitingCount ?? 0);
      } catch {}
    }
    fetchQueue();
    return () => { alive = false; };
  }, [apptId]);
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
      <Users size={9} /> {count} guest{count !== 1 ? "s" : ""} waiting
    </span>
  );
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  try {
    const res = await fetch(`${API}${path}`, { credentials: "include", headers: { "Content-Type": "application/json", ...opts.headers }, ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || `API Error (${res.status})`);
    return data;
  } catch (err: any) {
    if (err?.name === "TypeError" && err?.message?.includes("fetch")) {
      throw new Error("Backend server connection failed. Please start the app using npm run dev.");
    }
    throw err;
  }
}

// ── Audio chime ─────────────────────────────────────────────────
function playChime() {
  playAppointmentChime();
}

// ── Types ────────────────────────────────────────────────────────
type Appt = {
  id: number; patientName: string; patientPhone: string; patientEmail?: string;
  date: string; timeSlot: string; reason?: string; status: string; notes?: string;
  arrivedAt?: string; paymentStatus: string; paymentMode?: string;
  rescheduleDates?: string; rescheduleChosen?: string; followUpDate?: string;
  followUpConfirmed: boolean; createdAt: string;
};
type DocFile = { name: string; objectPath: string; contentType: string; size: number };
type Prescription = { photoObjectPath: string | null; notes: string | null; updatedAt: string };
type OnlineAppt = {
  id: number; status: string; reason: string | null;
  documents: DocFile[]; joinEnabled: boolean; joinEnabledAt: string | null;
  patientJoinedAt: string | null; createdAt: string;
  slot: { id: number; date: string; startTime: string; endTime: string };
  patient: { id: number; patientCode: string | null; name: string; email: string; phone: string | null };
  prescription: Prescription | null;
  permissions: ParticipantPerm[];
};

// ── Helpers ──────────────────────────────────────────────────────
const IST = "Asia/Kolkata";
function fmt(date: string) {
  return new Date(date + "T00:00:00+05:30").toLocaleDateString("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short" });
}
function fmtFull(date: string) {
  return new Date(date + "T00:00:00+05:30").toLocaleDateString("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// ── In-Person Status configs ─────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  confirmed: "bg-blue-100 text-blue-800 border-blue-300",
  reschedule_proposed: "bg-orange-100 text-orange-800 border-orange-300",
  reschedule_accepted: "bg-purple-100 text-purple-800 border-purple-300",
  arrived: "bg-teal-100 text-teal-800 border-teal-300",
  completed: "bg-green-100 text-green-800 border-green-300",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  missed: "bg-gray-100 text-gray-600 border-gray-200",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed", reschedule_proposed: "Reschedule Proposed",
  reschedule_accepted: "Reschedule Accepted", arrived: "Arrived", completed: "Completed",
  cancelled: "Cancelled", missed: "Missed",
};
const ONLINE_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  confirmed: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};

// ── Modals (In-Person) ───────────────────────────────────────────
function OfflineReceiptModal({ appt, onClose }: { appt: Appt; onClose: () => void }) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");

  let notesObj: any = {};
  if (appt.notes) {
    try {
      notesObj = JSON.parse(appt.notes);
    } catch {
      notesObj = {};
    }
  }

  const token = (appt as any).token || notesObj.token || `T${String(appt.id).padStart(3, "0")}`;
  const patientCode = (appt as any).patientCode || notesObj.patientCode || "—";
  const amount = (appt as any).amount || notesObj.amount || 200;
  const paymentThrough = ((appt as any).paymentThrough || notesObj.paymentThrough || appt.paymentMode || "UPI").toUpperCase();
  const age = (appt as any).age !== undefined ? (appt as any).age : notesObj.age;
  const gender = (appt as any).gender || notesObj.gender;
  const address = (appt as any).address || notesObj.address;

  const uploadToken = (appt as any).uploadToken || notesObj.uploadToken;

  useEffect(() => {
    const uploadFullUrl = uploadToken
      ? `${window.location.origin}/patient/offline-upload/${uploadToken}`
      : `${window.location.origin}/portal`;

    QRCode.toDataURL(uploadFullUrl, {
      width: 140,
      margin: 1,
      color: {
        dark: "#1E293B",
        light: "#FFFFFF",
      },
    })
      .then((url) => setQrCodeUrl(url))
      .catch((err) => console.error("QR Code error:", err));
  }, [uploadToken]);

  function maskPhone(p?: string) {
    if (!p) return "N/A";
    const clean = p.replace(/\D/g, "");
    if (clean.length >= 10) {
      const start = clean.slice(-10, -5);
      return `${start} XXXXX`;
    }
    return p;
  }

  function formatShortDate(d?: string) {
    if (!d) return "";
    try {
      return format(parseISO(d), "dd MMM yyyy").toUpperCase();
    } catch {
      return d;
    }
  }

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4">
      <div className="bg-white rounded-2xl border border-[#EDEFEB] shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#EDEFEB] shrink-0 bg-white">
          <h3 className="font-bold text-sm text-[#1E293B] tracking-wide">
            Print Receipt
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#94A3B8] hover:text-[#334155] p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Receipt Body with Scrolling */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div id="printable-receipt" className="border border-[#EDEFEB] rounded-2xl p-5 sm:p-6 bg-white shadow-xs text-center">
            {/* Hospital Logo */}
            <div className="flex justify-center mb-2.5">
              <img
                src={logoImg}
                alt="Susruta Hospital"
                className="h-10 w-auto max-w-[210px] object-contain mx-auto"
              />
            </div>
            <p className="text-xs text-[#64748B] mt-1 leading-relaxed text-center">
              119, Ramulavari North Mada Street, Tirupati – 517 507
            </p>

            {/* Dashed divider */}
            <div className="border-t border-dashed border-[#CBD5E1] my-4" />

            <p className="text-[11px] font-bold text-[#475569] uppercase tracking-wider text-center">
              OFFLINE APPOINTMENT RECEIPT
            </p>
            <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-widest mt-1 text-center">
              TOKEN NUMBER
            </p>
            <h1 className="text-4xl font-extrabold text-[#D95B2F] tracking-tight mt-1 mb-1 text-center">
              {token}
            </h1>

            {/* Dashed divider */}
            <div className="border-t border-dashed border-[#CBD5E1] my-4" />

            {/* Key-Value Details */}
            <div className="receipt-info-table space-y-2.5 my-4 text-xs">
              <div className="receipt-row flex items-center justify-between">
                <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                  PATIENT ID
                </span>
                <span className="receipt-value font-bold text-[#1E293B] font-mono text-right text-xs break-all pl-2">
                  {patientCode}
                </span>
              </div>

              <div className="receipt-row flex items-center justify-between">
                <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                  PATIENT NAME
                </span>
                <span className="receipt-value font-bold text-[#1E293B] text-right text-xs break-words pl-2">
                  {appt.patientName}
                </span>
              </div>

              <div className="receipt-row flex items-center justify-between">
                <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                  PHONE NUMBER
                </span>
                <span className="receipt-value font-bold text-[#1E293B] text-right text-xs break-words pl-2 font-mono">
                  {maskPhone(appt.patientPhone)}
                </span>
              </div>

              {age !== undefined && age !== null && (
                <div className="receipt-row flex items-center justify-between">
                  <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                    AGE / GENDER
                  </span>
                  <span className="receipt-value font-bold text-[#1E293B] text-right text-xs break-words pl-2">
                    {age} yrs {gender ? `/ ${gender}` : ""}
                  </span>
                </div>
              )}

              {address && (
                <div className="receipt-row flex items-center justify-between">
                  <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                    ADDRESS
                  </span>
                  <span className="receipt-value font-bold text-[#1E293B] text-right text-xs break-words pl-2">
                    {address}
                  </span>
                </div>
              )}

              {appt.patientEmail && (
                <div className="receipt-row flex items-center justify-between">
                  <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                    EMAIL
                  </span>
                  <span className="receipt-value font-bold text-[#1E293B] text-right text-xs break-words pl-2">
                    {appt.patientEmail}
                  </span>
                </div>
              )}

              <div className="receipt-row flex items-center justify-between">
                <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                  DATE
                </span>
                <span className="receipt-value font-bold text-[#1E293B] text-right text-xs pl-2">
                  {formatShortDate(appt.date)}
                </span>
              </div>

              <div className="receipt-row flex items-center justify-between">
                <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                  SLOT
                </span>
                <span className="receipt-value font-bold text-[#1E293B] text-right text-xs pl-2">
                  {appt.timeSlot}
                </span>
              </div>

              <div className="receipt-row flex items-center justify-between">
                <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                  AMOUNT
                </span>
                <span className="receipt-value font-bold text-[#1E293B] text-right text-xs pl-2">
                  ₹{amount}
                </span>
              </div>

              <div className="receipt-row flex items-center justify-between">
                <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                  PAYMENT
                </span>
                <span className="receipt-value font-bold text-emerald-700 text-right text-xs pl-2">
                  PAID
                </span>
              </div>

              <div className="receipt-row flex items-center justify-between">
                <span className="receipt-label font-bold text-[#64748B] uppercase tracking-wider text-[11px] text-left shrink-0">
                  PAYMENT THROUGH
                </span>
                <span className="receipt-value font-bold text-[#1E293B] text-right text-xs pl-2 uppercase">
                  {paymentThrough}
                </span>
              </div>
            </div>

            {/* Dashed divider */}
            <div className="border-t border-dashed border-[#CBD5E1] my-4" />

            {/* QR Code */}
            <div className="py-1 text-center">
              {qrCodeUrl ? (
                <img
                  src={qrCodeUrl}
                  alt={`Token ${token} QR Code`}
                  className="w-32 h-32 mx-auto rounded-lg"
                />
              ) : (
                <div className="w-32 h-32 mx-auto bg-slate-100 rounded-lg flex items-center justify-center text-xs text-slate-400">
                  Generating QR...
                </div>
              )}

              <p className="font-bold text-xs text-[#1E293B] tracking-wider uppercase mt-2 text-center">
                TOKEN: {token}
              </p>
              <p className="text-[11px] font-semibold text-[#D95B2F] mt-1.5 max-w-[260px] mx-auto leading-tight text-center">
                Scan this QR code to upload medical documents for your offline consultation.
              </p>
              <p className="text-[10px] text-[#64748B] mt-0.5 text-center">
                QR access expires after 24 hours.
              </p>
            </div>

            {/* Dashed divider */}
            <div className="border-t border-dashed border-[#CBD5E1] my-4" />

            <p className="text-xs text-[#94A3B8] italic text-center">
              Thank you for choosing Susruta Hospital.
            </p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-3.5 border-t border-[#EDEFEB] bg-slate-50/70 shrink-0">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#D95B2F] hover:bg-[#c04e26] text-white text-xs font-bold tracking-wide shadow-sm transition-all cursor-pointer"
          >
            <Printer size={15} />
            Print Receipt
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-[#CBD5E1] hover:bg-slate-100 text-[#475569] text-xs font-bold tracking-wide transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function PayModal({ appt, onClose, onPaid }: { appt: Appt; onClose: () => void; onPaid: (a: Appt) => void }) {
  const [mode, setMode] = useState<"cash" | "upi">("cash");
  const [loading, setLoading] = useState(false);
  async function pay() {
    setLoading(true);
    const updated = await apiFetch(`/appointments/${appt.id}/pay`, { method: "PATCH", body: JSON.stringify({ mode }) });
    onPaid(updated); onClose(); setLoading(false);
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-sans font-bold text-lg mb-1">Record Payment</h3>
        <p className="text-muted-foreground text-sm mb-6">{appt.patientName} · {fmt(appt.date)} {appt.timeSlot}</p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {(["cash", "upi"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={cn("py-4 rounded-2xl border-2 font-semibold flex flex-col items-center gap-2 transition-all",
                mode === m ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/30")}>
              {m === "cash" ? <Banknote size={22} /> : <Smartphone size={22} />}
              <span className="text-sm">{m === "cash" ? "Cash" : "UPI"}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border border-border rounded-xl text-sm font-semibold text-muted-foreground">Cancel</button>
          <button onClick={pay} disabled={loading}
            className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-bold disabled:opacity-60">
            {loading ? "..." : "Confirm Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RescheduleModal({ appt, onClose, onProposed }: { appt: Appt; onClose: () => void; onProposed: (a: Appt) => void }) {
  const [dates, setDates] = useState<string[]>(["", "", ""]);
  const [loading, setLoading] = useState(false);
  const today = todayIST();
  async function propose() {
    const valid = dates.filter(Boolean);
    if (!valid.length) return;
    setLoading(true);
    const updated = await apiFetch(`/appointments/${appt.id}/reschedule`, { method: "PATCH", body: JSON.stringify({ dates: valid }) });
    onProposed(updated); onClose(); setLoading(false);
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-sans font-bold text-lg mb-1">Propose Reschedule</h3>
        <p className="text-muted-foreground text-sm mb-5">Offer up to 3 alternative dates for the patient to choose from.</p>
        <div className="space-y-3 mb-6">
          {dates.map((d, i) => (
            <div key={i}>
              <label className="text-xs text-muted-foreground mb-1 block">Option {i + 1}{i > 0 && " (optional)"}</label>
              <input type="date" min={today} value={d} onChange={(e) => setDates(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border border-border rounded-xl text-sm font-semibold text-muted-foreground">Cancel</button>
          <button onClick={propose} disabled={loading || !dates.some(Boolean)}
            className="flex-1 py-3 bg-orange-600 text-white rounded-xl text-sm font-bold disabled:opacity-60">
            {loading ? "..." : "Send Proposal"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FollowUpModal({ appt, onClose, onSet }: { appt: Appt; onClose: () => void; onSet: (a: Appt) => void }) {
  const [date, setDate] = useState(appt.followUpDate || "");
  const [loading, setLoading] = useState(false);
  const today = todayIST();
  async function save() {
    if (!date) return;
    setLoading(true);
    const updated = await apiFetch(`/appointments/${appt.id}/followup`, { method: "PATCH", body: JSON.stringify({ followUpDate: date }) });
    onSet(updated); onClose(); setLoading(false);
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs p-6">
        <h3 className="font-sans font-bold text-lg mb-4">Set Follow-up Date</h3>
        <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)}
          className="w-full border border-border rounded-xl px-3 py-2.5 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-primary/20" />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border border-border rounded-xl text-sm font-semibold text-muted-foreground">Cancel</button>
          <button onClick={save} disabled={!date || loading}
            className="flex-1 py-3 bg-primary text-white rounded-xl text-sm font-bold disabled:opacity-60">
            {loading ? "..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OfflineDeleteConfirmModal({
  appt,
  onClose,
  onConfirm,
}: {
  appt: Appt;
  onClose: () => void;
  onConfirm: (id: number) => void;
}) {
  const patientId = (appt as any).patientCode || "—";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-border shadow-2xl w-full max-w-sm overflow-hidden p-6">
        <div className="flex items-center gap-3 text-red-600 mb-3">
          <div className="p-3 bg-red-100 rounded-2xl">
            <Trash2 size={22} />
          </div>
          <div>
            <h3 className="font-bold text-base text-foreground">Delete Appointment</h3>
            <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed my-4">
          Are you sure you want to permanently delete the offline appointment for{" "}
          <span className="font-bold text-foreground">{appt.patientName}</span> ({patientId})?
        </p>

        <div className="flex gap-2 justify-end mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm(appt.id);
              onClose();
            }}
            className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function OfflineCancelConfirmModal({
  appt,
  onClose,
  onConfirm,
}: {
  appt: Appt;
  onClose: () => void;
  onConfirm: (id: number) => void;
}) {
  const isPending = appt.status === "pending";
  const actionName = isPending ? "Decline" : "Cancel";
  const patientId = (appt as any).patientCode || "—";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-border shadow-2xl w-full max-w-sm overflow-hidden p-6">
        <div className="flex items-center gap-3 text-red-600 mb-3">
          <div className="p-3 bg-red-100 rounded-2xl">
            <XCircle size={22} />
          </div>
          <div>
            <h3 className="font-bold text-base text-foreground">{actionName} Appointment</h3>
            <p className="text-xs text-muted-foreground">
              {isPending ? "The appointment request will be declined." : "The appointment will be marked as cancelled."}
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed my-4">
          Are you sure you want to {actionName.toLowerCase()} the appointment for{" "}
          <span className="font-bold text-foreground">{appt.patientName}</span> ({patientId})?
        </p>

        <div className="flex gap-2 justify-end mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Keep Appointment
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm(appt.id);
              onClose();
            }}
            className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer"
          >
            {actionName} Appointment
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Prescription Upload (Online) ─────────────────────────────────
function PrescriptionUpload({ apptId, prescription, onUploaded }: {
  apptId: number; prescription: Prescription | null; onUploaded: (rx: Prescription) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [uploaded, setUploaded] = useState(false);

  function handleFile(file: File) { setErr(""); setUploaded(false); setPreview(URL.createObjectURL(file)); setPendingFile(file); }

  async function confirmUpload() {
    if (!pendingFile) return;
    setUploading(true); setErr("");
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
      const saveRes = await fetch(`${BASE}/api/online-appointments/admin/${apptId}/prescription`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoObjectPath: objectPath }),
      });
      if (!saveRes.ok) throw new Error("Save failed");
      const rx = await saveRes.json();
      setUploaded(true);
      setTimeout(() => { setPreview(null); setPendingFile(null); setUploaded(false); onUploaded(rx); }, 800);
    } catch (e: any) { setErr(e.message || "Upload failed"); }
    finally { setUploading(false); }
  }

  const existingImg = prescription?.photoObjectPath
    ? `${BASE}/api/storage${prescription.photoObjectPath}`
    : null;

  return (
    <div className="space-y-3">
      {/* Preview selected file */}
      {preview ? (
        <div className="space-y-3">
          <div className="relative rounded-2xl overflow-hidden border-2 border-[#1a3d2b]/25 bg-gray-50 shadow-sm">
            <img src={preview} alt="Preview" className="w-full max-h-52 object-contain" />
            {!uploading && !uploaded && (
              <button
                onClick={() => { setPreview(null); setPendingFile(null); }}
                className="absolute top-2 right-2 w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
              >
                <X size={13} />
              </button>
            )}
          </div>
          {err && (
            <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 flex items-center gap-1.5">
              <AlertCircle size={11} />{err}
            </p>
          )}
          <button
            onClick={confirmUpload}
            disabled={uploading || uploaded}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all",
              uploaded
                ? "bg-emerald-500 text-white"
                : "bg-[#1a3d2b] text-white hover:bg-[#15322a] disabled:opacity-70"
            )}
          >
            {uploading
              ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
              : uploaded
                ? <><CheckCircle2 size={14} /> Saved!</>
                : <><Upload size={14} /> Save Prescription</>
            }
          </button>
        </div>
      ) : (
        /* Upload zone */
        <div className="space-y-2">
          {existingImg && (
            <div className="relative rounded-2xl overflow-hidden border border-border bg-gray-50 group">
              <img src={existingImg} alt="Prescription" className="w-full max-h-44 object-contain" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col items-center justify-center gap-2 py-4 bg-[#1a3d2b]/5 hover:bg-[#1a3d2b]/10 border border-[#1a3d2b]/20 hover:border-[#1a3d2b]/40 rounded-xl cursor-pointer transition-all group">
              <Camera size={20} className="text-[#1a3d2b]/70 group-hover:text-[#1a3d2b] transition-colors" />
              <span className="text-xs font-semibold text-[#1a3d2b]/70 group-hover:text-[#1a3d2b]">Take Photo</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </label>
            <label className="flex flex-col items-center justify-center gap-2 py-4 bg-muted/30 hover:bg-muted/60 border border-border hover:border-muted-foreground/30 rounded-xl cursor-pointer transition-all group">
              <Upload size={20} className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
              <span className="text-xs font-semibold text-muted-foreground/60 group-hover:text-muted-foreground">
                {existingImg ? "Replace File" : "Upload File"}
              </span>
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </label>
          </div>
          {existingImg && prescription?.updatedAt && (
            <p className="text-[10px] text-center text-muted-foreground">
              Last updated {new Date(prescription.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Admin Call Overlay + Online Appointment Card ─────────────────
function AdminCallOverlay({ apptId, patientName, onLeave }: { apptId: number; patientName: string; onLeave: () => void }) {
  const [creds, setCreds] = useState<{ token: string; roomName: string; serverUrl: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${BASE}/api/livekit/admin-token/${apptId}`, { credentials: "include" });
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.message || "Could not join"); }
        setCreds(await r.json());
      } catch (e: any) { setError(e.message || "Could not join the call"); }
      finally { setLoading(false); }
    })();
  }, [apptId]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#111]">
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 size={32} className="animate-spin text-emerald-400 mx-auto mb-3" />
            <p className="text-white/60 text-sm">Joining call…</p>
          </div>
        </div>
      )}
      {error && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
            <p className="text-white font-semibold mb-1">Could not join</p>
            <p className="text-white/40 text-sm">{error}</p>
            <button onClick={onLeave} className="mt-4 px-4 py-2 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition-colors">Close</button>
          </div>
        </div>
      )}
      {creds && (
        <div className="flex-1 min-h-0">
          <AdminVideoRoom token={creds.token} serverUrl={creds.serverUrl} onLeave={onLeave} />
        </div>
      )}
    </div>
  );
}

function PrescriptionModal({
  appt,
  onClose,
  onUploaded,
}: {
  appt: OnlineAppt;
  onClose: () => void;
  onUploaded: (id: number, rx: Prescription) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-border shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
          <div>
            <h3 className="font-bold text-base text-foreground">Upload / View Prescription</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Patient: <span className="font-semibold text-foreground">{appt.patient.name}</span> ({appt.patient.patientCode || `ID #${appt.patient.id}`})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl border border-border hover:bg-muted text-muted-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5 max-h-[80vh] overflow-y-auto">
          <PrescriptionUpload
            apptId={appt.id}
            prescription={appt.prescription}
            onUploaded={(rx) => {
              onUploaded(appt.id, rx);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  appt,
  onClose,
  onConfirm,
}: {
  appt: OnlineAppt;
  onClose: () => void;
  onConfirm: (id: number) => void;
}) {
  const code = appt.patient.patientCode || `A00${appt.patient.id}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-border shadow-2xl w-full max-w-sm overflow-hidden p-6">
        <div className="flex items-center gap-3 text-red-600 mb-3">
          <div className="p-3 bg-red-100 rounded-2xl">
            <Trash2 size={22} />
          </div>
          <div>
            <h3 className="font-bold text-base text-foreground">Delete Appointment</h3>
            <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed my-4">
          Are you sure you want to delete the appointment for{" "}
          <span className="font-bold text-foreground">{appt.patient.name}</span> ({code})?
        </p>

        <div className="flex gap-2 justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm(appt.id);
              onClose();
            }}
            className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors shadow-sm"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function OnlineAppointmentsTable({
  appts,
  onJoinToggle,
  onRenotify,
  onPrescriptionClick,
  onCancel,
  onDelete,
  onResetToPending,
  onMarkDone,
}: {
  appts: OnlineAppt[];
  onJoinToggle: (id: number, enable: boolean) => void;
  onRenotify: (id: number) => void;
  onPrescriptionClick: (appt: OnlineAppt) => void;
  onCancel: (id: number) => void;
  onDelete: (id: number) => void;
  onResetToPending: (id: number) => void;
  onMarkDone: (id: number) => void;
}) {
  const [deletingAppt, setDeletingAppt] = useState<OnlineAppt | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
      {deletingAppt && (
        <DeleteConfirmModal
          appt={deletingAppt}
          onClose={() => setDeletingAppt(null)}
          onConfirm={onDelete}
        />
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-muted/50 text-muted-foreground text-xs font-semibold tracking-wider border-b border-border">
            <tr>
              <th className="py-3.5 px-4">Patient ID</th>
              <th className="py-3.5 px-4">Name</th>
              <th className="py-3.5 px-4">Date & Time</th>
              {/* <th className="py-3.5 px-4">Type</th> */}
              <th className="py-3.5 px-4">Phone</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-xs">
            {appts.map((appt) => {
              const code = appt.patient.patientCode || `A00${appt.patient.id}`;
              const slotTime = appt.slot ? `${fmtTime(appt.slot.startTime)} – ${fmtTime(appt.slot.endTime)}` : "";
              const dateStr = appt.slot?.date ? `${fmtFull(appt.slot.date)} ${slotTime}` : "";
              const hasRx = !!appt.prescription?.photoObjectPath;
              const isExpanded = expanded === appt.id;

              return (
                <React.Fragment key={appt.id}>
                  <tr className="hover:bg-muted/20 transition-colors">
                    {/* 1. Patient ID */}
                    <td className="py-3.5 px-4 font-mono font-bold text-foreground">
                      <span className="inline-block bg-[#D95B2F1A] text-[#D95B2F] border border-[#1a3d2b]/15 px-2.5 py-1 rounded-lg text-xs">
                        {code}
                      </span>
                    </td>

                    {/* 2. Name */}
                    <td className="py-3.5 px-4 font-semibold text-foreground">
                      <div className="text-sm font-bold text-foreground">{appt.patient.name}</div>
                    </td>

                    {/* 3. Date & Time */}
                    <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        <Calendar size={12} className="text-[#1a3d2b]" />
                        {appt.slot?.date ? fmtFull(appt.slot.date) : "N/A"}
                      </div>
                      {slotTime && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                          <Clock size={11} /> {slotTime}
                        </div>
                      )}
                    </td>

                    {/* 5. Phone */}
                    <td className="py-3.5 px-4 text-muted-foreground font-mono whitespace-nowrap">
                      {appt.patient.phone || "N/A"}
                    </td>

                    {/* 6. Status */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {appt.joinEnabled && appt.patientJoinedAt ? (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-600 text-white animate-pulse">
                          🟢 Patient Joined
                        </span>
                      ) : appt.joinEnabled ? (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500 text-white animate-pulse">
                          🟢 Live Session
                        </span>
                      ) : (
                        <span className={cn(
                          "text-[10px] font-bold tracking-wide px-2.5 py-0.5 rounded-full border capitalize",
                          ONLINE_STATUS_COLORS[appt.status] || "bg-gray-100 text-gray-600 border-gray-200"
                        )}>
                          {appt.status}
                        </span>
                      )}
                    </td>

                    {/* 7. Actions */}
                    <td className="py-3.5 px-4 text-left whitespace-nowrap">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Enable Join / End Session / Re-notify */}
                          {appt.joinEnabled && (
                            <button
                              onClick={() => onRenotify(appt.id)}
                              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-200 transition-colors inline-flex items-center gap-1"
                              title="Re-send chime + voice alert"
                            >
                              <Bell size={11} /> Re-notify
                            </button>
                          )}
                          <button
                            onClick={() => onJoinToggle(appt.id, !appt.joinEnabled)}
                            className={cn(
                              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-sm",
                              appt.joinEnabled
                                ? "bg-red-100 text-red-700 hover:bg-red-200 border border-red-200"
                                : "bg-emerald-600 text-white hover:bg-emerald-700"
                            )}
                          >
                            {appt.joinEnabled ? <Square size={12} /> : <Play size={12} />}
                            {appt.joinEnabled ? "End Session" : "Enable Join"}
                          </button>

                          {/* Upload / View Prescription Popup */}
                          <button
                            onClick={() => onPrescriptionClick(appt)}
                            className={cn(
                              "px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors inline-flex items-center gap-1.5",
                              hasRx
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                            )}
                          >
                            <ImageIcon size={12} />
                            {hasRx ? "View Rx" : "Upload Rx"}
                          </button>

                          {/* Reset to Pending — only show when completed */}
                          {appt.status === "completed" && (
                            <button
                              onClick={() => onResetToPending(appt.id)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors inline-flex items-center gap-1.5"
                              title="Reset appointment to pending"
                            >
                              <RotateCcw size={12} />
                              <span>Reset to Pending</span>
                            </button>
                          )}

                          {/* Mark as Done — shown when reset to pending (status is pending) */}
                          {appt.status === "pending" && (
                            <button
                              onClick={() => onMarkDone(appt.id)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors inline-flex items-center gap-1.5"
                              title="Mark appointment as done"
                            >
                              <CheckCircle2 size={12} />
                              <span>Mark as Done</span>
                            </button>
                          )}
                        </div>

                        <button
                          onClick={() => setExpanded(isExpanded ? null : appt.id)}
                          className="p-1.5 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors cursor-pointer shrink-0 ml-auto"
                          title={isExpanded ? "Hide Details" : "View Details"}
                        >
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-muted/20">
                      <td colSpan={7} className="px-6 py-4 border-b border-border space-y-2 text-xs">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          
                          {appt.patient.email && (
                            <div>
                              <span className="font-semibold text-foreground">Email: </span>
                              <span className="text-muted-foreground">{appt.patient.email}</span>
                            </div>
                          )}
                        </div>

                        {/* Reason and Delete button on the line after the single divider line */}
                        <div className="pt-3 mt-3 border-t border-border/60 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
                          <div className="text-xs text-muted-foreground flex-1 pr-4 leading-relaxed">
                            <span className="font-semibold text-foreground">Reason: </span>
                            <span>{appt.reason || "N/A"}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDeletingAppt(appt)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 text-xs font-semibold transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OfflineAppointmentsTable({
  appts,
  onApprove,
  onReschedule,
  onCancel,
  onArrive,
  onPay,
  onFollowUp,
  onPrintReceipt,
  onDelete,
}: {
  appts: Appt[];
  onApprove: (id: number) => void;
  onReschedule: (appt: Appt) => void;
  onCancel: (appt: Appt) => void;
  onArrive: (id: number) => void;
  onPay: (appt: Appt) => void;
  onFollowUp: (appt: Appt) => void;
  onPrintReceipt: (appt: Appt) => void;
  onDelete: (appt: Appt) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-muted/50 text-muted-foreground text-xs font-semibold tracking-wider border-b border-border">
            <tr>
              <th className="py-3.5 px-4">Patient ID</th>
              <th className="py-3.5 px-4">Token</th>
              <th className="py-3.5 px-4">Name</th>
              <th className="py-3.5 px-4">Date & Time</th>
              {/* <th className="py-3.5 px-4">Type</th> */}
              <th className="py-3.5 px-4">Phone</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-xs">
            {appts.map((appt) => {
              const patientId = (appt as any).patientCode || "—";
              const token = (appt as any).token || null;
              const isExpanded = expanded === appt.id;
              const reschedDates: string[] = appt.rescheduleDates ? JSON.parse(appt.rescheduleDates) : [];

              return (
                <React.Fragment key={appt.id}>
                  <tr className="hover:bg-muted/20 transition-colors">
                    {/* 1. Patient ID */}
                    <td className="py-3.5 px-4 font-mono font-bold text-foreground">
                      <span className="inline-block bg-[#D95B2F1A] text-[#D95B2F] border border-[#1a3d2b]/15 px-2.5 py-1 rounded-lg text-xs">
                        {patientId}
                      </span>
                    </td>

                    {/* 2. Token */}
                    <td className="py-3.5 px-4 font-mono font-bold whitespace-nowrap">
                      {token ? (
                        <span className="inline-block bg-orange-50 text-[#D95B2F] border border-orange-200 px-2.5 py-1 rounded-lg text-xs">
                          {token}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs italic font-normal">—</span>
                      )}
                    </td>

                    {/* 2. Name */}
                    <td className="py-3.5 px-4 font-semibold text-foreground">
                      <div className="text-sm font-bold text-foreground">{appt.patientName}</div>
                    </td>

                    {/* 3. Date & Time */}
                    <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        <Calendar size={12} className="text-[#1a3d2b]" />
                        {fmtFull(appt.date)}
                      </div>
                      {appt.timeSlot && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                          <Clock size={11} /> {appt.timeSlot}
                        </div>
                      )}
                    </td>

                    {/* 5. Phone */}
                    <td className="py-3.5 px-4 text-muted-foreground font-mono whitespace-nowrap">
                      {appt.patientPhone || "N/A"}
                    </td>

                    {/* 6. Status */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={cn(
                          "text-[10px] font-bold tracking-wide px-2.5 py-0.5 rounded-full border capitalize",
                          STATUS_COLORS[appt.status] || "bg-gray-100 text-gray-600 border-gray-200"
                        )}
                      >
                        {STATUS_LABELS[appt.status] || appt.status}
                      </span>
                    </td>

                    {/* 7. Actions */}
                    <td className="py-3.5 px-4 text-left whitespace-nowrap">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {appt.status === "pending" && (
                            <>
                              <button
                                onClick={() => onApprove(appt.id)}
                                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors shadow-sm cursor-pointer"
                              >
                                <CheckCircle2 size={12} /> Approve
                              </button>
                              <button
                                onClick={() => onReschedule(appt)}
                                className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors shadow-sm cursor-pointer"
                              >
                                <RefreshCw size={12} /> Reschedule
                              </button>
                              <button
                                onClick={() => onCancel(appt)}
                                className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors shadow-sm cursor-pointer"
                              >
                                <XCircle size={12} /> Cancel
                              </button>
                            </>
                          )}
                          {appt.status === "confirmed" && (
                            <>
                              <button
                                onClick={() => onArrive(appt.id)}
                                className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors shadow-sm cursor-pointer"
                              >
                                <UserCheck size={12} /> Arrived
                              </button>
                              <button
                                onClick={() => onCancel(appt)}
                                className="flex items-center gap-1.5 border border-red-300 text-red-600 hover:bg-red-50 text-xs font-medium px-3 py-1.5 rounded-xl transition-colors shadow-sm cursor-pointer"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {appt.status === "arrived" && appt.paymentStatus === "unpaid" && (
                            <button
                              onClick={() => onPay(appt)}
                              className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors shadow-sm cursor-pointer"
                            >
                              <Banknote size={12} /> Mark Paid
                            </button>
                          )}
                          {appt.status === "completed" && (
                            <button
                              onClick={() => onPrintReceipt(appt)}
                              className="flex items-center gap-1.5 bg-[#1a3d2b] hover:bg-[#15322a] text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors shadow-sm cursor-pointer"
                            >
                              <Printer size={12} /> Print Receipt
                            </button>
                          )}
                          {appt.status === "reschedule_accepted" && (
                            <button
                              onClick={() => onApprove(appt.id)}
                              className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors shadow-sm cursor-pointer"
                            >
                              <CheckCircle2 size={12} /> Confirm New Date
                            </button>
                          )}
                        </div>

                        <button
                          onClick={() => setExpanded(isExpanded ? null : appt.id)}
                          className="p-1.5 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors cursor-pointer shrink-0 ml-auto"
                          title={isExpanded ? "Hide Details" : "View Details"}
                        >
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-muted/20">
                      <td colSpan={8} className="px-6 py-4 border-b border-border space-y-2 text-xs">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          
                          {appt.patientEmail && (
                            <div>
                              <span className="font-semibold text-foreground">Email: </span>
                              <span className="text-muted-foreground">{appt.patientEmail}</span>
                            </div>
                          )}
                          
                          {appt.paymentStatus === "paid" ? (
                            <div className="text-green-700">
                              <span className="font-semibold">Payment: </span>
                              Paid via {appt.paymentMode?.toUpperCase() || "CASH"}
                            </div>
                          ) : (
                            <div>
                              <span className="font-semibold text-foreground">Payment: </span>
                              <span className="text-amber-700 font-medium">Unpaid</span>
                            </div>
                          )}
                          {appt.followUpDate && (
                            <div className="text-amber-700">
                              <span className="font-semibold">Follow-up: </span>
                              {fmt(appt.followUpDate)} {appt.followUpConfirmed ? "✓ Patient confirmed" : "⏳ Awaiting"}
                            </div>
                          )}
                          {reschedDates.length > 0 && (
                            <div className="col-span-full">
                              <span className="font-semibold text-foreground">Proposed dates: </span>
                              <span className="text-muted-foreground">{reschedDates.map(fmt).join(", ")}</span>
                              {appt.rescheduleChosen && (
                                <span className="text-purple-700 ml-2 font-medium">→ Chose: {fmt(appt.rescheduleChosen)}</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Reason and Delete button on the line after the single divider line */}
                        <div className="pt-3 mt-3 border-t border-border/60 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
                          <div className="text-xs text-muted-foreground flex-1 pr-4 leading-relaxed">
                            <span className="font-semibold text-foreground">Reason: </span>
                            <span>{appt.reason || "N/A"}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => onDelete(appt)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 text-xs font-semibold transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────
export default function AdminAppointments() {
  // In-person state
  const [appts, setAppts] = useState<Appt[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [payModal, setPayModal] = useState<Appt | null>(null);
  const [receiptModalAppt, setReceiptModalAppt] = useState<Appt | null>(null);
  const [rescheduleModal, setRescheduleModal] = useState<Appt | null>(null);
  const [followUpModal, setFollowUpModal] = useState<Appt | null>(null);
  const { permission, requestPermission, notify, toasts, dismissToast } = useAdminNotifications();
  const notifyRef = useRef(notify);
  useEffect(() => { notifyRef.current = notify; }, [notify]);
  const queryClient = useQueryClient();

  // Pagination states
  const PAGE_SIZE = 10;
  const [offlinePage, setOfflinePage] = useState(1);
  const [onlinePage, setOnlinePage] = useState(1);

  // Online state
  const [mainTab, setMainTab] = useState<"inperson" | "online">("inperson");
  const [onlineAppts, setOnlineAppts] = useState<OnlineAppt[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [onlineErr, setOnlineErr] = useState("");
  const prevOnlineCountRef = useRef<number | null>(null);
  const [adminCall, setAdminCall] = useState<{ apptId: number; patientName: string } | null>(null);
  const [allPermissions, setAllPermissions] = useState<Record<number, ParticipantPerm[]>>({});
  const [uploadModalAppt, setUploadModalAppt] = useState<OnlineAppt | null>(null);

  // ── Load online appointments ──
  const loadOnline = useCallback(async () => {
    setOnlineLoading(true);
    setOnlineErr("");
    try {
      const res = await fetch(`${BASE}/api/online-appointments/admin`, { credentials: "include" });
      if (!res.ok) {
        throw new Error(`Failed to load online appointments (HTTP ${res.status})`);
      }
      const list = await res.json();
      const apptsList: OnlineAppt[] = Array.isArray(list) ? list : [];
      setOnlineAppts(apptsList);
      setLastRefresh(new Date());
    } catch (err: any) {
      setOnlineErr(err?.message || "Failed to load online appointments.");
    } finally {
      setOnlineLoading(false);
    }
  }, []);

  // ── Load in-person appointments ──
  const fetchAppts = useCallback(async (currentFilter?: string) => {
    const activeFilter = currentFilter !== undefined ? currentFilter : filter;
    setLoading(true);
    try {
      const url = activeFilter !== "all" ? `/appointments?status=${activeFilter}` : "/appointments";
      const data = await apiFetch(url);
      setAppts(Array.isArray(data) ? data : []);
      setLastRefresh(new Date());
    } catch (e: any) {
      console.error("fetchAppts failed:", e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // Initial load on mount - runs ONCE
  useEffect(() => {
    fetchAppts("all");
    loadOnline();
  }, []);

  // Real-time SSE stream for online appointment updates (joinEnabled, patientJoinedAt, status)
  useEffect(() => {
    const es = new EventSource(`${BASE}/api/online-appointments/admin/stream`, { withCredentials: true });
    es.addEventListener("appointment_updated", (e) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data);
        if (payload && payload.id) {
          setOnlineAppts(prev => prev.map(a => {
            if (a.id !== payload.id) return a;
            return {
              ...a,
              ...(payload.joinEnabled !== undefined ? { joinEnabled: payload.joinEnabled } : {}),
              ...(payload.status !== undefined ? { status: payload.status } : {}),
              ...(payload.patientJoinedAt !== undefined ? { patientJoinedAt: payload.patientJoinedAt } : {}),
            };
          }));
        }
      } catch {}
    });
    es.addEventListener("new_online_appointment", () => {
      loadOnline();
    });
    return () => es.close();
  }, [loadOnline]);

  // Refetch in-person appointments ONLY when filter state changes
  const isInitialFilter = useRef(true);
  useEffect(() => {
    if (isInitialFilter.current) {
      isInitialFilter.current = false;
      return;
    }
    fetchAppts(filter);
  }, [filter]);

  async function toggleJoin(id: number, enable: boolean) {
    try {
      await fetch(`${BASE}/api/online-appointments/admin/${id}/${enable ? "enable-join" : "disable-join"}`, {
        method: "POST", credentials: "include",
      });
      setOnlineAppts(prev => prev.map(a => a.id === id
        ? { ...a, joinEnabled: enable, patientJoinedAt: enable ? null : a.patientJoinedAt, status: enable ? "confirmed" : "completed" }
        : enable ? { ...a, joinEnabled: false } : a
      ));
      if (enable) playChime();
    } catch { setOnlineErr("Action failed. Please try again."); }
  }

  async function renotify(id: number) {
    try {
      await fetch(`${BASE}/api/online-appointments/admin/${id}/enable-join`, {
        method: "POST", credentials: "include",
      });
    } catch { setOnlineErr("Re-notify failed. Please try again."); }
  }

  async function requestPermissions(id: number) {
    try {
      await fetch(`${BASE}/api/online-appointments/admin/${id}/request-permissions`, {
        method: "POST", credentials: "include",
      });
    } catch { setOnlineErr("Could not send the permission request. Please try again."); }
  }

  async function cancelAppt(id: number) {
    try {
      await fetch(`${BASE}/api/online-appointments/admin/${id}/cancel`, {
        method: "PATCH", credentials: "include",
      });
      setOnlineAppts(prev => prev.map(a => a.id === id ? { ...a, status: "cancelled", joinEnabled: false } : a));
    } catch { setOnlineErr("Cancel failed. Please try again."); }
  }

  async function resetToPending(id: number) {
    try {
      await fetch(`${BASE}/api/online-appointments/admin/${id}/reset-pending`, {
        method: "POST", credentials: "include",
      });
      setOnlineAppts(prev => prev.map(a => a.id === id ? { ...a, status: "pending", joinEnabled: false, patientJoinedAt: null } : a));
    } catch { setOnlineErr("Reset to pending failed. Please try again."); }
  }

  async function markDone(id: number) {
    try {
      await fetch(`${BASE}/api/online-appointments/admin/${id}/complete`, {
        method: "POST", credentials: "include",
      });
      setOnlineAppts(prev => prev.map(a => a.id === id ? { ...a, status: "completed", joinEnabled: false } : a));
    } catch { setOnlineErr("Mark as done failed. Please try again."); }
  }

  async function deleteAppt(id: number) {
    try {
      await fetch(`${BASE}/api/online-appointments/admin/${id}`, {
        method: "DELETE", credentials: "include",
      });
      setOnlineAppts(prev => prev.filter(a => a.id !== id));
    } catch { setOnlineErr("Delete failed. Please try again."); }
  }

  const [deletingOfflineAppt, setDeletingOfflineAppt] = useState<Appt | null>(null);
  const [cancellingOfflineAppt, setCancellingOfflineAppt] = useState<Appt | null>(null);

  function mutate(updated: any) {
    setAppts(prev => prev.map(a => {
      if (a.id !== updated.id) return a;
      return {
        ...a,
        ...updated,
        patientCode: updated.patientCode || (a as any).patientCode || null,
        token: updated.token || (a as any).token || null,
      };
    }));
  }
  async function approve(id: number) { mutate(await apiFetch(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status: "confirmed" }) })); }
  async function arrive(id: number) { mutate(await apiFetch(`/appointments/${id}/arrive`, { method: "PATCH" })); }

  async function confirmDeleteOffline(id: number) {
    try {
      await fetch(`${BASE}/api/appointments/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      setAppts(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error("Failed to delete offline appointment:", err);
    }
  }

  async function confirmCancelOffline(id: number) {
    try {
      const updated = await apiFetch(`/appointments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
      });
      mutate(updated);
    } catch (err) {
      console.error("Failed to cancel offline appointment:", err);
    }
  }

  const today = todayIST();
  const pendingCount = appts.filter(a => a.status === "pending").length;
  const onlinePendingCount = onlineAppts.filter(a => ["pending", "confirmed"].includes(a.status) || a.joinEnabled).length;
  const onlineLiveCount = onlineAppts.filter(a => a.joinEnabled).length;
  const todayAppts = appts.filter(a => a.date === today);
  const shown = filter === "all" ? appts : appts.filter(a => a.status === filter);
  const paginatedOffline = shown.slice((offlinePage - 1) * PAGE_SIZE, offlinePage * PAGE_SIZE);
  const paginatedOnline = onlineAppts.slice((onlinePage - 1) * PAGE_SIZE, onlinePage * PAGE_SIZE);

  useEffect(() => {
    setOfflinePage(1);
  }, [filter]);

  useEffect(() => {
    setOnlinePage(1);
  }, [onlineAppts.length]);

  // Prescription pending alert: completed with no prescription
  const prescriptionPending = onlineAppts.filter(
    a => a.status === "completed" && !a.joinEnabled && !a.prescription?.photoObjectPath
  );

  return (
    <AdminLayout>
      {uploadModalAppt && (
        <PrescriptionModal
          appt={uploadModalAppt}
          onClose={() => setUploadModalAppt(null)}
          onUploaded={(id, rx) => setOnlineAppts(prev => prev.map(a => a.id === id ? { ...a, prescription: rx } : a))}
        />
      )}
      {adminCall && (
        <AdminCallOverlay
          apptId={adminCall.apptId}
          patientName={adminCall.patientName}
          onLeave={() => setAdminCall(null)}
        />
      )}
      {payModal && (
        <PayModal
          appt={payModal}
          onClose={() => setPayModal(null)}
          onPaid={(a) => {
            mutate(a);
            setPayModal(null);
            setReceiptModalAppt(a);
          }}
        />
      )}
      {receiptModalAppt && (
        <OfflineReceiptModal
          appt={receiptModalAppt}
          onClose={() => setReceiptModalAppt(null)}
        />
      )}
      {deletingOfflineAppt && (
        <OfflineDeleteConfirmModal
          appt={deletingOfflineAppt}
          onClose={() => setDeletingOfflineAppt(null)}
          onConfirm={confirmDeleteOffline}
        />
      )}
      {cancellingOfflineAppt && (
        <OfflineCancelConfirmModal
          appt={cancellingOfflineAppt}
          onClose={() => setCancellingOfflineAppt(null)}
          onConfirm={confirmCancelOffline}
        />
      )}
      {rescheduleModal && <RescheduleModal appt={rescheduleModal} onClose={() => setRescheduleModal(null)} onProposed={a => { mutate(a); }} />}
      {followUpModal && <FollowUpModal appt={followUpModal} onClose={() => setFollowUpModal(null)} onSet={a => { mutate(a); }} />}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Appointments</h1>
          {/* <div className="flex flex-wrap items-center gap-2 mt-1">
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 font-medium bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-200">
                <Clock size={11} /> {pendingCount} in-person pending
              </span>
            )}
            {onlinePendingCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-blue-700 font-medium bg-blue-100 px-2.5 py-0.5 rounded-full border border-blue-200">
                <Video size={11} /> {onlinePendingCount} online pending
              </span>
            )}
          </div> */}
        </div>
        <div className="flex items-center gap-2">
          {mainTab === "inperson" && (
            <button onClick={requestPermission}
              className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors",
                permission === "granted" ? "bg-green-50 text-green-700 border-green-200" : "bg-muted text-muted-foreground border-border hover:border-primary/40")}>
              {permission === "granted" ? <Bell size={14} /> : <BellOff size={14} />}
              {permission === "granted" ? "Notifs On" : "Enable Notifs"}
            </button>
          )}
          
        </div>
      </div>

      {/* Main type tabs */}
      <div className="flex gap-2 mb-6 bg-muted/40 rounded-2xl p-1 border border-border">
        <button onClick={() => setMainTab("inperson")}
          className={cn("flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2",
            mainTab === "inperson" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
          <MapPin size={14} /> Offline
          {pendingCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{pendingCount} new</span>
          )}
        </button>
        <button onClick={() => setMainTab("online")}
          className={cn("flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2",
            mainTab === "online" ? "bg-white shadow-sm text-blue-700" : "text-muted-foreground hover:text-foreground")}>
          <Video size={14} /> Online
          {onlinePendingCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">{onlinePendingCount} new</span>
          )}
          {onlineLiveCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </button>
      </div>

      {/* ── ONLINE TAB ───────────────────────────────────────────── */}
      {mainTab === "online" && (
        <div className="space-y-4">
          {/* Status bar */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            {/* <span>Auto-refresh disabled</span> */}
            {/* <span>Last: {lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span> */}
          </div>

          {/* Prescription pending alert */}
          {prescriptionPending.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl px-4 py-3 flex items-start gap-3">
              <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-800">
                  {prescriptionPending.length === 1
                    ? "1 completed appointment has no prescription uploaded yet"
                    : `${prescriptionPending.length} completed appointments have no prescription uploaded yet`}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {prescriptionPending.map(a => a.patient.name).join(", ")} — please upload the prescription photo in the table below.
                </p>
              </div>
            </div>
          )}

          {/* Live session badge */}
          {onlineLiveCount > 0 && (
            <div className="bg-emerald-600 text-white rounded-2xl px-4 py-3 flex items-center gap-3">
              <Video size={16} className="animate-pulse shrink-0" />
              <div>
                <p className="font-bold text-sm">{onlineLiveCount === 1 ? "1 Session Live Now" : `${onlineLiveCount} Sessions Live Now`}</p>
                <p className="text-white/70 text-xs">{onlineAppts.filter(a => a.joinEnabled).map(a => a.patient.name).join(", ")}</p>
              </div>
            </div>
          )}

          {onlineLoading && onlineAppts.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : onlineAppts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-border p-12 text-center">
              <Video size={40} className="text-muted-foreground/20 mx-auto mb-3" />
              <p className="font-semibold text-muted-foreground">No online appointments found</p>
            </div>
          ) : (
            <div className="space-y-4">
              <OnlineAppointmentsTable
                appts={paginatedOnline}
                onJoinToggle={toggleJoin}
                onRenotify={renotify}
                onPrescriptionClick={appt => setUploadModalAppt(appt)}
                onCancel={cancelAppt}
                onDelete={deleteAppt}
                onResetToPending={resetToPending}
                onMarkDone={markDone}
              />
              <AdminPagination
                currentPage={onlinePage}
                totalItems={onlineAppts.length}
                pageSize={PAGE_SIZE}
                onPageChange={setOnlinePage}
                itemLabel="online appointments"
              />
            </div>
          )}
        </div>
      )}

      {/* ── IN-PERSON TAB ────────────────────────────────────────── */}
      {mainTab === "inperson" && (
        <div className="space-y-5">

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-2">
            {["all", "pending", "confirmed", "arrived", "completed", "reschedule_proposed", "cancelled"].map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className={cn("px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all border capitalize",
                  filter === s
                    ? "bg-[#D95B2F] text-white border-[#D95B2F]/5"
                    : "bg-white border-border text-muted-foreground")}>
                {STATUS_LABELS[s] || s}
              </button>
            ))}
          </div>

          {/* Table List with Pagination */}
          <div>
            {loading && appts.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" /> Loading…
              </div>
            ) : shown.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground bg-white rounded-2xl border border-border">
                No appointments found
              </div>
            ) : (
              <div className="space-y-4">
                <OfflineAppointmentsTable
                  appts={paginatedOffline}
                  onApprove={approve}
                  onReschedule={setRescheduleModal}
                  onCancel={(appt) => setCancellingOfflineAppt(appt)}
                  onDelete={(appt) => setDeletingOfflineAppt(appt)}
                  onArrive={arrive}
                  onPay={setPayModal}
                  onFollowUp={setFollowUpModal}
                  onPrintReceipt={setReceiptModalAppt}
                />
                <AdminPagination
                  currentPage={offlinePage}
                  totalItems={shown.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setOfflinePage}
                  itemLabel="offline appointments"
                />
              </div>
            )}
          </div>
        </div>
      )}

      <AdminToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Print CSS styling */}
      <style>{`
        @page {
          size: auto;
          margin: 8mm auto;
        }
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            width: 100% !important;
            height: auto !important;
          }
          body * {
            visibility: hidden;
          }
          #printable-receipt, #printable-receipt * {
            visibility: visible;
          }
          #printable-receipt {
            position: absolute;
            left: 50%;
            top: 10px;
            transform: translateX(-50%);
            width: 320px;
            max-width: 80mm;
            padding: 20px !important;
            margin: 0 auto !important;
            border: 1px solid #CBD5E1 !important;
            border-radius: 16px !important;
            background: #ffffff !important;
            box-shadow: none !important;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          #printable-receipt .receipt-info-table {
            width: 100% !important;
          }
          #printable-receipt .receipt-row {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            width: 100% !important;
            margin-bottom: 8px !important;
          }
          #printable-receipt .receipt-label {
            text-align: left !important;
            white-space: nowrap !important;
            font-weight: 700 !important;
          }
          #printable-receipt .receipt-value {
            text-align: right !important;
            font-weight: 700 !important;
          }
        }
      `}</style>
    </AdminLayout>
  );
}
