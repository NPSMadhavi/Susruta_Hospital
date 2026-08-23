import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useParticipants,
  useLocalParticipant,
  useIsSpeaking,
  useTrackToggle,
  useDisconnectButton,
  useRoomContext,
} from "@livekit/components-react";
import { RoomEvent, Track, type Participant } from "livekit-client";
import {
  Video, Loader2, AlertCircle, Copy, CheckCircle2, Link, Users,
  Paperclip, FileText, Upload, Mic, MicOff, VideoOff, PhoneOff,
  UserCheck, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ──────────────────────────────────────────────────────
type CallCredentials = { token: string; serverUrl: string; roomName: string };
type Role = "patient" | "doctor" | "guest" | "admin";

// ── Token fetchers ─────────────────────────────────────────────
async function fetchPatientToken(apptId: number): Promise<CallCredentials> {
  const r = await fetch(`${BASE}/api/livekit/patient-token/${apptId}`, { credentials: "include" });
  if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err.message || "Could not get call token"); }
  return r.json();
}
async function fetchDoctorToken(apptId: number): Promise<CallCredentials> {
  const r = await fetch(`${BASE}/api/livekit/doctor-token/${apptId}`, { credentials: "include" });
  if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err.message || "Could not get call token"); }
  return r.json();
}
async function fetchGuestToken(apptId: number, name?: string): Promise<CallCredentials> {
  const qs = name ? `?name=${encodeURIComponent(name)}` : "";
  const r = await fetch(`${BASE}/api/livekit/guest-token/${apptId}${qs}`);
  if (!r.ok) throw new Error("Call is not active");
  return r.json();
}
async function fetchDirectPatientToken(callId: number): Promise<CallCredentials> {
  const r = await fetch(`${BASE}/api/livekit/direct-patient-token/${callId}`, { credentials: "include" });
  if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err.message || "This direct call is no longer active"); }
  return r.json();
}
async function fetchDirectDoctorToken(callId: number): Promise<CallCredentials> {
  const r = await fetch(`${BASE}/api/livekit/direct-doctor-token/${callId}`, { credentials: "include" });
  if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err.message || "This direct call is no longer active"); }
  return r.json();
}

// ── Helpers ───────────────────────────────────────────────────
function getInitials(name?: string) {
  if (!name) return "?";
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function fmtElapsed(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Avatar colours per participant index
const AVATAR_COLOURS = [
  "from-emerald-700 to-emerald-900",
  "from-blue-700 to-blue-900",
  "from-purple-700 to-purple-900",
  "from-orange-700 to-orange-900",
  "from-pink-700 to-pink-900",
];

// ── Single Participant Tile ────────────────────────────────────
function ParticipantTile({ participant, colourIdx, isLocal }: {
  participant: Participant;
  colourIdx: number;
  isLocal: boolean;
}) {
  const isSpeaking = useIsSpeaking(participant);
  const camPub = participant.getTrackPublication(Track.Source.Camera);
  const micPub = participant.getTrackPublication(Track.Source.Microphone);
  const isCamOn  = !!(camPub && !camPub.isMuted && camPub.track);
  const isMicOn  = !!(micPub && !micPub.isMuted);
  const initials = getInitials(participant.name);
  const colour   = AVATAR_COLOURS[colourIdx % AVATAR_COLOURS.length];

  // Build a proper TrackReference for VideoTrack
  const trackRef = camPub ? { participant, source: Track.Source.Camera, publication: camPub } : null;

  return (
    <div className={cn(
      "relative w-full h-full bg-[#1c1c1e] rounded-2xl overflow-hidden flex items-center justify-center select-none transition-all duration-200",
      isSpeaking ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#111]" : "ring-1 ring-white/5",
    )}>
      {/* Video or Avatar */}
      {isCamOn && trackRef ? (
        <VideoTrack
          trackRef={trackRef as any}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: isLocal ? "scaleX(-1)" : "none" }}
        />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className={cn(
            "w-16 h-16 rounded-full bg-gradient-to-br flex items-center justify-center shadow-lg",
            colour,
          )}>
            <span className="text-white font-bold text-2xl tracking-tight">{initials}</span>
          </div>
          <p className="text-white/40 text-xs">{isCamOn ? "" : "Camera off"}</p>
        </div>
      )}

      {/* Gradient footer */}
      <div className="absolute bottom-0 inset-x-0 h-14 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

      {/* Name + mic row */}
      <div className="absolute bottom-2.5 left-3 flex items-center gap-1.5">
        {!isMicOn && (
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-500/90">
            <MicOff size={10} className="text-white" />
          </span>
        )}
        <span className="text-white text-xs font-semibold drop-shadow-md">
          {participant.name || "Unknown"}{isLocal ? " (You)" : ""}
        </span>
      </div>

      {/* Speaking pulse dot top-right */}
      {isSpeaking && (
        <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-md shadow-emerald-400/60" />
      )}
    </div>
  );
}

// ── Participants Sidebar ───────────────────────────────────────
function ParticipantsSidebar({ participants, localParticipant, onAskToUnmute }: {
  participants: Participant[];
  localParticipant: Participant;
  onAskToUnmute?: (participant: Participant) => void;
}) {
  return (
    <div className="flex flex-col h-full bg-[#1c1c1e] border-l border-white/5">
      <div className="px-4 py-3.5 border-b border-white/5 flex items-center gap-2">
        <Users size={15} className="text-white/50" />
        <span className="text-white/70 text-sm font-semibold">People</span>
        <span className="ml-auto text-white/30 text-xs bg-white/10 rounded-full px-2 py-0.5">
          {participants.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {participants.map((p, i) => {
          const isLocal = p.identity === localParticipant.identity;
          const camPub = p.getTrackPublication(Track.Source.Camera);
          const micPub = p.getTrackPublication(Track.Source.Microphone);
          const isCamOn = !!(camPub && !camPub.isMuted && camPub.track);
          const isMicOn = !!(micPub && !micPub.isMuted);
          const colour = AVATAR_COLOURS[i % AVATAR_COLOURS.length];
          return (
            <div key={p.identity} className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors">
              <div className={cn(
                "w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center shrink-0 text-white text-xs font-bold",
                colour,
              )}>
                {getInitials(p.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/80 text-xs font-semibold truncate">
                  {p.name || "Unknown"}{isLocal ? " (You)" : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {isMicOn
                  ? <Mic size={12} className="text-white/40" />
                  : <MicOff size={12} className="text-red-400" />}
                {isCamOn
                  ? <Video size={12} className="text-white/40" />
                  : <VideoOff size={12} className="text-red-400" />}
              </div>
              {onAskToUnmute && !isLocal && !isMicOn && (
                <button
                  onClick={() => onAskToUnmute(p)}
                  title={`Ask ${p.name || "patient"} to unmute`}
                  className="text-[9px] font-bold text-amber-300 hover:text-white bg-amber-500/15 hover:bg-amber-500/30 border border-amber-400/20 rounded-md px-1.5 py-1 whitespace-nowrap transition-colors"
                >
                  Ask to unmute
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Control Bar Button ─────────────────────────────────────────
function CtrlBtn({ icon, label, active, danger, onClick, disabled }: {
  icon: React.ReactNode; label: string;
  active?: boolean; danger?: boolean;
  onClick?: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all select-none disabled:opacity-40",
        danger
          ? "bg-red-600 hover:bg-red-500 text-white"
          : active
            ? "bg-white/15 text-white hover:bg-white/20"
            : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80",
      )}
    >
      <span className="w-9 h-9 flex items-center justify-center">{icon}</span>
      <span className="text-[9px] font-semibold tracking-wide uppercase">{label}</span>
    </button>
  );
}

// ── Main Custom Room UI ────────────────────────────────────────
function SusrutaVideoRoom({ role, onLeave }: { role: Role; onLeave?: () => void }) {
  const participants        = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const room                = useRoomContext();
  const { buttonProps: leaveProps } = useDisconnectButton({});
  const { enabled: micOn, toggle: toggleMic } = useTrackToggle({ source: Track.Source.Microphone });
  const { enabled: camOn, toggle: toggleCam } = useTrackToggle({ source: Track.Source.Camera });

  const [showPeople, setShowPeople] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [unmuteRequest, setUnmuteRequest] = useState<string | null>(null);
  const [unmuteBusy, setUnmuteBusy] = useState(false);
  const startRef = useRef(Date.now());

  // Timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Admins join as observers by default, but can still speak when they
  // explicitly enable their own microphone. Camera remains monitor-only.
  const canUseMicrophone = true;
  const canUseCamera = role !== "admin";
  const allParticipants = participants; // includes local

  useEffect(() => {
    if (role !== "patient") return;
    function handleData(payload: Uint8Array, participant?: Participant) {
      try {
        const message = JSON.parse(new TextDecoder().decode(payload));
        if (message?.type === "request-unmute" &&
            (!message.target || message.target === localParticipant.identity)) {
          setUnmuteRequest(participant?.name || "The care team");
        }
      } catch {
        // Ignore unrelated room data messages.
      }
    }
    room.on(RoomEvent.DataReceived, handleData as any);
    return () => { room.off(RoomEvent.DataReceived, handleData as any); };
  }, [room, role, localParticipant.identity]);

  async function askToUnmute(participant: Participant) {
    try {
      await localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({
          type: "request-unmute",
          target: participant.identity,
        })),
        { reliable: true, destinationIdentities: [participant.identity], topic: "susruta-call-control" },
      );
    } catch {
      // The participant can still use their own in-call microphone control.
    }
  }

  async function acceptUnmuteRequest() {
    setUnmuteBusy(true);
    try {
      await localParticipant.setMicrophoneEnabled(true);
      setUnmuteRequest(null);
    } catch {
      setUnmuteRequest("Microphone access was blocked. Please allow it in your browser settings.");
    } finally {
      setUnmuteBusy(false);
    }
  }

  // Grid columns
  const count = allParticipants.length;
  const cols = count <= 1 ? 1 : count <= 2 ? 2 : count <= 4 ? 2 : 3;

  function handleLeave() {
    (leaveProps as any).onClick?.();
    onLeave?.();
  }

  return (
    <div className="relative flex flex-col w-full h-full bg-[#111] select-none" style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* ── Audio renderer (invisible) */}
      <RoomAudioRenderer />

      {/* ── Top bar ─────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-4 h-12 bg-[#1c1c1e]/80 backdrop-blur border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-600 flex items-center justify-center">
            <Video size={12} className="text-white" />
          </div>
          <span className="text-white/70 text-sm font-semibold">Susruta Hospital</span>
        </div>
        <span className="text-white/15">·</span>
        <div className="flex items-center gap-1.5 text-white/40 text-xs">
          <Clock size={11} />
          <span className="font-mono">{fmtElapsed(elapsed)}</span>
        </div>
        {role === "admin" && (
          <span className="ml-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
            Monitoring
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5 text-white/40 text-xs">
          <UserCheck size={11} />
          <span>{allParticipants.length} in call</span>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Video grid */}
        <div className="flex-1 min-w-0 p-3 overflow-hidden">
          {allParticipants.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Loader2 size={28} className="text-white/20 animate-spin mx-auto mb-3" />
                <p className="text-white/30 text-sm">Waiting for others to join…</p>
              </div>
            </div>
          ) : (
            <div
              className="h-full gap-2"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gridAutoRows: count > 2 ? "1fr" : "1fr",
              }}
            >
              {allParticipants.map((p, i) => (
                <ParticipantTile
                  key={p.identity}
                  participant={p}
                  colourIdx={i}
                  isLocal={p.identity === localParticipant.identity}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right sidebar — participants */}
        {showPeople && (
          <div className="shrink-0 w-60 h-full border-l border-white/5 overflow-hidden">
            <ParticipantsSidebar
              participants={allParticipants}
              localParticipant={localParticipant}
              onAskToUnmute={role === "admin" ? askToUnmute : undefined}
            />
          </div>
        )}
      </div>

      {role === "patient" && unmuteRequest && (
        <div className="absolute left-4 right-4 bottom-[100px] z-20 mx-auto max-w-md rounded-2xl bg-white shadow-2xl border border-amber-200 p-3.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Mic size={17} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-gray-900 text-sm font-bold">Please turn on your microphone</p>
            <p className="text-gray-500 text-xs truncate">
              {unmuteRequest.includes("blocked") ? unmuteRequest : `${unmuteRequest} is asking you to unmute.`}
            </p>
          </div>
          {!unmuteRequest.includes("blocked") && (
            <button
              onClick={acceptUnmuteRequest}
              disabled={unmuteBusy}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold whitespace-nowrap disabled:opacity-60"
            >
              {unmuteBusy ? "Enabling…" : "Unmute"}
            </button>
          )}
          <button
            onClick={() => setUnmuteRequest(null)}
            className="text-gray-400 hover:text-gray-700 p-1"
            aria-label="Dismiss microphone request"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Bottom control bar ──────────────────────────────── */}
      <div className="shrink-0 h-[88px] bg-[#1c1c1e]/90 backdrop-blur border-t border-white/5 flex items-center justify-between px-6">

        {/* Left: clock */}
        <div className="text-white/25 text-xs font-mono w-20">
          {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </div>

        {/* Centre: controls */}
        <div className="flex items-center gap-2">
          {canUseMicrophone && (
            <CtrlBtn
              icon={micOn ? <Mic size={20} /> : <MicOff size={20} />}
              label={micOn ? "Mute" : "Unmute"}
              active={micOn}
              onClick={() => toggleMic()}
            />
          )}
          {canUseCamera && (
            <>
              <CtrlBtn
                icon={camOn ? <Video size={20} /> : <VideoOff size={20} />}
                label={camOn ? "Stop Video" : "Start Video"}
                active={camOn}
                onClick={() => toggleCam()}
              />
            </>
          )}
          <button
            onClick={handleLeave}
            className="flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white transition-all"
            title="Leave call"
          >
            <span className="w-9 h-9 flex items-center justify-center">
              <PhoneOff size={20} />
            </span>
            <span className="text-[9px] font-semibold tracking-wide uppercase">Leave</span>
          </button>
        </div>

        {/* Right: people toggle */}
        <div className="flex items-center gap-2 w-20 justify-end">
          <button
            onClick={() => setShowPeople(v => !v)}
            title="Toggle participants"
            className={cn(
              "flex items-center justify-center w-9 h-9 rounded-xl transition-all",
              showPeople ? "bg-white/15 text-white" : "bg-white/5 text-white/40 hover:text-white/70",
            )}
          >
            <Users size={16} />
          </button>
        </div>
      </div>
    </div>
  );
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

// ── In-Call Document Upload ────────────────────────────────────
type UploadedDoc = { name: string; objectPath: string; contentType: string; size: number };
export function CallDocumentUpload({ apptId }: { apptId: number }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true); setErr("");
    try {
      const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Could not get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();
      const putRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putRes.ok) throw new Error("Upload failed");
      const doc: UploadedDoc = { name: file.name, objectPath, contentType: file.type, size: file.size };
      const saveRes = await fetch(`${BASE}/api/online-appointments/${apptId}/add-document`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(doc),
      });
      if (!saveRes.ok) throw new Error("Could not save document");
      setUploads(prev => [...prev, doc]);
    } catch (e: any) { setErr(e.message || "Upload failed"); }
    finally { setUploading(false); }
  }

  function fmtSize(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="mt-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Paperclip size={14} className="text-[#1a3d2b]" />
          <p className="text-xs font-bold text-gray-700">Share Documents with Doctor</p>
        </div>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-[#1a3d2b] text-white hover:bg-[#15322a] disabled:opacity-60 transition-colors">
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {uploading ? "Uploading…" : "Upload File"}
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFile}
          accept="image/*,.pdf,.doc,.docx,.jpg,.jpeg,.png" />
      </div>
      {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
      {uploads.length > 0 && (
        <div className="space-y-1.5">
          {uploads.map((doc, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
              <FileText size={13} className="text-[#1a3d2b] shrink-0" />
              <span className="text-xs text-gray-700 flex-1 truncate">{doc.name}</span>
              <span className="text-[10px] text-gray-400 shrink-0">{fmtSize(doc.size)}</span>
            </div>
          ))}
        </div>
      )}
      {uploads.length === 0 && !uploading && (
        <p className="text-[11px] text-gray-400">Upload reports, lab results or any relevant files for the doctor to review.</p>
      )}
    </div>
  );
}

// ── Main VideoCall Component ───────────────────────────────────
interface VideoCallProps {
  apptId?: number;
  directCallId?: number;
  role: Role;
  guestToken?: string | null;
  onCallEnded?: () => void;
  className?: string;
  autoJoin?: boolean;
  keepOpenOnDisconnect?: boolean;
}

export function VideoCall({
  apptId,
  directCallId,
  role,
  guestToken,
  onCallEnded,
  className,
  autoJoin,
  keepOpenOnDisconnect = false,
}: VideoCallProps) {
  const [creds, setCreds] = useState<CallCredentials | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inCall, setInCall] = useState(false);
  const autoJoinFired = useRef(false);

  const join = useCallback(async () => {
    setLoading(true); setError("");
    try {
      let c: CallCredentials;
      if (directCallId !== undefined) {
        if (role === "patient") c = await fetchDirectPatientToken(directCallId);
        else if (role === "doctor") c = await fetchDirectDoctorToken(directCallId);
        else throw new Error("This call does not support guest access");
      } else if (apptId !== undefined) {
        if (role === "patient") c = await fetchPatientToken(apptId);
        else if (role === "doctor") c = await fetchDoctorToken(apptId);
        else c = await fetchGuestToken(apptId);
      } else {
        throw new Error("No call was selected");
      }
      setCreds(c); setInCall(true);
    } catch (e: any) { setError(e.message || "Could not join call"); }
    finally { setLoading(false); }
  }, [apptId, directCallId, role]);

  useEffect(() => {
    if (autoJoin && !autoJoinFired.current) { autoJoinFired.current = true; join(); }
  }, [autoJoin, join]);

  function handleDisconnect() {
    setInCall(false);
    setCreds(null);
    if (keepOpenOnDisconnect) {
      setError("The call connection was interrupted. Please try joining again.");
      return;
    }
    onCallEnded?.();
  }

  function handleUserLeave() {
    setInCall(false);
    setCreds(null);
    onCallEnded?.();
  }

  if (inCall && creds) {
    return (
      <div className={cn("rounded-2xl overflow-hidden border border-white/10 bg-[#111] shadow-2xl flex flex-col", className)}
        style={{ height: 520 }}>
        <LiveKitRoom
          token={creds.token} serverUrl={creds.serverUrl}
          connect={true} video={true} audio={true}
          onDisconnected={handleDisconnect}
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <SusrutaVideoRoom role={role} onLeave={handleUserLeave} />
        </LiveKitRoom>
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-5", className)}>
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" />{error}
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
        <button onClick={join} disabled={loading}
          className="flex items-center gap-2 mx-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl transition-colors text-sm">
          {loading
            ? <><Loader2 size={16} className="animate-spin" /> Joining…</>
            : <><Video size={16} /> {role === "doctor" ? "Start Call" : "Join Call"}</>}
        </button>
      </div>
    </div>
  );
}

// ── Admin call overlay (monitor-only, no publish) ─────────────
export function AdminVideoRoom({ token, serverUrl, onLeave }: {
  token: string; serverUrl: string; onLeave: () => void;
}) {
  return (
    <LiveKitRoom
      token={token} serverUrl={serverUrl}
      connect={true} video={false} audio={false}
      onDisconnected={onLeave}
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", height: "100%" }}>
      <SusrutaVideoRoom role="admin" onLeave={onLeave} />
    </LiveKitRoom>
  );
}

// ── Standalone Guest Call Page ─────────────────────────────────
export function GuestCallPage({ apptId }: { apptId: number }) {
  const guestName = useRef("Guest");
  const [step, setStep] = useState<"loading" | "waiting" | "joining" | "call" | "ended">("loading");
  const [creds, setCreds] = useState<CallCredentials | null>(null);
  const [error, setError] = useState("");
  // Permission: null = not asked, true = granted, false = denied
  const [permStatus, setPermStatus] = useState<null | "granted" | "denied" | "unavailable">(null);
  const [permAsking, setPermAsking] = useState(false);

  // On mount: fetch status + patient name, then go straight to waiting/joining
  useEffect(() => {
    fetch(`${BASE}/api/guest/status/${apptId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) { setError("This appointment link is not valid."); setStep("waiting"); return; }
        if (data.patientFirstName) guestName.current = `${data.patientFirstName}'s Guest`;
        if (data.joinEnabled) setStep("joining"); else setStep("waiting");
      })
      .catch(() => { setError("Could not connect. Check your internet."); setStep("waiting"); });
  }, [apptId]);

  // SSE subscription while waiting
  useEffect(() => {
    if (step !== "waiting") return;
    const es = new EventSource(`${BASE}/api/guest/sse/${apptId}`);
    es.addEventListener("join_enabled", () => { es.close(); setStep("joining"); });
    es.addEventListener("session_ended", () => { es.close(); setStep("ended"); });
    return () => es.close();
  }, [step, apptId]);

  // Fetch token when step becomes "joining"
  useEffect(() => {
    if (step !== "joining") return;
    let cancelled = false;
    (async () => {
      await new Promise(r => setTimeout(r, 800));
      if (cancelled) return;
      try {
        const c = await fetchGuestToken(apptId, guestName.current);
        if (!cancelled) { setCreds(c); setStep("call"); }
      } catch (e: any) {
        if (!cancelled) { setError(e.message || "Could not join call"); setStep("waiting"); }
      }
    })();
    return () => { cancelled = true; };
  }, [step, apptId]);

  // Permission button inside the waiting room (user gesture required for getUserMedia)
  async function handleAllowAccess() {
    setPermAsking(true);
    let cam = false;
    let mic = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      cam = stream.getVideoTracks().length > 0;
      mic = stream.getAudioTracks().length > 0;
      stream.getTracks().forEach(t => t.stop());
      setPermStatus("granted");
    } catch (e: any) {
      // Try audio-only fallback
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mic = audioStream.getAudioTracks().length > 0;
        audioStream.getTracks().forEach(t => t.stop());
      } catch {}
      if ((e as any).name === "NotFoundError") setPermStatus("unavailable");
      else setPermStatus("denied");
    } finally { setPermAsking(false); }
    // Report permission status to server so admin can see it in real-time
    const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${BASE}/api/guest/permissions/${apptId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: guestName.current, camera: cam, mic }),
    }).catch(() => {});
  }

  // ── Renders ──────────────────────────────────────────────────

  if (step === "ended") {
    return (
      <div className="min-h-screen bg-[#111] flex items-center justify-center p-4">
        <div className="text-center text-white">
          <CheckCircle2 size={48} className="text-emerald-400 mx-auto mb-4" />
          <p className="text-xl font-bold">Consultation Ended</p>
          <p className="text-white/40 mt-2">Thank you for joining. You may close this window.</p>
        </div>
      </div>
    );
  }

  if (step === "call" && creds) {
    return (
      <div className="flex flex-col bg-[#111]" style={{ height: "100dvh" }}>
        <LiveKitRoom
          token={creds.token} serverUrl={creds.serverUrl}
          connect={true} video={true} audio={true}
          onDisconnected={() => setStep("ended")}
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <SusrutaVideoRoom role="guest" onLeave={() => setStep("ended")} />
        </LiveKitRoom>
        <div className="px-4 py-3 bg-[#1c1c1e] shrink-0 border-t border-white/5">
          <CallDocumentUpload apptId={apptId} />
        </div>
      </div>
    );
  }

  // loading / waiting / joining — all show the same waiting room card
  return (
    <div className="min-h-screen bg-[#111] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm text-center">
        {/* Hospital badge */}
        <div className="w-16 h-16 rounded-2xl bg-[#1a3d2b] flex items-center justify-center mx-auto mb-4">
          <Clock size={28} className="text-white" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Susruta Hospital</h1>
        <p className="text-sm text-gray-500 mb-6">Video Consultation — Waiting Room</p>

        {/* Status indicator */}
        <div className="flex items-center justify-center gap-2.5 py-3.5 bg-blue-50 rounded-xl border border-blue-100 mb-5">
          <Loader2 size={16} className={cn("text-blue-500 shrink-0", step !== "loading" && "animate-spin")} />
          <span className="text-sm text-blue-700 font-medium">
            {step === "loading" ? "Connecting…"
              : step === "joining" ? "Joining call…"
              : "Waiting for doctor…"}
          </span>
        </div>

        {/* Camera / mic permission prompt */}
        {permStatus === null && step !== "loading" && (
          <button onClick={handleAllowAccess} disabled={permAsking}
            className="w-full flex items-center justify-center gap-2 py-3 bg-[#1a3d2b] hover:bg-[#15322a] disabled:opacity-60 text-white font-semibold rounded-xl transition-colors text-sm mb-3">
            {permAsking
              ? <><Loader2 size={15} className="animate-spin" /> Opening…</>
              : <><Video size={15} /> Allow Camera &amp; Microphone</>}
          </button>
        )}
        {permStatus === "granted" && (
          <div className="flex items-center justify-center gap-2 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium mb-3">
            <CheckCircle2 size={15} /> Camera &amp; Microphone ready
          </div>
        )}
        {permStatus === "denied" && (
          <div className="flex items-start gap-2 py-2.5 px-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 text-left mb-3">
            <VideoOff size={15} className="shrink-0 mt-0.5" /> Access was denied. Others may not see or hear you.
          </div>
        )}
        {permStatus === "unavailable" && (
          <div className="flex items-start gap-2 py-2.5 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 text-left mb-3">
            <VideoOff size={15} className="shrink-0 mt-0.5" /> No camera or microphone found. You can still listen.
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-700 text-left">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <p className="text-[11px] text-gray-400 mt-5">Susruta Hospital · Do not close this tab</p>
      </div>
    </div>
  );
}
