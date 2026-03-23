import React, { useState, useEffect, useRef } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Users, Upload, Download, Trash2, RefreshCw, AlertCircle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

type Sub = { id: number; name: string; phone: string; email: string; subscribedAt: string };

function apiFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${API}${path}`, { credentials: "include", ...opts }).then((r) => r.json());
}

export default function AdminSubscribers() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [importError, setImportError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function fetchSubs() {
    setLoading(true);
    try {
      const data = await apiFetch("/subscribers");
      setSubs(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchSubs(); }, []);

  async function deleteSub(id: number, name: string) {
    if (!confirm(`Remove ${name} from subscribers?`)) return;
    await apiFetch(`/subscribers/${id}`, { method: "DELETE" });
    setSubs((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    setImportResult(null);
    setImportError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/subscribers/import`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.message || "Import failed.");
      } else {
        setImportResult(data);
        await fetchSubs();
      }
    } catch {
      setImportError("Upload failed. Please try again.");
    } finally {
      setImporting(false);
    }
  }

  function downloadCSV() {
    const header = "Name,Phone,Email,Subscribed At";
    const rows = subs.map((s) =>
      [s.name, s.phone, s.email, new Date(s.subscribedAt).toLocaleString("en-IN")].map((v) => `"${v}"`).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `susruta-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Subscribers</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {subs.length} {subs.length === 1 ? "person" : "people"} subscribed for launch updates
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchSubs}
            className="p-2 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={15} />
          </button>
          {subs.length > 0 && (
            <button onClick={downloadCSV}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
              <Download size={14} /> Export CSV
            </button>
          )}
          <button onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1a3d2b] text-white text-sm font-bold hover:bg-[#1a3d2b]/90 transition-colors disabled:opacity-60">
            {importing
              ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Importing…</>
              : <><Upload size={14} /> Import Excel</>}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
        </div>
      </div>

      {/* Import result */}
      {importResult && (
        <div className={cn(
          "rounded-2xl border p-4 mb-6 flex items-start gap-3",
          importResult.skipped > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"
        )}>
          <CheckCircle2 size={18} className={importResult.skipped > 0 ? "text-amber-600 mt-0.5" : "text-green-600 mt-0.5"} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground">
              Import complete — {importResult.imported} added{importResult.skipped > 0 ? `, ${importResult.skipped} skipped` : ""}
            </p>
            {importResult.errors.length > 0 && (
              <ul className="mt-2 text-xs text-amber-800 space-y-0.5">
                {importResult.errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            )}
          </div>
          <button onClick={() => setImportResult(null)} className="text-muted-foreground hover:text-foreground text-xs flex-shrink-0">Dismiss</button>
        </div>
      )}
      {importError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 mb-6 flex items-center gap-3 text-red-700 text-sm">
          <AlertCircle size={16} /> {importError}
          <button onClick={() => setImportError("")} className="ml-auto text-xs hover:underline">Dismiss</button>
        </div>
      )}

      {/* Import instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <FileSpreadsheet size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-800 mb-1">Excel / CSV Import Format</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              Your file should have columns: <strong>Name</strong>, <strong>Phone</strong>, <strong>Email</strong> (in any order, column names are flexible). Duplicate emails are skipped automatically. Supported formats: .xlsx, .xls, .csv
            </p>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <RefreshCw size={20} className="animate-spin mr-2" /> Loading…
        </div>
      ) : subs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users size={40} className="mx-auto mb-3 opacity-25" />
          <p className="font-medium">No subscribers yet</p>
          <p className="text-sm mt-1">People who subscribe via the popup on the home page will appear here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">#</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Name</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Phone</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Email</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Subscribed</th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody>
                {subs.map((s, i) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5 text-muted-foreground text-xs">{i + 1}</td>
                    <td className="px-5 py-3.5 font-medium text-foreground">{s.name}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{s.phone}</td>
                    <td className="px-5 py-3.5 text-primary">{s.email}</td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs whitespace-nowrap">
                      {new Date(s.subscribedAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => deleteSub(s.id, s.name)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
