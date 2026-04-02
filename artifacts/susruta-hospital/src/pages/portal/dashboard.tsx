import React, { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Clock, CheckCircle2, XCircle, AlertCircle, LogOut,
  Plus, Leaf, ChevronRight, Bell, RefreshCw, User, Video, Pill, FileText, ChevronDown, ChevronUp,
  ShoppingCart, Package, Truck, MapPin, Phone, CreditCard, X, Minus, ArrowRight, ArrowLeft, AlertTriangle
} from "lucide-react";
import { patientApi } from "@/lib/patient-api";
import logoImg from "@assets/logo_1773840200056.png";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type MedicineRow = { medicine: string; instructions: string };
type OnlineAppt = {
  id: number; status: string; reason?: string; createdAt: string;
  meetingLink: string | null;
  documents: { name: string; objectPath: string; contentType: string; size: number }[];
  slot: { id: number; date: string; startTime: string; endTime: string };
  prescription: { medicines: MedicineRow[]; updatedAt: string } | null;
};

type MedOrderItem = { id: number; medicineName: string; instructions: string | null; qty: number; available: boolean | null };
type MedOrder = {
  id: number; status: string; deliveryAddress: string; phone: string;
  trackingNumber: string | null; pharmacistNotes: string | null;
  appointmentId: number | null; createdAt: string; items: MedOrderItem[];
};

type CartRow = { medicineName: string; instructions: string; qty: number };

const ORDER_STATUS_META: Record<string, { label: string; color: string; desc: string }> = {
  submitted: { label: "Submitted", color: "bg-blue-100 text-blue-700 border-blue-200", desc: "Your order has been received by the pharmacy." },
  partial_approval_needed: { label: "Action Required", color: "bg-orange-100 text-orange-700 border-orange-200", desc: "Some medicines are unavailable. Please review and approve the updated order." },
  payment_requested: { label: "Payment Requested", color: "bg-purple-100 text-purple-700 border-purple-200", desc: "Scan the PhonePe QR code to pay and click 'I've Paid'." },
  payment_done: { label: "Payment Sent", color: "bg-amber-100 text-amber-700 border-amber-200", desc: "Your payment is being verified by the pharmacy." },
  payment_confirmed: { label: "Payment Confirmed", color: "bg-teal-100 text-teal-700 border-teal-200", desc: "Payment confirmed! Your order is being packed." },
  shipped: { label: "Shipped 🚚", color: "bg-green-100 text-green-700 border-green-200", desc: "Your order has been shipped." },
};

function fmtTimeO(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function OnlineConsultationCard({ appt, onOrderMedicines }: { appt: OnlineAppt; onOrderMedicines: (appt: OnlineAppt) => void }) {
  const [open, setOpen] = useState(false);
  const fmtD = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  const statusColor: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
    confirmed: "bg-blue-100 text-blue-700 border-blue-200",
    completed: "bg-green-100 text-green-700 border-green-200",
    cancelled: "bg-gray-100 text-gray-500 border-gray-200",
  };
  const statusLabel: Record<string, string> = {
    pending: "Awaiting Approval",
    confirmed: "Confirmed",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  const sc = statusColor[appt.status] ?? statusColor["confirmed"];

  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/20 transition-colors">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <Video size={18} className="text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-sm text-foreground">{fmtD(appt.slot.date)}</p>
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">Online</span>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${sc}`}>
              {statusLabel[appt.status] ?? appt.status}
            </span>
            {appt.prescription && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 flex items-center gap-1">
                <Pill size={9} /> Rx Ready
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            <Clock size={10} className="inline mr-1" />{fmtTimeO(appt.slot.startTime)} – {fmtTimeO(appt.slot.endTime)}
            {appt.documents.length > 0 && ` · ${appt.documents.length} doc(s)`}
          </p>
          {appt.meetingLink && appt.status === "confirmed" ? (
            <a href={appt.meetingLink} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 mt-2 bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
              <Video size={11} className="pointer-events-none" />
              <span className="pointer-events-none">Join Doctor Meeting</span>
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5 mt-2 bg-gray-100 text-gray-400 text-xs font-bold px-3 py-1.5 rounded-lg cursor-not-allowed border border-gray-200">
              <Video size={11} className="pointer-events-none" />
              <span className="pointer-events-none">Join Doctor Meeting</span>
              <span className="text-[9px] font-normal ml-0.5 pointer-events-none">
                {appt.status === "pending" ? "(Awaiting approval)" : "(Link pending)"}
              </span>
            </span>
          )}
        </div>
        {open ? <ChevronUp size={16} className="text-muted-foreground shrink-0" /> : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-border px-5 pb-4 pt-3 space-y-4">
          {appt.reason && (
            <p className="text-sm text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
              <span className="font-medium text-foreground">Reason:</span> {appt.reason}
            </p>
          )}
          {appt.prescription ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Pill size={11} /> Prescription from Dr. Murali Krishna
              </p>
              <div className="space-y-1.5">
                {appt.prescription.medicines.map((m, i) => (
                  <div key={i} className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
                    <div className="w-5 h-5 rounded-full bg-green-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
                    <div>
                      <p className="text-sm font-bold text-foreground">{m.medicine}</p>
                      <p className="text-xs text-green-700">{m.instructions}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Issued {new Date(appt.prescription.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
              <button
                onClick={e => { e.stopPropagation(); onOrderMedicines(appt); }}
                className="mt-3 inline-flex items-center gap-1.5 bg-primary text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors shadow-sm">
                <ShoppingCart size={11} className="pointer-events-none" />
                <span className="pointer-events-none">Order Medicines from Prescription</span>
              </button>
            </div>
          ) : appt.status === "confirmed" ? (
            <div className="text-sm text-muted-foreground bg-muted/30 rounded-xl px-4 py-3 flex items-center gap-2">
              <Clock size={13} /> Prescription will appear here after your consultation.
            </div>
          ) : null}

          {appt.documents.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <FileText size={11} /> Uploaded Documents
              </p>
              <div className="flex flex-wrap gap-2">
                {appt.documents.map((d, i) => (
                  <a key={i} href={`${BASE}/api/storage${d.objectPath}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-1.5 font-medium hover:bg-blue-100 transition-colors flex items-center gap-1.5">
                    <FileText size={11} /> {d.name}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Patient = { id: number; name: string; email: string; phone?: string };
type Appt = {
  id: number; date: string; timeSlot: string; reason?: string; status: string;
  notes?: string; arrivedAt?: string; paymentStatus: string; paymentMode?: string;
  rescheduleDates?: string; rescheduleChosen?: string; followUpDate?: string; followUpConfirmed: boolean;
};

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "Pending Approval", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: <Clock size={13} /> },
  confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-700 border-blue-200", icon: <CheckCircle2 size={13} /> },
  reschedule_proposed: { label: "Reschedule Proposed", color: "bg-orange-100 text-orange-700 border-orange-200", icon: <RefreshCw size={13} /> },
  reschedule_accepted: { label: "Rescheduled", color: "bg-purple-100 text-purple-700 border-purple-200", icon: <RefreshCw size={13} /> },
  arrived: { label: "Arrived at Clinic", color: "bg-teal-100 text-teal-700 border-teal-200", icon: <CheckCircle2 size={13} /> },
  completed: { label: "Completed", color: "bg-green-100 text-green-700 border-green-200", icon: <CheckCircle2 size={13} /> },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700 border-red-200", icon: <XCircle size={13} /> },
  missed: { label: "Missed", color: "bg-gray-100 text-gray-600 border-gray-200", icon: <AlertCircle size={13} /> },
};

// Progress tracker — 4 stages of an appointment lifecycle
const TRACKER_STEPS = [
  { key: "requested", label: "Requested", statuses: ["pending", "reschedule_proposed"] },
  { key: "approved",  label: "Approved",  statuses: ["confirmed", "reschedule_accepted"] },
  { key: "arrived",   label: "Arrived",   statuses: ["arrived"] },
  { key: "completed", label: "Completed", statuses: ["completed"] },
];

function getStepIndex(status: string) {
  if (["completed"].includes(status)) return 3;
  if (["arrived"].includes(status)) return 2;
  if (["confirmed", "reschedule_accepted"].includes(status)) return 1;
  return 0; // pending, reschedule_proposed, cancelled, missed
}

function AppointmentTracker({ status }: { status: string }) {
  const isCancelled = status === "cancelled" || status === "missed";
  const activeIdx = getStepIndex(status);

  if (isCancelled) return null;

  return (
    <div className="py-3">
      <div className="flex items-center">
        {TRACKER_STEPS.map((step, idx) => {
          const done = idx < activeIdx;
          const active = idx === activeIdx;
          return (
            <React.Fragment key={step.key}>
              {/* Step circle */}
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                  ${done    ? "bg-primary text-white shadow-sm shadow-primary/30"
                  : active  ? "bg-primary text-white ring-4 ring-primary/20 shadow-md shadow-primary/30"
                            : "bg-muted border-2 border-border text-muted-foreground/40"}`}>
                  {done ? <CheckCircle2 size={14} /> : <span>{idx + 1}</span>}
                </div>
                <span className={`text-[10px] font-semibold whitespace-nowrap
                  ${done || active ? "text-primary" : "text-muted-foreground/40"}`}>
                  {step.label}
                </span>
              </div>
              {/* Connector line */}
              {idx < TRACKER_STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 mb-4 rounded-full transition-all
                  ${done ? "bg-primary" : "bg-border"}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      {/* Active step description */}
      <p className="text-xs text-center text-muted-foreground mt-1">
        {status === "pending" && "⏳ Waiting for clinic to review your request"}
        {status === "reschedule_proposed" && "📅 Clinic has proposed new dates — please choose one below"}
        {status === "reschedule_accepted" && "✅ Reschedule confirmed — your appointment is set"}
        {status === "confirmed" && "✅ Your appointment is confirmed! See you at the clinic"}
        {status === "arrived" && "🏥 You've checked in — currently at the clinic"}
        {status === "completed" && "🌿 Visit completed. Thank you for choosing Susruta Hospital"}
      </p>
    </div>
  );
}

function fmt(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

// ── Medicine Order Modal ───────────────────────────────────────
function MedicineOrderModal({
  prefill, appointmentId, patientPhone, onClose, onSuccess
}: {
  prefill: CartRow[];
  appointmentId?: number;
  patientPhone?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const fromPrescription = prefill.length > 0;

  const [step, setStep] = useState(1);
  const [rxItems, setRxItems] = useState<Array<CartRow & { selected: boolean }>>(
    prefill.map(r => ({ ...r, selected: true }))
  );
  const [extraItems, setExtraItems] = useState<CartRow[]>(
    fromPrescription ? [] : [{ medicineName: "", instructions: "", qty: 1 }]
  );
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState(patientPhone ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/pharmacy/settings`, { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.phonepeQrObjectPath) setQrUrl(`${BASE}/api/storage${d.phonepeQrObjectPath}`);
      }).catch(() => {});
  }, []);

  function toggleRx(i: number) { setRxItems(c => c.map((r, j) => j === i ? { ...r, selected: !r.selected } : r)); }
  function setRxQty(i: number, qty: number) { setRxItems(c => c.map((r, j) => j === i ? { ...r, qty } : r)); }

  function addExtra() { setExtraItems(c => [...c, { medicineName: "", instructions: "", qty: 1 }]); }
  function removeExtra(i: number) { setExtraItems(c => c.filter((_, j) => j !== i)); }
  function updateExtra(i: number, field: keyof CartRow, value: string | number) {
    setExtraItems(c => c.map((r, j) => j === i ? { ...r, [field]: value } : r));
  }

  const selectedRx = rxItems.filter(r => r.selected);
  const validExtras = extraItems.filter(r => r.medicineName.trim().length > 0);
  const validCart: CartRow[] = [
    ...selectedRx.map(r => ({ medicineName: r.medicineName, instructions: r.instructions, qty: r.qty })),
    ...validExtras,
  ];

  async function submit() {
    setSubmitting(true);
    try {
      const body = {
        appointmentId,
        appointmentType: appointmentId ? "online" : "offline",
        deliveryAddress: address.trim(),
        phone: phone.trim(),
        items: validCart.map(r => ({ medicineName: r.medicineName.trim(), instructions: r.instructions.trim() || undefined, qty: r.qty })),
      };
      const r = await fetch(`${BASE}/api/medicine-orders`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw await r.json();
      onSuccess();
    } catch (err: any) {
      alert(err?.issues?.[0]?.message ?? err?.message ?? "Failed to place order. Please try again.");
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-[#1a3d2b] text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-base">Order Medicines</h2>
            <p className="text-green-300 text-xs">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>

        {/* Step indicator */}
        <div className="flex border-b border-border shrink-0">
          {["Select Medicines", "Delivery Info", "Review & Submit"].map((label, idx) => (
            <div key={idx} className={`flex-1 py-2.5 text-center text-xs font-semibold transition-colors
              ${step === idx + 1 ? "text-primary border-b-2 border-primary bg-primary/5"
              : step > idx + 1 ? "text-green-600" : "text-muted-foreground"}`}>
              {step > idx + 1 ? "✓ " : ""}{label}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Step 1: Medicine selection */}
          {step === 1 && (
            <div className="px-6 py-5 space-y-4">

              {/* Prescription medicines (pre-selected cards) */}
              {fromPrescription && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Pill size={13} className="text-primary" />
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide">From Dr. Murali Krishna's Prescription</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground -mt-1">All medicines are pre-selected. Uncheck any you don't need.</p>
                  {rxItems.map((row, i) => (
                    <div key={i}
                      onClick={() => toggleRx(i)}
                      className={`rounded-xl border-2 p-3 cursor-pointer transition-all select-none
                        ${row.selected
                          ? "border-primary/50 bg-primary/5 shadow-sm"
                          : "border-border bg-gray-50 opacity-50"}`}>
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors
                          ${row.selected ? "bg-primary border-primary" : "border-gray-400 bg-white"}`}>
                          {row.selected && <CheckCircle2 size={10} className="text-white" strokeWidth={3} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold leading-tight ${row.selected ? "text-foreground" : "text-muted-foreground"}`}>
                            {row.medicineName}
                          </p>
                          {row.instructions && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">{row.instructions}</p>
                          )}
                        </div>
                        {row.selected && (
                          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                            <button onClick={() => setRxQty(i, Math.max(1, row.qty - 1))}
                              className="w-6 h-6 rounded-lg border border-border bg-white flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                              <Minus size={11} />
                            </button>
                            <span className="text-sm font-bold w-5 text-center">{row.qty}</span>
                            <button onClick={() => setRxQty(i, Math.min(99, row.qty + 1))}
                              className="w-6 h-6 rounded-lg border border-border bg-white flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                              <Plus size={11} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Manual/extra medicine entries */}
              {(extraItems.length > 0 || !fromPrescription) && (
                <div className="space-y-2">
                  {fromPrescription && extraItems.length > 0 && (
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-1">Additional Medicines</p>
                  )}
                  {extraItems.map((row, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-gray-400 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {(fromPrescription ? rxItems.length : 0) + i + 1}
                        </div>
                        <input
                          type="text"
                          value={row.medicineName}
                          onChange={e => updateExtra(i, "medicineName", e.target.value)}
                          placeholder="Medicine name"
                          className="flex-1 text-sm border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <div className="flex items-center gap-1">
                          <button onClick={() => updateExtra(i, "qty", Math.max(1, row.qty - 1))}
                            className="w-6 h-6 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                            <Minus size={12} />
                          </button>
                          <span className="text-sm font-bold w-6 text-center">{row.qty}</span>
                          <button onClick={() => updateExtra(i, "qty", Math.min(99, row.qty + 1))}
                            className="w-6 h-6 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                            <Plus size={12} />
                          </button>
                        </div>
                        {(extraItems.length > 1 || fromPrescription) && (
                          <button onClick={() => removeExtra(i)} className="p-1 text-red-400 hover:text-red-600 transition-colors"><X size={14} /></button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={row.instructions}
                        onChange={e => updateExtra(i, "instructions", e.target.value)}
                        placeholder="Dosage / instructions (optional)"
                        className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  ))}
                </div>
              )}

              <button onClick={addExtra}
                className="w-full border-2 border-dashed border-primary/30 text-primary text-sm font-semibold py-2.5 rounded-xl hover:bg-primary/5 transition-colors flex items-center justify-center gap-1.5">
                <Plus size={14} /> {fromPrescription ? "Add Extra Medicine" : "Add Another Medicine"}
              </button>
            </div>
          )}

          {/* Step 2: Delivery info */}
          {step === 2 && (
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-foreground/80 mb-1.5 flex items-center gap-1.5">
                  <MapPin size={13} /> Delivery Address
                </label>
                <textarea
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="Full address including street, city, pin code…"
                  rows={4}
                  className="w-full text-sm border border-border rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-foreground/80 mb-1.5 flex items-center gap-1.5">
                  <Phone size={13} /> Contact Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+91 XXXXX XXXXX"
                  className="w-full text-sm border border-border rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="px-6 py-5 space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-green-800 mb-2">Medicines ({validCart.length})</p>
                <div className="space-y-2">
                  {validCart.map((r, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-xs font-bold text-green-700 w-5 text-right shrink-0">{r.qty}×</span>
                      <div>
                        <p className="text-sm font-bold text-foreground">{r.medicineName}</p>
                        {r.instructions && <p className="text-xs text-muted-foreground">{r.instructions}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-gray-50 border border-border rounded-2xl p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Delivery Details</p>
                <p className="text-sm"><MapPin size={11} className="inline mr-1 text-muted-foreground" />{address}</p>
                <p className="text-sm"><Phone size={11} className="inline mr-1 text-muted-foreground" />{phone}</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
                After submitting, the pharmacy will verify medicine availability. You will receive a PhonePe QR code to complete payment.
              </div>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="px-6 py-4 border-t border-border flex gap-3 shrink-0">
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)}
              className="flex-1 border border-border text-foreground py-2.5 rounded-xl text-sm font-semibold hover:bg-muted transition-colors flex items-center justify-center gap-1.5">
              <ArrowLeft size={14} /> Back
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 ? validCart.length === 0 : !address.trim() || phone.trim().length < 7}
              className="flex-1 bg-primary text-white py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button onClick={submit} disabled={submitting}
              className="flex-1 bg-primary text-white py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {submitting
                ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <><ShoppingCart size={15} /> Place Order</>
              }
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Medicine Order Card ────────────────────────────────────────
function MedOrderCard({ order, onApprove, onPaymentDone, qrUrl }: {
  order: MedOrder;
  onApprove: (id: number) => void;
  onPaymentDone: (id: number) => void;
  qrUrl: string | null;
}) {
  const needsAction = order.status === "payment_requested" || order.status === "partial_approval_needed";
  const [open, setOpen] = useState(needsAction);
  const [loading, setLoading] = useState(false);
  const meta = ORDER_STATUS_META[order.status] ?? ORDER_STATUS_META["submitted"];
  const fmtD = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const unavailable = order.items.filter(it => it.available === false);

  async function handleApprove() {
    setLoading(true);
    try { await onApprove(order.id); }
    finally { setLoading(false); }
  }

  async function handlePaymentDone() {
    setLoading(true);
    try { await onPaymentDone(order.id); }
    finally { setLoading(false); }
  }

  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/20 transition-colors">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Package size={16} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-sm text-foreground">Order #{order.id}</p>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${meta.color}`}>
              {meta.label}
            </span>
            {order.status === "partial_approval_needed" && (
              <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full border border-orange-200 animate-pulse">⚠ Action Needed</span>
            )}
            {order.status === "payment_requested" && (
              <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full border border-purple-200 animate-pulse">Pay Now</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{order.items.length} medicine(s) · {fmtD(order.createdAt)}</p>
        </div>
        {open ? <ChevronUp size={15} className="text-muted-foreground shrink-0" /> : <ChevronDown size={15} className="text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          <p className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">{meta.desc}</p>

          {/* Medicine list */}
          <div className="space-y-1.5">
            {order.items.map(item => (
              <div key={item.id} className={`flex items-start gap-2.5 rounded-xl px-3 py-2 border text-sm
                ${item.available === false ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                <span className="font-bold w-5 text-right text-muted-foreground shrink-0">{item.qty}×</span>
                <div className="flex-1">
                  <p className="font-bold text-foreground">{item.medicineName}</p>
                  {item.instructions && <p className="text-xs text-muted-foreground">{item.instructions}</p>}
                </div>
                {item.available === false && (
                  <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full shrink-0">Unavailable</span>
                )}
              </div>
            ))}
          </div>

          {/* Notes from pharmacist */}
          {order.pharmacistNotes && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
              <strong>Pharmacist notes:</strong> {order.pharmacistNotes}
            </div>
          )}

          {/* Delivery address */}
          <div className="text-xs text-muted-foreground">
            <MapPin size={10} className="inline mr-1" /> {order.deliveryAddress}
          </div>

          {/* Approve partial order */}
          {order.status === "partial_approval_needed" && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-orange-800 flex items-center gap-1.5">
                <AlertTriangle size={12} /> {unavailable.length} medicine(s) unavailable
              </p>
              <p className="text-xs text-orange-700">
                The pharmacy cannot fulfill the above medicines. Would you like to approve the order with the remaining available medicines?
              </p>
              <button onClick={handleApprove} disabled={loading}
                className="w-full bg-orange-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-orange-700 transition-colors disabled:opacity-60">
                {loading ? "Processing…" : "Approve Updated Order"}
              </button>
            </div>
          )}

          {/* PhonePe QR payment */}
          {order.status === "payment_requested" && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-purple-800 flex items-center gap-1.5">
                <CreditCard size={14} /> Pay via PhonePe QR
              </p>
              {qrUrl ? (
                <div className="flex justify-center">
                  <img src={qrUrl} alt="PhonePe QR Code" className="w-48 h-48 object-contain rounded-xl border border-purple-200 bg-white p-2" />
                </div>
              ) : (
                <div className="text-center text-sm text-purple-700 bg-white rounded-xl py-6 border border-purple-200">
                  QR code not yet configured. Please contact the pharmacy.
                </div>
              )}
              <p className="text-xs text-center text-purple-700">Scan this QR code with PhonePe to pay, then click the button below.</p>
              <button onClick={handlePaymentDone} disabled={loading}
                className="w-full bg-purple-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-purple-700 transition-colors disabled:opacity-60">
                {loading ? "Processing…" : "✓ I've Paid"}
              </button>
            </div>
          )}

          {/* Tracking */}
          {order.status === "shipped" && order.trackingNumber && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-green-800 flex items-center gap-1.5 mb-1"><Truck size={12} /> Tracking Number</p>
              <p className="text-base font-bold font-mono text-green-900">{order.trackingNumber}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function isUpcoming(a: Appt) {
  return ["confirmed", "pending", "reschedule_proposed", "reschedule_accepted"].includes(a.status) && a.date >= new Date().toISOString().slice(0, 10);
}
function isPast(a: Appt) { return ["completed", "arrived"].includes(a.status); }
function isMissed(a: Appt) { return a.status === "missed" || (["confirmed", "pending"].includes(a.status) && a.date < new Date().toISOString().slice(0, 10)); }

export default function PatientDashboard() {
  const [, navigate] = useLocation();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [onlineAppts, setOnlineAppts] = useState<OnlineAppt[]>([]);
  const [medicineOrders, setMedicineOrders] = useState<MedOrder[]>([]);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "past" | "missed">("upcoming");
  const [choosingReschedule, setChoosingReschedule] = useState<number | null>(null);
  const [orderModal, setOrderModal] = useState<{ prefill: CartRow[]; appointmentId?: number } | null>(null);

  function openOrderModal(appt?: OnlineAppt) {
    if (appt) {
      // Called from a specific consultation card
      if (appt.prescription?.medicines?.length) {
        const prefill = appt.prescription.medicines.map(m => ({
          medicineName: m.medicine,
          instructions: m.instructions,
          qty: 1,
        }));
        setOrderModal({ prefill, appointmentId: appt.id });
      } else {
        setOrderModal({ prefill: [], appointmentId: appt.id });
      }
    } else {
      // Called from the generic "Order Medicines" button — auto-pick the latest prescription
      const withRx = onlineAppts.filter(a => a.prescription?.medicines?.length);
      if (withRx.length > 0) {
        const latest = withRx[0];
        const prefill = latest.prescription!.medicines.map(m => ({
          medicineName: m.medicine,
          instructions: m.instructions,
          qty: 1,
        }));
        setOrderModal({ prefill, appointmentId: latest.id });
      } else {
        setOrderModal({ prefill: [] });
      }
    }
  }

  const fetchMedicineOrders = useCallback(async () => {
    const data = await fetch(`${BASE}/api/medicine-orders/mine`, { credentials: "include" })
      .then(r => r.json()).catch(() => []);
    setMedicineOrders(data);
  }, []);

  useEffect(() => {
    fetch(`${BASE}/api/pharmacy/settings`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (d.phonepeQrObjectPath) setQrUrl(`${BASE}/api/storage${d.phonepeQrObjectPath}`); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load(initial = false) {
      try {
        if (initial) {
          const [me, myAppts, myOnlineAppts] = await Promise.all([
            patientApi.me(),
            patientApi.getAppointments(),
            fetch(`${BASE}/api/online-appointments/mine`, { credentials: "include" }).then(r => r.json()).catch(() => []),
          ]);
          if (cancelled) return;
          setPatient(me);
          setAppts(myAppts);
          setOnlineAppts(myOnlineAppts);
          fetchMedicineOrders();
        } else {
          const [myAppts, myOnlineAppts] = await Promise.all([
            patientApi.getAppointments(),
            fetch(`${BASE}/api/online-appointments/mine`, { credentials: "include" }).then(r => r.json()).catch(() => []),
          ]);
          if (cancelled) return;
          setAppts(myAppts);
          setOnlineAppts(myOnlineAppts);
        }
      } catch {
        if (initial) navigate("/portal");
      } finally {
        if (initial) setLoading(false);
      }
    }

    load(true);

    // Poll every 15s so status changes from admin appear without a manual refresh
    const interval = setInterval(() => load(false), 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  async function logout() {
    await patientApi.logout();
    navigate("/portal");
  }

  async function confirmFollowup(id: number) {
    const updated = await patientApi.confirmFollowup(id);
    setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, ...updated } : a)));
  }

  async function chooseReschedule(id: number, date: string) {
    const updated = await patientApi.chooseReschedule(id, date);
    setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, ...updated } : a)));
    setChoosingReschedule(null);
  }

  async function handleApprovePartial(id: number) {
    await fetch(`${BASE}/api/medicine-orders/${id}/approve-partial`, { method: "PATCH", credentials: "include" });
    fetchMedicineOrders();
  }

  async function handlePaymentDone(id: number) {
    await fetch(`${BASE}/api/medicine-orders/${id}/payment-done`, { method: "PATCH", credentials: "include" });
    fetchMedicineOrders();
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white">
      <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const upcoming = appts.filter(isUpcoming);
  const past = appts.filter(isPast);
  const missed = appts.filter(isMissed);
  const followUps = appts.filter((a) => a.followUpDate && !a.followUpConfirmed && isPast(a));
  const shown = { upcoming, past, missed }[tab];

  // Online appointments merged into tabs
  const onlineUpcoming = onlineAppts.filter((a) => ["pending", "confirmed"].includes(a.status));
  const onlinePast = onlineAppts.filter((a) => a.status === "completed");
  const shownOnline = tab === "upcoming" ? onlineUpcoming : tab === "past" ? onlinePast : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50/40 via-white to-white">
      {/* Header */}
      <header className="bg-white border-b border-border/50 shadow-sm sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <img src={logoImg} alt="Susruta Hospital" className="h-9 w-auto object-contain" />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-green-600 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Live
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-foreground">{patient?.name}</p>
              <p className="text-xs text-muted-foreground">{patient?.email}</p>
            </div>
            <button onClick={logout} className="ml-2 p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Welcome card */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="bg-[#1a3d2b] text-white rounded-3xl p-6 flex items-center justify-between overflow-hidden relative">
          <div className="absolute right-0 top-0 w-48 h-full opacity-10"
            style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
          <div>
            <p className="text-green-300 text-sm font-medium flex items-center gap-1.5 mb-1"><Leaf size={13} /> Patient Portal</p>
            <h1 className="text-xl font-serif font-bold">Welcome back, {patient?.name?.split(" ")[0]}!</h1>
            <p className="text-white/60 text-sm mt-1">Manage your Ayurvedic care journey</p>
          </div>
          <button onClick={() => navigate("/portal/book")}
            className="flex-shrink-0 bg-white text-[#1a3d2b] rounded-2xl px-5 py-3 text-base font-bold hover:bg-green-50 active:scale-95 transition-all flex items-center gap-2 shadow-xl">
            <Plus size={18} className="pointer-events-none" />
            <span className="pointer-events-none">Book Appointment</span>
          </button>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Upcoming", count: upcoming.length + onlineUpcoming.length, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Completed", count: past.length + onlinePast.length, color: "text-green-600", bg: "bg-green-50" },
            { label: "Missed", count: missed.length, color: "text-red-500", bg: "bg-red-50" },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center`}>
              <div className={`text-2xl font-bold font-serif ${s.color}`}>{s.count}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Follow-up alerts */}
        {followUps.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
            <p className="text-amber-800 font-semibold flex items-center gap-2 text-sm">
              <Bell size={15} /> Follow-up Reminders
            </p>
            {followUps.map((a) => (
              <div key={a.id} className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm">
                <div>
                  <p className="text-sm font-medium">Follow-up suggested: <span className="text-amber-700 font-bold">{fmt(a.followUpDate!)}</span></p>
                  <p className="text-xs text-muted-foreground">From your visit on {fmt(a.date)}</p>
                </div>
                <button onClick={() => confirmFollowup(a.id)}
                  className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-amber-700 transition-colors">
                  Confirm
                </button>
              </div>
            ))}
          </motion.div>
        )}

        {/* Tabs */}
        <div className="bg-muted/50 rounded-2xl p-1 flex">
          {(["upcoming", "past", "missed"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all capitalize ${tab === t ? "bg-white shadow-sm text-primary" : "text-muted-foreground"}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Appointment cards */}
        <div className="space-y-3">
          {shown.length === 0 && shownOnline.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No {tab} appointments</p>
              {tab === "upcoming" && (
                <button onClick={() => navigate("/portal/book")}
                  className="mt-5 inline-flex items-center gap-2 bg-[#1a3d2b] text-white rounded-2xl px-5 py-2.5 text-sm font-bold hover:bg-[#1a3d2b]/90 transition-colors shadow-md">
                  <Plus size={15} className="pointer-events-none" />
                  <span className="pointer-events-none">Book an Appointment</span>
                </button>
              )}
            </div>
          ) : (
            <>
            {shown.map((a) => {
              const meta = STATUS_META[a.status] ?? STATUS_META["pending"];
              const dates: string[] = a.rescheduleDates ? JSON.parse(a.rescheduleDates) : [];
              return (
                <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl border border-border shadow-sm p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-foreground">{fmt(a.date)}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock size={12} /> {a.timeSlot}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${meta.color}`}>
                      {meta.icon} {meta.label}
                    </span>
                  </div>

                  {/* Progress tracker */}
                  <div className="border-t border-b border-border/50 -mx-5 px-5">
                    <AppointmentTracker status={a.status} />
                  </div>

                  {a.reason && <p className="text-sm text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">{a.reason}</p>}
                  {a.notes && <p className="text-sm text-primary/80 bg-primary/5 rounded-xl px-3 py-2">Doctor's note: {a.notes}</p>}

                  {/* Payment info */}
                  {a.paymentStatus === "paid" && (
                    <div className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5">
                      <CheckCircle2 size={12} /> Payment received via {a.paymentMode?.toUpperCase()}
                    </div>
                  )}

                  {/* Reschedule picker */}
                  {a.status === "reschedule_proposed" && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                      <p className="text-sm font-semibold text-orange-800 mb-2">Admin has proposed new dates. Please choose one:</p>
                      <div className="flex flex-wrap gap-2">
                        {dates.map((d) => (
                          <button key={d} onClick={() => chooseReschedule(a.id, d)}
                            className="bg-white border border-orange-300 text-orange-800 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-orange-600 hover:text-white transition-colors">
                            {fmt(d)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
            {shownOnline.map((appt) => (
              <motion.div key={`online-${appt.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <OnlineConsultationCard appt={appt} onOrderMedicines={openOrderModal} />
              </motion.div>
            ))}
            </>
          )}
        </div>

        {/* Medicine Orders Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-foreground flex items-center gap-2">
              <Package size={18} className="text-primary" /> Medicine Orders
              {medicineOrders.filter(o => o.status === "partial_approval_needed" || o.status === "payment_requested").length > 0 && (
                <span className="w-5 h-5 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  {medicineOrders.filter(o => o.status === "partial_approval_needed" || o.status === "payment_requested").length}
                </span>
              )}
            </h2>
            <button onClick={() => openOrderModal()}
              className="inline-flex items-center gap-1.5 bg-primary text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-primary/90 transition-colors">
              <ShoppingCart size={12} /> Order Medicines
            </button>
          </div>
          {medicineOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground bg-white rounded-2xl border border-border">
              <Package size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No medicine orders yet</p>
              <p className="text-xs mt-1">Order medicines prescribed by the doctor and get them delivered to you.</p>
              <button onClick={() => openOrderModal()}
                className="mt-4 inline-flex items-center gap-1.5 bg-primary text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors">
                <ShoppingCart size={12} /> Order Medicines
              </button>
            </div>
          ) : (
            medicineOrders.map(order => (
              <MedOrderCard key={order.id} order={order} qrUrl={qrUrl}
                onApprove={handleApprovePartial} onPaymentDone={handlePaymentDone} />
            ))
          )}
        </div>
      </div>

      {/* Medicine Order Modal */}
      <AnimatePresence>
        {orderModal && (
          <MedicineOrderModal
            prefill={orderModal.prefill}
            appointmentId={orderModal.appointmentId}
            patientPhone={patient?.phone}
            onClose={() => setOrderModal(null)}
            onSuccess={() => {
              setOrderModal(null);
              fetchMedicineOrders();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
