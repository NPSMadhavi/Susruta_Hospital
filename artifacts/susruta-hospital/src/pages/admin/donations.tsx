import React, { useEffect, useState, useCallback } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Heart, CheckCircle2, Clock, Mail, MailCheck, ChevronDown, IndianRupee, Search, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Donation = {
  id: number;
  patientCode: string | null;
  patientName: string | null;
  patientEmail: string | null;
  amount: string;
  lastSixDigits: string;
  status: "pending" | "verified";
  thankYouSent: boolean;
  createdAt: string;
  appointmentId: number | null;
};

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminDonations() {
  const now = new Date();
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState<number>(now.getMonth() + 1);
  const [filterYear, setFilterYear] = useState<number>(now.getFullYear());
  const [allTime, setAllTime] = useState(false);
  const [search, setSearch] = useState("");
  const [toasting, setToasting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = allTime ? "" : `?month=${filterMonth}&year=${filterYear}`;
      const data = await fetch(`${BASE}/api/admin/donations${params}`, { credentials: "include" }).then(r => r.ok ? r.json() : []);
      setDonations(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }, [filterMonth, filterYear, allTime]);

  useEffect(() => { load(); }, [load]);

  // ── Live SSE updates ──────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource(`${BASE}/api/admin/donations/sse`, { withCredentials: true });
    es.addEventListener("donation_updated", (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as { id: number; status: string; thankYouSent?: boolean };
      setDonations(prev => prev.map(d =>
        d.id === payload.id
          ? { ...d, status: payload.status as "pending" | "verified", ...(payload.thankYouSent !== undefined ? { thankYouSent: payload.thankYouSent } : {}) }
          : d
      ));
    });
    es.addEventListener("new_donation", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as Donation;
      setDonations(prev => [d, ...prev]);
    });
    return () => es.close();
  }, []);

  async function toggleVerify(d: Donation) {
    const newVerified = d.status !== "verified";
    await fetch(`${BASE}/api/admin/donations/${d.id}/verify`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verified: newVerified }),
    });
    setDonations(prev => prev.map(x => x.id === d.id ? { ...x, status: newVerified ? "verified" : "pending" } : x));
  }

  async function sendThankYou(d: Donation) {
    setToasting(`Sending to ${d.patientName}…`);
    const res = await fetch(`${BASE}/api/admin/donations/${d.id}/thank-you`, {
      method: "POST", credentials: "include",
    });
    const json = await res.json();
    if (res.ok) {
      setDonations(prev => prev.map(x => x.id === d.id ? { ...x, thankYouSent: true } : x));
      setToasting("Thank you email sent!");
    } else {
      setToasting(json.message || "Failed to send email. Check SMTP settings.");
    }
    setTimeout(() => setToasting(null), 3500);
  }

  const filtered = donations.filter(d => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      d.patientName?.toLowerCase().includes(q) ||
      d.patientCode?.toLowerCase().includes(q) ||
      d.lastSixDigits.includes(q) ||
      d.amount.includes(q)
    );
  });

  const totalAmount = filtered.reduce((sum, d) => sum + parseFloat(d.amount || "0"), 0);
  const verifiedCount = filtered.filter(d => d.status === "verified").length;
  const pendingCount = filtered.filter(d => d.status === "pending").length;

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <AdminLayout>
      {/* Toast */}
      {toasting && (
        <div className="fixed top-6 right-6 z-50 bg-[#1a3d2b] text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-fade-in">
          {toasting}
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center">
            <Heart size={20} className="text-rose-600" fill="currentColor" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Donations</h1>
            <p className="text-sm text-gray-500">Track patient donations, verify payments, and send thank-you emails.</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center mb-6">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={allTime} onChange={e => setAllTime(e.target.checked)} className="rounded" />
          All time
        </label>
        {!allTime && (
          <>
            <div className="relative">
              <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}
                className="appearance-none bg-white border border-gray-200 rounded-xl pl-3 pr-8 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:border-[#1a3d2b]">
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
                className="appearance-none bg-white border border-gray-200 rounded-xl pl-3 pr-8 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:border-[#1a3d2b]">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </>
        )}
        <button onClick={load} className="p-2 text-gray-400 hover:text-[#1a3d2b] hover:bg-gray-100 rounded-xl transition-colors" title="Refresh">
          <RefreshCw size={15} />
        </button>
        <div className="flex-1 min-w-[180px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by name, Patient ID, amount…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1a3d2b]" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
            <IndianRupee size={20} className="text-emerald-700" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Donated</p>
            <p className="text-2xl font-black text-gray-800">₹{totalAmount.toLocaleString("en-IN")}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
            <CheckCircle2 size={20} className="text-green-700" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Received</p>
            <p className="text-2xl font-black text-green-700">{verifiedCount}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <Clock size={20} className="text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Not Received</p>
            <p className="text-2xl font-black text-amber-600">{pendingCount}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Loading donations…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Heart size={28} className="text-gray-300" />
            </div>
            <p className="text-gray-500 font-semibold">No donations found</p>
            <p className="text-sm text-gray-400 mt-1">
              {allTime ? "No donations recorded yet." : `No donations in ${MONTHS[filterMonth - 1]} ${filterYear}.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Patient</th>
                  <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Amount</th>
                  <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Txn Last 6</th>
                  <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {d.patientCode && (
                          <span className="text-sm font-black text-[#1a3d2b] font-mono tracking-widest bg-[#1a3d2b]/8 border border-[#1a3d2b]/15 rounded-lg px-2 py-1 shrink-0">
                            {d.patientCode}
                          </span>
                        )}
                        <div>
                          <p className="font-semibold text-gray-800">{d.patientName || "—"}</p>
                          <p className="text-xs text-gray-400">{d.patientEmail || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-base font-black text-emerald-700">₹{d.amount}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-mono font-semibold text-gray-700 tracking-widest">xxxxxx{d.lastSixDigits}</span>
                    </td>
                    <td className="px-5 py-4 text-gray-500 whitespace-nowrap">{fmtDate(d.createdAt)}</td>
                    <td className="px-5 py-4">
                      <button onClick={() => toggleVerify(d)}
                        className="flex items-center gap-2 cursor-pointer group select-none">
                        <div className={cn(
                          "relative w-10 h-6 rounded-full transition-colors duration-200 shrink-0",
                          d.status === "verified" ? "bg-green-500" : "bg-gray-200 group-hover:bg-gray-300"
                        )}>
                          <div className={cn(
                            "absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                            d.status === "verified" ? "translate-x-5" : "translate-x-1"
                          )} />
                        </div>
                        <span className={cn("text-xs font-semibold", d.status === "verified" ? "text-green-700" : "text-gray-400")}>
                          {d.status === "verified" ? "Received" : "Not Received"}
                        </span>
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => !d.thankYouSent && sendThankYou(d)}
                        disabled={d.thankYouSent}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                          d.thankYouSent
                            ? "bg-gray-50 border-gray-200 text-gray-400 cursor-default"
                            : "bg-[#1a3d2b]/5 border-[#1a3d2b]/20 text-[#1a3d2b] hover:bg-[#1a3d2b]/10"
                        )}>
                        {d.thankYouSent ? <MailCheck size={12} /> : <Mail size={12} />}
                        {d.thankYouSent ? "Sent" : "Send Thanks"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
