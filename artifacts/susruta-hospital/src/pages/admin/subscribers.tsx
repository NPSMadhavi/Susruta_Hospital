import React, { useState, useEffect, useRef } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Users, Upload, Download, Trash2, RefreshCw, AlertCircle, CheckCircle2, FileSpreadsheet, Send, X, Loader2, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

type Sub = { id: number; name: string; phone: string; email: string; country?: string; subscribedAt: string };

function apiFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${API}${path}`, { credentials: "include", ...opts }).then((r) =>
    r.status === 204 ? null : r.json()
  );
}

// ── Simple rich text → HTML helper (newlines → <br>) ─────────
function textToHtml(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .map((l) => (l === "" ? "<br>" : `<p style="margin:0 0 10px;">${l}</p>`))
    .join("");
}

export default function AdminSubscribers() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [importError, setImportError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Broadcast modal
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [bSubject, setBSubject] = useState("");
  const [bBody, setBBody] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{ sent: number; failed: number; total: number; errors: string[] } | null>(null);
  const [broadcastError, setBroadcastError] = useState("");

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
    const header = "Name,Phone,Email,Country,Subscribed At";
    const rows = subs.map((s) =>
      [s.name, s.phone, s.email, s.country ?? "", new Date(s.subscribedAt).toLocaleString("en-IN")].map((v) => `"${v}"`).join(",")
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

  async function sendBroadcast() {
    if (!bSubject.trim() || !bBody.trim()) return;
    setBroadcasting(true);
    setBroadcastResult(null);
    setBroadcastError("");
    try {
      const res = await fetch(`${API}/subscribers/broadcast`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: bSubject, bodyHtml: textToHtml(bBody) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Broadcast failed.");
      setBroadcastResult(data);
    } catch (err: any) {
      setBroadcastError(err.message || "Broadcast failed.");
    } finally {
      setBroadcasting(false);
    }
  }

  function closeBroadcast() {
    setShowBroadcast(false);
    setBSubject("");
    setBBody("");
    setBroadcastResult(null);
    setBroadcastError("");
  }

  return (
    <AdminLayout>
      {/* ── Broadcast Modal ── */}
      {showBroadcast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-[#1a3d2b] px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mail size={18} className="text-[#D4AF37]" />
                <div>
                  <h2 className="text-white font-bold text-base">Send Update to All Subscribers</h2>
                  <p className="text-white/60 text-xs mt-0.5">{subs.length} recipient{subs.length !== 1 ? "s" : ""} · from updates@susrutahospital.com</p>
                </div>
              </div>
              <button onClick={closeBroadcast} className="text-white/50 hover:text-white p-1 rounded-lg hover:bg-white/10">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {broadcastResult ? (
                <div className="text-center py-4">
                  <div className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3",
                    broadcastResult.failed === 0 ? "bg-green-100" : "bg-amber-100"
                  )}>
                    {broadcastResult.failed === 0
                      ? <CheckCircle2 size={28} className="text-green-600" />
                      : <AlertCircle size={28} className="text-amber-600" />}
                  </div>
                  <h3 className="font-bold text-lg text-foreground mb-1">
                    {broadcastResult.failed === 0 ? "Emails sent!" : "Partially sent"}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {broadcastResult.sent} of {broadcastResult.total} emails delivered successfully.
                    {broadcastResult.failed > 0 && ` ${broadcastResult.failed} failed.`}
                  </p>
                  {broadcastResult.errors.length > 0 && (
                    <div className="mt-3 text-left bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-amber-700 mb-1">Failed deliveries:</p>
                      <ul className="text-xs text-amber-700 space-y-0.5">
                        {broadcastResult.errors.map((e, i) => <li key={i}>• {e}</li>)}
                      </ul>
                    </div>
                  )}
                  <button onClick={closeBroadcast} className="mt-4 px-6 py-2 bg-[#1a3d2b] text-white text-sm font-bold rounded-xl">
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Subject</label>
                    <input
                      type="text"
                      value={bSubject}
                      onChange={(e) => setBSubject(e.target.value)}
                      placeholder="e.g., New appointment slots now open for April"
                      className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b] transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Message</label>
                    <textarea
                      value={bBody}
                      onChange={(e) => setBBody(e.target.value)}
                      rows={7}
                      placeholder={"Dear {{name}},\n\nWe are pleased to inform you that...\n\nWarm regards,\nSusruta Hospital Team"}
                      className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b] transition-all resize-none"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">Each paragraph becomes a separate block. The email will be sent with your Susruta Hospital branding.</p>
                  </div>

                  {broadcastError && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-700">
                      <AlertCircle size={14} /> {broadcastError}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={closeBroadcast}
                      className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={sendBroadcast}
                      disabled={broadcasting || !bSubject.trim() || !bBody.trim()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1a3d2b] text-white text-sm font-bold rounded-xl hover:bg-[#1a3d2b]/90 transition-colors disabled:opacity-60"
                    >
                      {broadcasting
                        ? <><Loader2 size={14} className="animate-spin" /> Sending…</>
                        : <><Send size={14} /> Send to {subs.length} subscriber{subs.length !== 1 ? "s" : ""}</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Subscribers</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {subs.length} {subs.length === 1 ? "person" : "people"} subscribed for launch updates
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={fetchSubs}
            className="p-2 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={15} />
          </button>
          {subs.length > 0 && (
            <>
              <button onClick={downloadCSV}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
                <Download size={14} /> Export CSV
              </button>
              <button onClick={() => setShowBroadcast(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1a3d2b] text-[#1a3d2b] text-sm font-bold hover:bg-[#1a3d2b]/5 transition-colors">
                <Send size={14} /> Send Update
              </button>
            </>
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

      {/* ── Import result ── */}
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

      {/* ── Import instructions ── */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <FileSpreadsheet size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-800 mb-1">Excel / CSV Import Format</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              Your file should have columns: <strong>Name</strong>, <strong>Phone</strong>, <strong>Email</strong>, <strong>Country</strong> (optional). Duplicate emails are skipped automatically. Supported: .xlsx, .xls, .csv
            </p>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
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
                  <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Country</th>
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
                    <td className="px-5 py-3.5 text-muted-foreground text-xs">{s.country || <span className="opacity-30">—</span>}</td>
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
