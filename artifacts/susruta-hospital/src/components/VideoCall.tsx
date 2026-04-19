import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Video, Loader2, AlertCircle, Copy, CheckCircle2, Link, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ──────────────────────────────────────────────────────
type CallCredentials = { token: string; serverUrl: string; roomName: string };
type Role = "patient" | "doctor" | "guest";

// ── Token fetchers ─────────────────────────────────────────────
async function fetchPatientToken(apptId: number): Promise<CallCredentials> {
  const r = await fetch(`${BASE}/api/livekit/patient-token/${apptId}`, { credentials: "include" });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || "Could not get call token");
  }
  return r.json();
}

async function fetchDoctorToken(apptId: number): Promise<CallCredentials> {
  const r = await fetch(`${BASE}/api/livekit/doctor-token/${apptId}`, { credentials: "include" });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || "Could not get call token");
  }
  return r.json();
}

async function fetchGuestToken(apptId: number, name?: string): Promise<CallCredentials> {
  const qs = name ? `?name=${encodeURIComponent(name)}` : "";
  const r = await fetch(`${BASE}/api/livekit/guest-token/${apptId}${qs}`);
  if (!r.ok) throw new Error("Call is not active");
  return r.json();
}

// ── Guest Link Display ─────────────────────────────────────────
export function GuestLinkCard({ apptId }: { apptId: number; guestToken?: string | null }) {
  const [copied, setCopied] = useState(false);

  const url = `${window.location.origin}/guest-call/${apptId}`;

  async function copy() {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3.5">
      <div className="flex items-center gap-2 mb-2">
        <Link size={14} className="text-blue-600 shrink-0" />
        <p className="text-xs font-bold text-blue-700">Caregiver / Family Join Link</p>
      </div>
      <p className="text-[11px] text-blue-600 mb-2.5 leading-relaxed">
        Share this link with a family member or caregiver so they can join the call as a guest (up to 3 people total).
      </p>
      <div className="flex items-center gap-2 bg-white border border-blue-200 rounded-lg px-3 py-2">
        <p className="text-[11px] text-blue-800 font-mono flex-1 min-w-0 truncate">{url}</p>
        <button onClick={copy}
          className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0">
          {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
          {copied ? "Copied!" : "Copy Link"}
        </button>
      </div>
    </div>
  );
}

// ── VideoCall Room Inner ───────────────────────────────────────
// VideoConference includes its own control bar (mic/cam/screen share/leave)
// so we don't add a separate Leave button — disconnect fires onDisconnected on LiveKitRoom
function RoomInner() {
  return (
    <div className="h-full">
      <RoomAudioRenderer />
      <VideoConference />
    </div>
  );
}

// ── Main VideoCall Component ───────────────────────────────────
interface VideoCallProps {
  apptId: number;
  role: Role;
  guestToken?: string | null;
  onCallEnded?: () => void;
  className?: string;
  autoJoin?: boolean; // skip the pre-join screen and connect immediately
}

export function VideoCall({ apptId, role, guestToken, onCallEnded, className, autoJoin }: VideoCallProps) {
  const [creds, setCreds] = useState<CallCredentials | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inCall, setInCall] = useState(false);
  const autoJoinFired = useRef(false);

  const join = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let c: CallCredentials;
      if (role === "patient") c = await fetchPatientToken(apptId);
      else if (role === "doctor") c = await fetchDoctorToken(apptId);
      else c = await fetchGuestToken(apptId);
      setCreds(c);
      setInCall(true);
    } catch (e: any) {
      setError(e.message || "Could not join call");
    } finally {
      setLoading(false);
    }
  }, [apptId, role]);

  // Auto-join: fire join() once on mount if autoJoin=true
  useEffect(() => {
    if (autoJoin && !autoJoinFired.current) {
      autoJoinFired.current = true;
      join();
    }
  }, [autoJoin, join]);

  function handleDisconnect() {
    setInCall(false);
    setCreds(null);
    onCallEnded?.();
  }

  if (inCall && creds) {
    return (
      <div className={cn("rounded-2xl overflow-hidden border-2 border-emerald-400 bg-gray-900 shadow-xl flex flex-col", className)}
        style={{ height: 460 }}>
        <LiveKitRoom
          token={creds.token}
          serverUrl={creds.serverUrl}
          connect={true}
          video={true}
          audio={true}
          onDisconnected={handleDisconnect}
          data-lk-theme="default"
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <RoomInner />
        </LiveKitRoom>
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-5", className)}>
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-600 flex items-center justify-center mx-auto mb-3">
          <Video size={24} className="text-white" />
        </div>
        <p className="font-bold text-gray-900 text-base mb-1">
          {role === "doctor" ? "Start Video Consultation" : "Join Video Consultation"}
        </p>
        <p className="text-sm text-gray-500 mb-4">
          {role === "doctor"
            ? "Camera and microphone will be enabled when you join."
            : "Your doctor is ready. Join the video call now."}
        </p>
        <button
          onClick={join}
          disabled={loading}
          className="flex items-center gap-2 mx-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl transition-colors text-sm">
          {loading
            ? <><Loader2 size={16} className="animate-spin" /> Joining…</>
            : <><Video size={16} /> {role === "doctor" ? "Start Call" : "Join Call"}</>}
        </button>
      </div>
    </div>
  );
}

// ── Standalone Guest Call Page ─────────────────────────────────
export function GuestCallPage({ apptId }: { apptId: number }) {
  const [name, setName] = useState("");
  const [step, setStep] = useState<"name" | "call">("name");
  const [creds, setCreds] = useState<CallCredentials | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ended, setEnded] = useState(false);

  async function join() {
    if (!name.trim()) { setError("Please enter your name"); return; }
    setLoading(true);
    setError("");
    try {
      const c = await fetchGuestToken(apptId, name.trim());
      setCreds(c);
      setStep("call");
    } catch (e: any) {
      setError(e.message || "Call is not currently active.");
    } finally {
      setLoading(false);
    }
  }

  if (ended) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center text-white">
          <CheckCircle2 size={48} className="text-emerald-400 mx-auto mb-4" />
          <p className="text-xl font-bold">Call Ended</p>
          <p className="text-gray-400 mt-2">Thank you for joining the consultation.</p>
        </div>
      </div>
    );
  }

  if (step === "call" && creds) {
    return (
      <div className="min-h-screen bg-gray-900" style={{ height: "100dvh" }}>
        <LiveKitRoom
          token={creds.token}
          serverUrl={creds.serverUrl}
          connect={true}
          video={true}
          audio={true}
          onDisconnected={() => setEnded(true)}
          style={{ height: "100%" }}>
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center mx-auto mb-4">
          <Users size={28} className="text-white" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Join as Guest</h1>
        <p className="text-sm text-gray-500 mb-6">Susruta Hospital — Video Consultation</p>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4 text-sm text-red-700 text-left">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && join()}
          placeholder="Your name (e.g. Ravi — Father)"
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 mb-4"
        />
        <button
          onClick={join}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl transition-colors text-sm">
          {loading
            ? <><Loader2 size={16} className="animate-spin" /> Joining…</>
            : <><Video size={16} /> Join Consultation</>}
        </button>
      </div>
    </div>
  );
}
