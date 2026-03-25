import React, { useState, useEffect, useRef, useCallback } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  Users, Upload, Download, Trash2, RefreshCw, AlertCircle,
  CheckCircle2, FileSpreadsheet, Send, X, Loader2, Mail, Bell,
  Bold, Italic, Underline, List, ListOrdered, Quote, Minus,
  Heading2, Heading3, Eye, Pencil, Link2, Eraser, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

type Sub = { id: number; name: string; phone: string; email: string; country?: string; subscribedAt: string; unsubscribed: boolean; unsubscribedAt?: string | null; unsubscribeReason?: string | null };
type BroadcastEvent =
  | { type: "start"; total: number; delayMs: number }
  | { type: "sent"; current: number; total: number; email: string; name: string }
  | { type: "error"; current: number; total: number; email: string; name: string; message: string }
  | { type: "tick" }
  | { type: "done"; sent: number; failed: number; total: number };

function apiFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${API}${path}`, { credentials: "include", ...opts }).then((r) =>
    r.status === 204 ? null : r.json()
  );
}

// ── Notification hook ────────────────────────────────────────
function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const permRef = useRef(permission);
  useEffect(() => { permRef.current = permission; }, [permission]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  function getAudioCtx(): AudioContext | null {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      return audioCtxRef.current;
    } catch { return null; }
  }

  useEffect(() => {
    const warmUp = () => { getAudioCtx()?.resume().catch(() => {}); };
    document.addEventListener("click", warmUp, { once: true });
    return () => document.removeEventListener("click", warmUp);
  }, []);

  function playSound() {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      ctx.resume().then(() => {
        [[660, 0, 0.12], [880, 0.15, 0.12], [1100, 0.30, 0.18]].forEach(([freq, start, dur]) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = "sine"; osc.frequency.value = freq;
          gain.gain.setValueAtTime(0, ctx.currentTime + start);
          gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
          osc.start(ctx.currentTime + start);
          osc.stop(ctx.currentTime + start + dur + 0.05);
        });
      });
    } catch {}
  }

  async function requestPermission() {
    if (typeof Notification === "undefined") return;
    getAudioCtx()?.resume().catch(() => {});
    const perm = await Notification.requestPermission();
    setPermission(perm); permRef.current = perm;
  }

  function notify(title: string, body: string) {
    playSound();
    if (permRef.current === "granted") {
      try { new Notification(title, { body, icon: "/favicon.png" }); } catch {}
    }
  }

  return { permission, requestPermission, notify };
}

// ── Rich Text Toolbar Button ──────────────────────────────────
function ToolBtn({ title, onClick, active, children }: {
  title: string; onClick: () => void; active?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={cn(
        "p-1.5 rounded-lg transition-colors text-sm leading-none",
        active ? "bg-[#1a3d2b] text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// ── Email Preview wrapper (mirrors the real email template) ──
function EmailPreview({ subject, bodyHtml }: { subject: string; bodyHtml: string }) {
  const styledBody = bodyHtml
    .replace(/<h1(?=[> ])/g, '<h1 style="color:#1a3d2b;font-size:22px;font-weight:bold;margin:0 0 14px;"')
    .replace(/<h2(?=[> ])/g, '<h2 style="color:#1a3d2b;font-size:18px;font-weight:bold;margin:0 0 12px;"')
    .replace(/<h3(?=[> ])/g, '<h3 style="color:#2d6a4f;font-size:15px;font-weight:bold;margin:0 0 10px;"')
    .replace(/<p(?=[> ])/g, '<p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 12px;"')
    .replace(/<ul(?=[> ])/g, '<ul style="color:#555;font-size:14px;line-height:1.7;margin:0 0 12px;padding-left:20px;"')
    .replace(/<ol(?=[> ])/g, '<ol style="color:#555;font-size:14px;line-height:1.7;margin:0 0 12px;padding-left:20px;"')
    .replace(/<li(?=[> ])/g, '<li style="margin-bottom:4px;"')
    .replace(/<blockquote(?=[> ])/g, '<blockquote style="border-left:4px solid #2d6a4f;margin:0 0 14px;padding:12px 16px;background:#f0f7f4;border-radius:0 6px 6px 0;font-style:italic;"')
    .replace(/<hr(?=[> /])/g, '<hr style="border:none;border-top:1px solid #e8e8e8;margin:18px 0;"')
    .replace(/<strong(?=[> ])/g, '<strong style="color:#333;"');

  return (
    <div className="bg-gray-100 rounded-xl p-4 overflow-auto max-h-[420px]">
      <div style={{ maxWidth: 480, margin: "0 auto", background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.08)", fontFamily: "Arial,sans-serif" }}>
        {/* Header */}
        <div style={{ background: "#1a3d2b", padding: "24px 28px", textAlign: "center" }}>
          <div style={{ color: "#fff", fontWeight: "bold", fontSize: 18, letterSpacing: 0.5 }}>SUSRUTA HOSPITAL</div>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 4 }}>Authentic Ayurvedic Healthcare · Tirupati</div>
        </div>
        {/* Body */}
        <div style={{ padding: "28px 28px 20px" }}>
          <p style={{ color: "#444", fontSize: 14, margin: "0 0 18px" }}>Namaste, <strong>[Subscriber Name]</strong> 🙏</p>
          <div dangerouslySetInnerHTML={{ __html: styledBody || '<p style="color:#aaa;font-size:14px;">Your message will appear here…</p>' }} />
          <hr style={{ border: "none", borderTop: "1px solid #f0f0f0", margin: "20px 0 14px" }} />
          <p style={{ color: "#bbb", fontSize: 10, margin: 0, lineHeight: 1.6 }}>
            You are receiving this because you subscribed for updates from Susruta Hospital.<br />
            To unsubscribe, reply with the subject <em>Unsubscribe</em>.
          </p>
        </div>
        {/* Footer */}
        <div style={{ padding: "10px 28px 20px", borderTop: "1px solid #f0f0f0" }}>
          <p style={{ color: "#ccc", fontSize: 10, margin: 0, textAlign: "center" }}>
            Susruta Hospital · 119, Ramulavari North Mada Street, Tirupati - 517 507<br />
            Phone: +91 9492068180 · susrutahospital.com
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Compose Modal ─────────────────────────────────────────────
function ComposeModal({ count, onClose }: { count: number; onClose: () => void }) {
  const [tab, setTab] = useState<"compose" | "preview">("compose");
  const [subject, setSubject] = useState("");
  const [delayMs, setDelayMs] = useState(2000);
  const editorRef = useRef<HTMLDivElement>(null);
  const [bodyHtml, setBodyHtml] = useState("");

  // Streaming state
  const [phase, setPhase] = useState<"compose" | "sending" | "done">("compose");
  const [events, setEvents] = useState<BroadcastEvent[]>([]);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [doneResult, setDoneResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events]);

  // Capture bodyHtml whenever tab switches to preview
  function captureHtml() {
    return editorRef.current?.innerHTML || "";
  }

  function handleTabChange(t: "compose" | "preview") {
    if (t === "preview") setBodyHtml(captureHtml());
    setTab(t);
  }

  // Toolbar commands
  function exec(cmd: string, value?: string) {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  }

  async function send() {
    const html = captureHtml();
    if (!subject.trim() || !html.trim() || html === "<br>") {
      setError("Please add a subject and message body.");
      return;
    }
    setError("");
    setPhase("sending");
    setEvents([]);
    setCurrent(0);

    try {
      const response = await fetch(`${API}/subscribers/broadcast`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, bodyHtml: html, delayMs }),
      });

      if (!response.ok) {
        const err = await response.json();
        setError(err.message || "Broadcast failed.");
        setPhase("compose");
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line) as BroadcastEvent;
            if (ev.type === "tick") continue;
            if (ev.type === "start") {
              setTotal(ev.total);
            } else if (ev.type === "sent" || ev.type === "error") {
              setCurrent(ev.current);
              setEvents((prev) => [...prev, ev]);
            } else if (ev.type === "done") {
              setDoneResult({ sent: ev.sent, failed: ev.failed, total: ev.total });
              setPhase("done");
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setError(err.message || "Connection error during broadcast.");
      setPhase("compose");
    }
  }

  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const sentCount = events.filter((e) => e.type === "sent").length;
  const failedCount = events.filter((e) => e.type === "error").length;

  // Estimated time remaining
  function eta() {
    const remaining = total - current;
    const secs = Math.ceil((remaining * delayMs) / 1000);
    if (secs < 60) return `~${secs}s remaining`;
    return `~${Math.ceil(secs / 60)}m remaining`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="bg-[#1a3d2b] px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <Mail size={17} className="text-[#D4AF37]" />
            <div>
              <h2 className="text-white font-bold text-sm">Send Newsletter to All Subscribers</h2>
              <p className="text-white/55 text-xs mt-0.5">
                {count} recipient{count !== 1 ? "s" : ""} · from updates@susrutahospital.com · {delayMs / 1000}s between sends
              </p>
            </div>
          </div>
          {phase !== "sending" && (
            <button onClick={onClose} className="text-white/50 hover:text-white p-1 rounded-lg hover:bg-white/10">
              <X size={17} />
            </button>
          )}
        </div>

        {/* ── Sending / Done Phase ── */}
        {phase !== "compose" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Progress bar */}
            <div className="px-6 pt-5 pb-3 flex-shrink-0">
              {phase === "done" && doneResult ? (
                <div className="text-center py-2">
                  <div className={cn("w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3", doneResult.failed === 0 ? "bg-green-100" : "bg-amber-100")}>
                    {doneResult.failed === 0 ? <CheckCircle2 size={28} className="text-green-600" /> : <AlertCircle size={28} className="text-amber-600" />}
                  </div>
                  <h3 className="font-bold text-lg text-foreground">{doneResult.failed === 0 ? "All emails delivered!" : "Broadcast complete"}</h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    {doneResult.sent} sent{doneResult.failed > 0 ? `, ${doneResult.failed} failed` : ""} out of {doneResult.total}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-foreground">Sending {current} of {total}…</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock size={11} /> {eta()}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-full bg-[#1a3d2b] rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="text-green-600 font-medium">✓ {sentCount} sent</span>
                    {failedCount > 0 && <span className="text-red-500 font-medium">✕ {failedCount} failed</span>}
                  </div>
                </>
              )}
            </div>

            {/* Live log */}
            <div ref={logRef} className="flex-1 overflow-y-auto mx-6 mb-5 border border-border rounded-xl bg-muted/30 text-xs font-mono">
              {events.length === 0 && phase === "sending" && (
                <div className="p-4 text-muted-foreground flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin" /> Connecting…
                </div>
              )}
              {events.filter(e => e.type === "sent" || e.type === "error").map((ev, i) => (
                ev.type === "sent" ? (
                  <div key={i} className="px-4 py-1.5 border-b border-border/40 last:border-0 flex items-center gap-2 text-green-700">
                    <CheckCircle2 size={11} className="flex-shrink-0" />
                    <span className="font-medium truncate">{(ev as any).name}</span>
                    <span className="text-green-600/60 truncate">&lt;{(ev as any).email}&gt;</span>
                    <span className="ml-auto text-green-600/50 flex-shrink-0">{(ev as any).current}/{total}</span>
                  </div>
                ) : (
                  <div key={i} className="px-4 py-1.5 border-b border-border/40 last:border-0 flex items-center gap-2 text-red-600">
                    <X size={11} className="flex-shrink-0" />
                    <span className="font-medium truncate">{(ev as any).name}</span>
                    <span className="text-red-400 truncate text-[10px]">{(ev as any).message}</span>
                    <span className="ml-auto text-red-400/50 flex-shrink-0">{(ev as any).current}/{total}</span>
                  </div>
                )
              ))}
            </div>

            {phase === "done" && (
              <div className="px-6 pb-5 flex-shrink-0">
                <button onClick={onClose} className="w-full py-2.5 bg-[#1a3d2b] text-white text-sm font-bold rounded-xl">
                  Done
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Compose Phase ── */}
        {phase === "compose" && (
          <>
            {/* Tabs */}
            <div className="flex border-b border-border flex-shrink-0">
              {(["compose", "preview"] as const).map((t) => (
                <button key={t} onClick={() => handleTabChange(t)}
                  className={cn("flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                    tab === t ? "border-[#1a3d2b] text-[#1a3d2b]" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  {t === "compose" ? <Pencil size={13} /> : <Eye size={13} />}
                  {t === "compose" ? "Compose" : "Preview"}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Subject + delay */}
              <div className="px-6 pt-4 pb-3 space-y-3 flex-shrink-0">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Subject</label>
                    <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                      placeholder="e.g., New appointment slots open for April!"
                      className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b]" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Delay</label>
                    <select value={delayMs} onChange={(e) => setDelayMs(Number(e.target.value))}
                      className="px-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 bg-white">
                      <option value={1000}>1s — fast</option>
                      <option value={2000}>2s — safe</option>
                      <option value={3000}>3s — careful</option>
                      <option value={5000}>5s — very safe</option>
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock size={10} /> Sending {count} emails with {delayMs / 1000}s gaps will take ~{Math.ceil((count * delayMs) / 1000 / 60)} min.
                  &nbsp;·&nbsp;Sequential sending avoids spam filters.
                </p>
              </div>

              {tab === "compose" ? (
                <div className="px-6 pb-4">
                  {/* Toolbar */}
                  <div className="flex items-center gap-0.5 flex-wrap border border-border rounded-t-xl px-2 py-1.5 bg-muted/30">
                    <ToolBtn title="Bold (Ctrl+B)" onClick={() => exec("bold")}><Bold size={13} /></ToolBtn>
                    <ToolBtn title="Italic (Ctrl+I)" onClick={() => exec("italic")}><Italic size={13} /></ToolBtn>
                    <ToolBtn title="Underline (Ctrl+U)" onClick={() => exec("underline")}><Underline size={13} /></ToolBtn>
                    <div className="w-px h-4 bg-border mx-1" />
                    <ToolBtn title="Heading 2" onClick={() => exec("formatBlock", "h2")}><Heading2 size={13} /></ToolBtn>
                    <ToolBtn title="Heading 3" onClick={() => exec("formatBlock", "h3")}><Heading3 size={13} /></ToolBtn>
                    <ToolBtn title="Normal paragraph" onClick={() => exec("formatBlock", "p")} >
                      <span className="text-[11px] font-medium leading-none px-0.5">¶</span>
                    </ToolBtn>
                    <div className="w-px h-4 bg-border mx-1" />
                    <ToolBtn title="Bullet list" onClick={() => exec("insertUnorderedList")}><List size={13} /></ToolBtn>
                    <ToolBtn title="Numbered list" onClick={() => exec("insertOrderedList")}><ListOrdered size={13} /></ToolBtn>
                    <div className="w-px h-4 bg-border mx-1" />
                    <ToolBtn title="Blockquote" onClick={() => exec("formatBlock", "blockquote")}><Quote size={13} /></ToolBtn>
                    <ToolBtn title="Horizontal divider" onClick={() => exec("insertHorizontalRule")}><Minus size={13} /></ToolBtn>
                    <div className="w-px h-4 bg-border mx-1" />
                    <ToolBtn title="Insert link" onClick={() => {
                      const url = prompt("Enter URL:");
                      if (url) exec("createLink", url);
                    }}><Link2 size={13} /></ToolBtn>
                    <ToolBtn title="Clear formatting" onClick={() => exec("removeFormat")}><Eraser size={13} /></ToolBtn>
                  </div>

                  {/* Editor */}
                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={() => {}}
                    className="min-h-[220px] border border-border border-t-0 rounded-b-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b] leading-relaxed"
                    style={{ wordBreak: "break-word" }}
                    data-placeholder="Write your message here…"
                    onFocus={(e) => {
                      const el = e.currentTarget;
                      if (!el.innerHTML || el.innerHTML === "<br>") {
                        el.innerHTML = "";
                      }
                    }}
                  />
                  <style>{`
                    [contenteditable]:empty:before {
                      content: attr(data-placeholder);
                      color: #9ca3af;
                      pointer-events: none;
                    }
                    [contenteditable] h2 { color: #1a3d2b; font-size: 1.15rem; font-weight: 700; margin: 0.6rem 0 0.4rem; }
                    [contenteditable] h3 { color: #2d6a4f; font-size: 1rem; font-weight: 600; margin: 0.5rem 0 0.3rem; }
                    [contenteditable] blockquote { border-left: 4px solid #2d6a4f; padding: 8px 14px; background: #f0f7f4; border-radius: 0 6px 6px 0; margin: 0.5rem 0; font-style: italic; }
                    [contenteditable] ul { padding-left: 1.3rem; }
                    [contenteditable] ol { padding-left: 1.3rem; }
                    [contenteditable] hr { border: none; border-top: 1px solid #e5e7eb; margin: 0.8rem 0; }
                    [contenteditable] a { color: #2d6a4f; text-decoration: underline; }
                  `}</style>
                </div>
              ) : (
                <div className="px-6 pb-4">
                  <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Eye size={11} /> Preview of how the email will look in inboxes
                  </p>
                  <EmailPreview subject={subject} bodyHtml={bodyHtml} />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border flex items-center gap-3 flex-shrink-0 bg-white">
              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm flex-1">
                  <AlertCircle size={14} /> {error}
                </div>
              )}
              {!error && (
                <p className="text-xs text-muted-foreground flex-1">
                  Emails are sent one by one with {delayMs / 1000}s gaps using the Susruta Hospital branded template.
                </p>
              )}
              <button type="button" onClick={onClose}
                className="px-4 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button type="button" onClick={send}
                disabled={!subject.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#1a3d2b] text-white text-sm font-bold rounded-xl hover:bg-[#1a3d2b]/90 disabled:opacity-50 transition-colors">
                <Send size={14} /> Send to {count} subscriber{count !== 1 ? "s" : ""}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function AdminSubscribers() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [importError, setImportError] = useState("");
  const [showCompose, setShowCompose] = useState(false);
  const [newSubFlash, setNewSubFlash] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { permission, requestPermission, notify } = useNotifications();

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

  useEffect(() => {
    let es: EventSource;
    let pollTimer: ReturnType<typeof setTimeout>;
    function connect() {
      es = new EventSource(`${API}/subscribers/notifications`, { withCredentials: true });
      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "new_subscriber" && msg.subscriber) {
            const sub: Sub = msg.subscriber;
            setSubs((prev) => prev.some((s) => s.id === sub.id) ? prev : [sub, ...prev]);
            setNewSubFlash(sub.id);
            setTimeout(() => setNewSubFlash(null), 4000);
            notify("🌿 New Subscriber!", `${sub.name}${sub.country ? ` · ${sub.country}` : ""} just subscribed.`);
          }
        } catch {}
      };
      es.onerror = () => {
        es.close();
        pollTimer = setTimeout(() => { fetchSubs(); connect(); }, 30000);
      };
    }
    connect();
    return () => { es?.close(); clearTimeout(pollTimer); };
  }, []); // eslint-disable-line

  async function deleteSub(id: number, name: string) {
    if (!confirm(`Remove ${name} from subscribers?`)) return;
    await apiFetch(`/subscribers/${id}`, { method: "DELETE" });
    setSubs((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true); setImportResult(null); setImportError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/subscribers/import`, { method: "POST", credentials: "include", body: fd });
      const data = await res.json();
      if (!res.ok) setImportError(data.message || "Import failed.");
      else { setImportResult(data); await fetchSubs(); }
    } catch { setImportError("Upload failed. Please try again."); }
    finally { setImporting(false); }
  }

  function downloadCSV() {
    const header = "Name,Phone,Email,Country,Subscribed At";
    const rows = subs.map((s) =>
      [s.name, s.phone, s.email, s.country ?? "", new Date(s.subscribedAt).toLocaleString("en-IN")].map((v) => `"${v}"`).join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `susruta-subscribers-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminLayout>
      {showCompose && <ComposeModal count={subs.length} onClose={() => setShowCompose(false)} />}

      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Subscribers</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {subs.length} {subs.length === 1 ? "person" : "people"} subscribed for launch updates
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {permission !== "granted" ? (
            <button onClick={requestPermission}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100">
              <Bell size={13} /> Enable Notifications
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-50 text-green-700 text-xs font-medium border border-green-200">
              <Bell size={13} /> Notifications On
            </div>
          )}
          <button onClick={fetchSubs} className="p-2 rounded-xl border border-border text-muted-foreground hover:bg-muted">
            <RefreshCw size={15} />
          </button>
          {subs.length > 0 && (
            <>
              <button onClick={downloadCSV}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted">
                <Download size={14} /> Export CSV
              </button>
              <button onClick={() => setShowCompose(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1a3d2b] text-[#1a3d2b] text-sm font-bold hover:bg-[#1a3d2b]/5">
                <Mail size={14} /> Send Newsletter
              </button>
            </>
          )}
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1a3d2b] text-white text-sm font-bold hover:bg-[#1a3d2b]/90 disabled:opacity-60">
            {importing ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Importing…</> : <><Upload size={14} /> Import Excel</>}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
        </div>
      </div>

      {importResult && (
        <div className={cn("rounded-2xl border p-4 mb-6 flex items-start gap-3", importResult.skipped > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200")}>
          <CheckCircle2 size={18} className={importResult.skipped > 0 ? "text-amber-600 mt-0.5" : "text-green-600 mt-0.5"} />
          <div className="flex-1">
            <p className="font-semibold text-sm">Import complete — {importResult.imported} added{importResult.skipped > 0 ? `, ${importResult.skipped} skipped` : ""}</p>
            {importResult.errors.length > 0 && <ul className="mt-2 text-xs text-amber-800 space-y-0.5">{importResult.errors.map((e, i) => <li key={i}>• {e}</li>)}</ul>}
          </div>
          <button onClick={() => setImportResult(null)} className="text-muted-foreground text-xs">Dismiss</button>
        </div>
      )}
      {importError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 mb-6 flex items-center gap-3 text-red-700 text-sm">
          <AlertCircle size={16} /> {importError}
          <button onClick={() => setImportError("")} className="ml-auto text-xs hover:underline">Dismiss</button>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <FileSpreadsheet size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-800 mb-1">Excel / CSV Import Format</p>
            <p className="text-xs text-blue-700">Columns: <strong>Name</strong>, <strong>Phone</strong>, <strong>Email</strong>, <strong>Country</strong> (optional). Duplicates skipped. Formats: .xlsx, .xls, .csv</p>
          </div>
        </div>
      </div>

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
                  {["#", "Name", "Phone", "Email", "Country", "Subscribed", "Status"].map((h) => (
                    <th key={h} className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">{h}</th>
                  ))}
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody>
                {subs.map((s, i) => (
                  <tr key={s.id} className={cn("border-b border-border/60 last:border-0 transition-colors",
                    newSubFlash === s.id ? "bg-green-50 animate-pulse" :
                    s.unsubscribed ? "bg-muted/30 opacity-60" : "hover:bg-muted/20")}>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs">{i + 1}</td>
                    <td className="px-5 py-3.5 font-medium text-foreground">
                      {s.name}
                      {newSubFlash === s.id && <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200">NEW</span>}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">{s.phone}</td>
                    <td className="px-5 py-3.5 text-primary">{s.email}</td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs">{s.country || <span className="opacity-30">—</span>}</td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs whitespace-nowrap">
                      {new Date(s.subscribedAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-5 py-3.5">
                      {s.unsubscribed ? (
                        <span
                          title={s.unsubscribeReason ? `Reason: ${s.unsubscribeReason}` : "Unsubscribed"}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200 cursor-default"
                        >
                          Unsubscribed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => deleteSub(s.id, s.name)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors">
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
