import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { VideoCall } from "@/components/VideoCall";
import { cn } from "@/lib/utils";

export interface ActiveCallConfig {
  apptId?: number;
  directCallId?: number;
  role: "doctor" | "patient" | "guest" | "admin";
  title?: string;
  patientName?: string;
  patientCode?: string | null;
  onCallEnded?: () => void;
}

interface ActiveCallContextType {
  activeCall: ActiveCallConfig | null;
  isCallActive: boolean;
  isCallMinimized: boolean;
  startCall: (config: ActiveCallConfig) => void;
  minimizeCall: () => void;
  maximizeCall: () => void;
  endCall: () => void;
}

const ActiveCallContext = createContext<ActiveCallContextType | null>(null);

export function useActiveCall() {
  const ctx = useContext(ActiveCallContext);
  if (!ctx) {
    throw new Error("useActiveCall must be used within an ActiveCallProvider");
  }
  return ctx;
}

export function ActiveCallProvider({ children }: { children: React.ReactNode }) {
  const [activeCall, setActiveCall] = useState<ActiveCallConfig | null>(null);
  const [isCallMinimized, setIsCallMinimized] = useState(false);
  const [location] = useLocation();
  const prevLocationRef = useRef(location);
  const isEndingRef = useRef(false);

  const startCall = useCallback((config: ActiveCallConfig) => {
    isEndingRef.current = false;
    setActiveCall(config);
    setIsCallMinimized(false);
    try {
      window.history.pushState({ videoCallActive: true }, "");
    } catch {}
  }, []);

  const minimizeCall = useCallback(() => {
    setIsCallMinimized(true);
  }, []);

  const maximizeCall = useCallback(() => {
    setIsCallMinimized(false);
  }, []);

  const endCall = useCallback(() => {
    if (isEndingRef.current) return;
    isEndingRef.current = true;
    if (activeCall?.onCallEnded) {
      try {
        activeCall.onCallEnded();
      } catch (e) {
        console.error("[ActiveCall] Error in onCallEnded callback:", e);
      }
    }
    setActiveCall(null);
    setIsCallMinimized(false);
  }, [activeCall]);

  // Handle browser Back button (popstate):
  // When in full-screen call, Back minimizes the call instead of disconnecting WebRTC!
  useEffect(() => {
    if (!activeCall) return;

    const handlePopState = (e: PopStateEvent) => {
      if (!isCallMinimized) {
        // Intercept: minimize call into floating window
        setIsCallMinimized(true);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [activeCall, isCallMinimized]);

  // Handle SPA route navigation:
  // If user navigates to another route while in full-screen call, minimize it to floating window
  useEffect(() => {
    if (activeCall && !isCallMinimized) {
      if (prevLocationRef.current !== location) {
        setIsCallMinimized(true);
      }
    }
    prevLocationRef.current = location;
  }, [location, activeCall, isCallMinimized]);

  return (
    <ActiveCallContext.Provider
      value={{
        activeCall,
        isCallActive: !!activeCall,
        isCallMinimized,
        startCall,
        minimizeCall,
        maximizeCall,
        endCall,
      }}
    >
      {children}

      {/* Persistent Video Call Session — stays mounted across route changes */}
      {activeCall && (
        <div
          className={cn(
            "transition-all duration-300",
            isCallMinimized
              ? "fixed bottom-5 right-5 z-[250] w-72 sm:w-80 h-44 sm:h-50 rounded-2xl shadow-2xl border-2 border-white/20 bg-[#141416] ring-1 ring-black/50 overflow-hidden animate-in zoom-in-95 duration-200"
              : "fixed inset-0 z-[200] bg-black flex flex-col animate-in fade-in duration-200"
          )}
        >
          <VideoCall
            apptId={activeCall.apptId}
            directCallId={activeCall.directCallId}
            role={activeCall.role}
            autoJoin
            title={activeCall.title}
            isMinimized={isCallMinimized}
            onMinimize={minimizeCall}
            onMaximize={maximizeCall}
            onCallEnded={endCall}
            className="w-full h-full rounded-none border-0"
          />
        </div>
      )}
    </ActiveCallContext.Provider>
  );
}
