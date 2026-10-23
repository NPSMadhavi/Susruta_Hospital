import React, { useEffect, useState, useCallback } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Trash2, AlertTriangle, Search, RefreshCw, UserX, CheckCircle2, Clock, Loader2, X, ShieldAlert } from "lucide-react";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface AccountDeleteRequestItem {
  id: number;
  patientId: number | null;
  patientCode: string | null;
  patientName: string;
  email: string;
  status: "PENDING" | "CANCELLED" | "ELIGIBLE_FOR_DELETION" | "DELETED" | "COMPLETED" | string;
  reason: string | null;
  createdAt: string;
  cancellationDeadline: string | null;
  cancelledAt: string | null;
  processedAt: string | null;
  processedBy: string | null;
  notes: string | null;
  daysRemaining?: number;
  isCancellationActive?: boolean;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

export default function AdminAccountDeleteRequests() {
  const PAGE_SIZE = 10;
  const [requests, setRequests] = useState<AccountDeleteRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Confirmation dialog state
  const [selectedRequest, setSelectedRequest] = useState<AccountDeleteRequestItem | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successToast, setSuccessToast] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/account-deletion-requests`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to load deletion requests:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const filteredRequests = requests.filter((r) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (r.patientCode && r.patientCode.toLowerCase().includes(q)) ||
      (r.patientName && r.patientName.toLowerCase().includes(q)) ||
      (r.email && r.email.toLowerCase().includes(q)) ||
      (r.status && r.status.toLowerCase().includes(q))
    );
  });

  const totalPages = Math.ceil(filteredRequests.length / PAGE_SIZE) || 1;
  const paginated = filteredRequests.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function handlePermanentDelete() {
    if (!selectedRequest) return;
    setIsProcessing(true);
    setErrorMessage("");
    try {
      const res = await fetch(
        `${BASE}/api/admin/account-deletion-requests/${selectedRequest.id}/process-delete`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.message || "Failed to permanently delete patient account.");
      }

      setSuccessToast(`Account for ${selectedRequest.patientName} was permanently deleted.`);
      setSelectedRequest(null);
      await loadRequests();

      // Dispatch global count update event for sidebar
      window.dispatchEvent(
        new CustomEvent("susruta:deletion_request_count_change", {
          detail: { delta: -1 },
        })
      );

      setTimeout(() => setSuccessToast(""), 4500);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to permanently delete account.");
    } finally {
      setIsProcessing(false);
    }
  }

  const pendingGraceCount = requests.filter((r) => r.status === "PENDING").length;
  const eligibleCount = requests.filter((r) => r.status === "ELIGIBLE_FOR_DELETION").length;
  const cancelledCount = requests.filter((r) => r.status === "CANCELLED").length;

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-7xl mx-auto font-sans">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Account Delete Requests</h1>
            <p className="text-sm text-gray-500 mt-1">
              Review and process patient account permanent deletion requests following the 15-day cancellation period.
            </p>
          </div>
          <button
            onClick={loadRequests}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-colors shadow-sm self-start sm:self-auto cursor-pointer"
          >
            <RefreshCw size={14} className={cn(loading && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* Success toast */}
        {successToast && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm font-medium text-emerald-800 flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
        )}

        {/* Stats & Search Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-rose-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wider text-gray-400">Eligible for Deletion</p>
              <p className="text-xl font-bold text-rose-700">{eligibleCount}</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
              <Clock size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wider text-gray-400">Grace Period Active</p>
              <p className="text-xl font-bold text-amber-700">{pendingGraceCount}</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-600 shrink-0">
              <X size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wider text-gray-400">Cancelled by Patient</p>
              <p className="text-xl font-bold text-gray-700">{cancelledCount}</p>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Total Requests: <strong className="text-gray-900">{requests.length}</strong></span>
          </div>

          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by ID, name, email, status..."
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all"
            />
          </div>
        </div>

        {/* Requests Table */}
        <div className={cn("bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col", filteredRequests.length > PAGE_SIZE && "min-h-[500px]")}>
          {loading ? (
            <div className="py-20 text-center text-gray-400 text-sm flex flex-col items-center justify-center gap-2">
              <Loader2 size={24} className="animate-spin text-[#D95B2F]" />
              <span>Loading account deletion requests…</span>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <UserX size={28} className="text-gray-300" />
              </div>
              <p className="text-gray-700 font-bold text-base">No account deletion requests</p>
              <p className="text-xs text-gray-400 mt-1">
                {search ? "No deletion requests matched your search query." : "There are currently no patient account deletion requests."}
              </p>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/80">
                      <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 tracking-wide">Patient ID</th>
                      <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 tracking-wide">Patient Name</th>
                      <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 tracking-wide">Email</th>
                      <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 tracking-wide">Requested On</th>
                      <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 tracking-wide">Cancellation Deadline</th>
                      <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 tracking-wide">Status &amp; Period</th>
                      <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginated.map((r) => {
                      const isGraceActive = r.status === "PENDING" && r.isCancellationActive !== false;
                      const isEligible = r.status === "ELIGIBLE_FOR_DELETION";
                      const isCancelled = r.status === "CANCELLED";
                      const isDeleted = r.status === "DELETED" || r.status === "COMPLETED";

                      return (
                        <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-5 py-4 font-mono font-bold text-xs text-gray-900">
                            {r.patientCode || (r.patientId ? `PID-${r.patientId}` : `REQ-${r.id}`)}
                          </td>
                          <td className="px-5 py-4 font-semibold text-gray-900 text-sm">
                            {r.patientName || "—"}
                          </td>
                          <td className="px-5 py-4 text-xs text-gray-600 font-mono">
                            {r.email || "—"}
                          </td>
                          <td className="px-5 py-4 text-xs text-gray-500 whitespace-nowrap">
                            {fmtDate(r.createdAt)}
                          </td>
                          <td className="px-5 py-4 text-xs text-gray-500 whitespace-nowrap">
                            {fmtDate(r.cancellationDeadline)}
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            {isEligible ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2.5 py-0.5">
                                <AlertTriangle size={11} /> Eligible for Deletion
                              </span>
                            ) : isGraceActive ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                                <Clock size={11} /> Pending ({r.daysRemaining ?? 0}d left)
                              </span>
                            ) : isCancelled ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-600 bg-gray-100 border border-gray-200 rounded-full px-2.5 py-0.5">
                                <X size={11} /> Cancelled by Patient
                              </span>
                            ) : isDeleted ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5">
                                <CheckCircle2 size={11} /> Permanently Deleted
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-600 bg-gray-100 border border-gray-200 rounded-full px-2.5 py-0.5">
                                {r.status}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            {isEligible ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setErrorMessage("");
                                  setSelectedRequest(r);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                              >
                                <Trash2 size={12} /> Delete Account
                              </button>
                            ) : isGraceActive ? (
                              <span
                                className="inline-flex items-center gap-1 text-xs text-amber-800 bg-amber-50/80 border border-amber-200 font-medium px-2.5 py-1 rounded-xl cursor-not-allowed select-none"
                                title={`15-day cancellation period active until ${fmtDate(r.cancellationDeadline)}. Cannot delete until period expires.`}
                              >
                                <Clock size={12} className="text-amber-600" /> In Grace Period
                              </span>
                            ) : isCancelled ? (
                              <span className="text-xs text-gray-400 font-medium">Cancelled</span>
                            ) : (
                              <span className="text-xs text-gray-400 font-medium">Processed</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="border-t border-gray-100 p-4">
                  <AdminPagination
                    currentPage={currentPage}
                    totalItems={filteredRequests.length}
                    pageSize={PAGE_SIZE}
                    onPageChange={setCurrentPage}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── ADMIN PERMANENT DELETION CONFIRMATION MODAL ── */}
      <Dialog open={!!selectedRequest} onOpenChange={(open) => { if (!open && !isProcessing) setSelectedRequest(null); }}>
        <DialogContent className="admin-panel max-w-md rounded-3xl bg-white p-6 sm:p-7 font-sans border-0 shadow-2xl">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center text-red-700 shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <DialogTitle
                  className="text-lg font-bold text-gray-900 font-sans tracking-normal !font-sans"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                >
                  Delete Patient Account Permanently?
                </DialogTitle>
                <p className="text-xs text-gray-500 font-sans" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  Destructive administrative operation
                </p>
              </div>
            </div>

            <DialogDescription className="text-xs sm:text-sm text-gray-600 leading-relaxed space-y-2">
              <span className="block">
                The 15-day cancellation grace period has elapsed. This action will permanently delete this patient's account and eligible data and cannot be undone.
              </span>
              {selectedRequest && (
                <div className="mt-3 p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-1">
                  <p className="font-semibold text-gray-800">Patient Details:</p>
                  <p className="text-gray-600">Name: <span className="font-bold text-gray-900">{selectedRequest.patientName}</span></p>
                  <p className="text-gray-600">ID: <span className="font-mono font-bold text-gray-900">{selectedRequest.patientCode || `PID-${selectedRequest.patientId}`}</span></p>
                  <p className="text-gray-600">Email: <span className="font-mono text-gray-900">{selectedRequest.email}</span></p>
                  <p className="text-gray-600">Requested: <span className="font-medium text-gray-900">{fmtDate(selectedRequest.createdAt)}</span></p>
                  <p className="text-gray-600">Deadline: <span className="font-medium text-gray-900">{fmtDate(selectedRequest.cancellationDeadline)} (Expired)</span></p>
                </div>
              )}
            </DialogDescription>

            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-700">
                {errorMessage}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                disabled={isProcessing}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePermanentDelete}
                disabled={isProcessing}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isProcessing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Delete Permanently
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
