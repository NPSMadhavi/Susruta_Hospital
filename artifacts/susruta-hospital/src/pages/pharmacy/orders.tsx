import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pill, LogOut, RefreshCw, Package, CheckCircle2, Clock, Truck,
  ChevronRight, Bell, BellOff, User, Phone, MapPin, FileText,
  AlertTriangle, CreditCard, XCircle, Hash
} from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";
import { playPharmacyChime } from "@/lib/sound";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function api(path: string, opts: RequestInit = {}) {
  const r = await fetch(`${BASE}/api/pharmacy${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw data;
  return data;
}

type OrderItem = { id: number; medicineName: string; instructions: string | null; qty: number; available: boolean | null };
type Order = {
  id: number; status: string; deliveryAddress: string; phone: string;
  trackingNumber: string | null; pharmacistNotes: string | null;
  appointmentId: number | null; appointmentType: string;
  createdAt: string; updatedAt: string;
  patient: { id: number; name: string; email: string; phone: string };
  items: OrderItem[];
};

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  submitted: { label: "New Order", color: "bg-blue-100 text-blue-700 border-blue-200", icon: <Package size={12} /> },
  partial_approval_needed: { label: "Awaiting Patient Approval", color: "bg-orange-100 text-orange-700 border-orange-200", icon: <AlertTriangle size={12} /> },
  payment_requested: { label: "Payment Requested", color: "bg-purple-100 text-purple-700 border-purple-200", icon: <CreditCard size={12} /> },
  payment_done: { label: "Payment Done ✓", color: "bg-amber-100 text-amber-700 border-amber-200", icon: <CheckCircle2 size={12} /> },
  payment_confirmed: { label: "Payment Confirmed", color: "bg-teal-100 text-teal-700 border-teal-200", icon: <CheckCircle2 size={12} /> },
  shipped: { label: "Shipped", color: "bg-green-100 text-green-700 border-green-200", icon: <Truck size={12} /> },
};

function playNotificationSound() {
  playPharmacyChime();
}

export default function PharmacyOrders() {
  const [, navigate] = useLocation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [newOrderIds, setNewOrderIds] = useState<Set<number>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [tracking, setTracking] = useState("");
  const [availMap, setAvailMap] = useState<Record<number, boolean>>({});
  const sseRef = useRef<EventSource | null>(null);
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  const selected = orders.find(o => o.id === selectedId) ?? null;

  // Load orders
  const loadOrders = useCallback(async (quiet = false) => {
    try {
      const data: Order[] = await api("/orders");
      setOrders(data);
      if (!quiet && data.length > 0 && !selectedId) setSelectedId(data[0].id);
    } catch { /* ignore */ }
    finally { if (!quiet) setLoading(false); }
  }, [selectedId]);

  // Auth check + initial load
  useEffect(() => {
    api("/me").catch(() => navigate("/pharmacy"));
    loadOrders();
  }, []);

  // SSE connection
  useEffect(() => {
    const src = new EventSource(`${BASE}/api/pharmacy/sse`, { withCredentials: true });
    sseRef.current = src;

    src.addEventListener("new_order", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      if (soundRef.current) playNotificationSound();
      setNewOrderIds(prev => new Set([...prev, data.id]));
      loadOrders(true).then(() => {});
    });

    src.addEventListener("order_updated", (e: MessageEvent) => {
      loadOrders(true).then(() => {});
    });

    return () => src.close();
  }, []);

  // When selected order changes, reset state
  useEffect(() => {
    if (selected) {
      setNotes(selected.pharmacistNotes ?? "");
      setTracking(selected.trackingNumber ?? "");
      // Init availability map from current state
      const map: Record<number, boolean> = {};
      for (const item of selected.items) {
        map[item.id] = item.available !== false; // default to true if not yet set
      }
      setAvailMap(map);
      // Clear "new" indicator when viewed
      if (newOrderIds.has(selected.id)) {
        setNewOrderIds(prev => { const next = new Set(prev); next.delete(selected.id); return next; });
      }
    }
  }, [selectedId, selected?.id]);

  async function logout() {
    await api("/logout", { method: "POST" });
    navigate("/pharmacy");
  }

  // Submit availability
  async function submitAvailability() {
    if (!selected) return;
    setActionLoading(true);
    try {
      const items = selected.items.map(it => ({ id: it.id, available: availMap[it.id] ?? true }));
      await api(`/orders/${selected.id}/availability`, {
        method: "PATCH",
        body: JSON.stringify({ items, notes: notes.trim() || undefined }),
      });
      await loadOrders(true);
    } catch (err: any) {
      alert(err?.message ?? "Failed to submit availability");
    } finally { setActionLoading(false); }
  }

  // Confirm payment
  async function confirmPayment() {
    if (!selected) return;
    setActionLoading(true);
    try {
      await api(`/orders/${selected.id}/payment-confirmed`, { method: "PATCH" });
      await loadOrders(true);
    } catch { alert("Failed to confirm payment"); }
    finally { setActionLoading(false); }
  }

  // Mark shipped
  async function markShipped() {
    if (!selected || !tracking.trim()) { alert("Please enter a tracking number"); return; }
    setActionLoading(true);
    try {
      await api(`/orders/${selected.id}/shipping`, {
        method: "PATCH",
        body: JSON.stringify({ trackingNumber: tracking.trim() }),
      });
      await loadOrders(true);
    } catch { alert("Failed to update shipping"); }
    finally { setActionLoading(false); }
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <header className="bg-[#1a3d2b] text-white flex items-center justify-between px-4 py-3 shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <img src={logoImg} alt="Susruta" className="h-8 w-auto object-contain" />
          <div>
            <h1 className="font-bold text-sm leading-tight">Pharmacy Portal</h1>
            <p className="text-green-300 text-[10px]">Susruta Hospital · Medicine Orders</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSoundEnabled(v => !v)}
            title={soundEnabled ? "Mute notifications" : "Enable notifications"}
            className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
            {soundEnabled ? <Bell size={16} /> : <BellOff size={16} />}
          </button>
          <button onClick={() => loadOrders(true)}
            className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
            <RefreshCw size={16} />
          </button>
          <button onClick={logout}
            className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Order list */}
        <aside className="w-72 lg:w-80 bg-white border-r border-gray-200 flex flex-col overflow-hidden shrink-0">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">All Orders</span>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{orders.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8 text-muted-foreground">
                <Package size={32} className="mb-3 opacity-30" />
                <p className="text-sm">No orders yet</p>
                <p className="text-xs mt-1">New orders will appear here</p>
              </div>
            ) : orders.map(order => {
              const meta = STATUS_META[order.status] ?? STATUS_META["submitted"];
              const isNew = newOrderIds.has(order.id);
              const isSelected = selectedId === order.id;
              return (
                <button key={order.id} onClick={() => setSelectedId(order.id)}
                  className={`w-full text-left px-4 py-3.5 border-b border-gray-100 transition-colors relative
                    ${isSelected ? "bg-green-50 border-l-2 border-l-primary" : "hover:bg-gray-50"}`}>
                  {isNew && (
                    <span className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  )}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-semibold text-sm text-foreground truncate">{order.patient.name}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border shrink-0 ${meta.color}`}>
                      #{order.id}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${meta.color}`}>
                      {meta.icon} {meta.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{order.items.length} medicine{order.items.length !== 1 ? "s" : ""} · {fmtDate(order.createdAt)}</p>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right: Order detail */}
        <main className="flex-1 overflow-y-auto">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8 text-muted-foreground">
              <ChevronRight size={40} className="mb-3 opacity-20" />
              <p className="text-sm">Select an order from the left panel to view details</p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
              {/* Order header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Order #{selected.id}</h2>
                  <p className="text-xs text-muted-foreground">Placed {fmtDate(selected.createdAt)}</p>
                </div>
                {(() => {
                  const meta = STATUS_META[selected.status] ?? STATUS_META["submitted"];
                  return (
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${meta.color}`}>
                      {meta.icon} {meta.label}
                    </span>
                  );
                })()}
              </div>

              {/* Patient info */}
              <div className="bg-white rounded-2xl border border-border p-4 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <User size={11} /> Patient Information
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Name</p>
                    <p className="text-sm font-semibold">{selected.patient.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium">{selected.patient.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone size={10} /> Patient Phone</p>
                    <p className="text-sm font-medium">{selected.patient.phone || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone size={10} /> Order Phone</p>
                    <p className="text-sm font-medium">{selected.phone}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin size={10} /> Delivery Address</p>
                  <p className="text-sm font-medium">{selected.deliveryAddress}</p>
                </div>
              </div>

              {/* Medicines list */}
              <div className="bg-white rounded-2xl border border-border p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Pill size={11} /> Medicines ({selected.items.length})
                </h3>

                {/* If submitted: table with checkboxes */}
                {selected.status === "submitted" ? (() => {
                  const allAvail = selected.items.every(it => availMap[it.id] !== false);
                  const someAvail = selected.items.some(it => availMap[it.id] !== false);
                  return (
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b border-border">
                            <th className="px-3 py-2.5 text-left w-10">
                              <input
                                type="checkbox"
                                checked={allAvail}
                                ref={el => { if (el) el.indeterminate = !allAvail && someAvail; }}
                                onChange={e => {
                                  const val = e.target.checked;
                                  setAvailMap(m => Object.fromEntries(selected.items.map(it => [it.id, val])));
                                }}
                                className="w-4 h-4 accent-primary cursor-pointer"
                                title="Select All"
                              />
                            </th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Medicine</th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Instructions</th>
                            <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-12">Qty</th>
                            <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {selected.items.map(item => {
                            const avail = availMap[item.id] !== false;
                            return (
                              <tr key={item.id}
                                onClick={() => setAvailMap(m => ({ ...m, [item.id]: !avail }))}
                                className={`cursor-pointer transition-colors hover:bg-gray-50 ${avail ? "" : "bg-red-50/60"}`}>
                                <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={avail}
                                    onChange={e => setAvailMap(m => ({ ...m, [item.id]: e.target.checked }))}
                                    className="w-4 h-4 accent-primary cursor-pointer"
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <p className={`font-semibold leading-tight ${avail ? "text-foreground" : "text-muted-foreground line-through"}`}>
                                    {item.medicineName}
                                  </p>
                                  {item.instructions && (
                                    <p className="text-xs text-muted-foreground mt-0.5 sm:hidden">{item.instructions}</p>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                                  {item.instructions || "—"}
                                </td>
                                <td className="px-3 py-3 text-center font-bold text-sm">{item.qty}</td>
                                <td className="px-3 py-3 text-center">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                    avail
                                      ? "bg-green-100 text-green-700 border-green-200"
                                      : "bg-red-100 text-red-700 border-red-200"
                                  }`}>
                                    {avail ? "✓ Available" : "✗ Not Available"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })() : (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-border">
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Medicine</th>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Instructions</th>
                          <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-12">Qty</th>
                          <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {selected.items.map(item => (
                          <tr key={item.id} className={item.available === false ? "bg-red-50/60" : ""}>
                            <td className="px-3 py-3">
                              <p className={`font-semibold leading-tight ${item.available === false ? "text-muted-foreground line-through" : "text-foreground"}`}>
                                {item.medicineName}
                              </p>
                              {item.instructions && (
                                <p className="text-xs text-muted-foreground mt-0.5 sm:hidden">{item.instructions}</p>
                              )}
                            </td>
                            <td className="px-3 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                              {item.instructions || "—"}
                            </td>
                            <td className="px-3 py-3 text-center font-bold">{item.qty}</td>
                            <td className="px-3 py-3 text-center">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                item.available === false
                                  ? "bg-red-100 text-red-700 border-red-200"
                                  : item.available === true
                                    ? "bg-green-100 text-green-700 border-green-200"
                                    : "bg-gray-100 text-gray-500 border-gray-200"
                              }`}>
                                {item.available === false ? "✗ Not Available" : item.available === true ? "✓ Available" : "Pending"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Pharmacist notes */}
              {selected.status === "submitted" && (
                <div className="bg-white rounded-2xl border border-border p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <FileText size={11} /> Pharmacist Notes (optional)
                  </h3>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Add any notes for the patient or for internal reference…"
                    rows={3}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              )}

              {selected.pharmacistNotes && selected.status !== "submitted" && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                  <p className="text-xs font-semibold text-amber-800 mb-1 flex items-center gap-1.5"><FileText size={11} /> Pharmacist Notes</p>
                  <p className="text-sm text-amber-900">{selected.pharmacistNotes}</p>
                </div>
              )}

              {/* Tracking info (when shipped) */}
              {selected.status === "shipped" && selected.trackingNumber && (
                <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
                  <p className="text-xs font-semibold text-green-800 mb-1 flex items-center gap-1.5"><Truck size={11} /> Tracking Number</p>
                  <p className="text-base font-bold text-green-900 font-mono">{selected.trackingNumber}</p>
                </div>
              )}

              {/* ACTION BUTTONS */}
              {/* 1. Availability review → submit */}
              {selected.status === "submitted" && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                    Review availability for each medicine above, then submit. If all are available, the patient will be asked to pay.
                    If some are unavailable, the patient will be notified by email to approve the updated order.
                  </p>
                  <button onClick={submitAvailability} disabled={actionLoading}
                    className="w-full bg-primary text-white py-3 rounded-xl font-bold text-sm hover:bg-primary/90 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                    {actionLoading
                      ? <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <><CheckCircle2 size={15} /> Submit Availability & Request Payment</>
                    }
                  </button>
                </div>
              )}

              {/* 2. Waiting for patient approval */}
              {selected.status === "partial_approval_needed" && (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 text-sm text-orange-800">
                  <AlertTriangle size={15} className="inline mr-2" />
                  Waiting for patient to approve the updated order. They have been notified by email.
                </div>
              )}

              {/* 3. Payment requested — waiting for patient to pay */}
              {selected.status === "payment_requested" && (
                <div className="bg-purple-50 border border-purple-200 rounded-2xl px-4 py-3 text-sm text-purple-800">
                  <CreditCard size={15} className="inline mr-2" />
                  Payment has been requested. Waiting for patient to complete payment via PhonePe QR code.
                </div>
              )}

              {/* 4. Patient marked payment done — confirm */}
              {selected.status === "payment_done" && (
                <div className="space-y-2">
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-amber-600 shrink-0" />
                    Patient has marked payment as done. Please verify receipt in your PhonePe account, then confirm.
                  </div>
                  <button onClick={confirmPayment} disabled={actionLoading}
                    className="w-full bg-green-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-green-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                    {actionLoading
                      ? <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <><CheckCircle2 size={15} /> Confirm Payment Received</>
                    }
                  </button>
                </div>
              )}

              {/* 5. Payment confirmed — add tracking */}
              {selected.status === "payment_confirmed" && (
                <div className="space-y-3">
                  <div className="bg-teal-50 border border-teal-200 rounded-2xl px-4 py-3 text-sm text-teal-800">
                    <CheckCircle2 size={15} className="inline mr-2" />
                    Payment confirmed. Now dispatch the order and enter the tracking number below.
                  </div>
                  <div className="bg-white border border-border rounded-2xl p-4">
                    <label className="block text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Hash size={11} /> Courier Tracking Number
                    </label>
                    <input
                      type="text"
                      value={tracking}
                      onChange={e => setTracking(e.target.value)}
                      placeholder="e.g. DTDC-123456789"
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                  <button onClick={markShipped} disabled={actionLoading || !tracking.trim()}
                    className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                    {actionLoading
                      ? <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <><Truck size={15} /> Mark as Shipped</>
                    }
                  </button>
                </div>
              )}

              {/* 6. Shipped */}
              {selected.status === "shipped" && (
                <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-4 text-sm text-green-800 flex items-center gap-3">
                  <Truck size={20} className="text-green-600 shrink-0" />
                  <div>
                    <p className="font-bold">Order Shipped!</p>
                    <p className="text-xs text-green-700 mt-0.5">The patient has been notified with the tracking number.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
