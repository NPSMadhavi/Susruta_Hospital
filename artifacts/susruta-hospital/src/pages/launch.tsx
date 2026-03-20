import React, { useEffect, useRef, useState, useCallback } from "react";
import confetti from "canvas-confetti";
import logoImg from "@assets/logo_1773840200056.png";

const COUNTDOWN = 10;
const SESSION_KEY = "susruta_launched";
const TARGET_URL = "https://susrutahospital.com";

const FLOWERS = ["🌸", "🌺", "🌼", "🪷", "🌹", "🌻", "💐", "🌷"];

interface Petal {
  id: number;
  emoji: string;
  left: string;
  delay: string;
  duration: string;
  size: number;
  rotate: number;
  drift: number;
}

function makePetals(n: number): Petal[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    emoji: FLOWERS[i % FLOWERS.length],
    left: `${Math.random() * 100}%`,
    delay: `${(Math.random() * 1.8).toFixed(2)}s`,
    duration: `${(3 + Math.random() * 2.5).toFixed(2)}s`,
    size: 22 + Math.floor(Math.random() * 22),
    rotate: Math.random() > 0.5 ? 360 : -360,
    drift: (Math.random() - 0.5) * 80,
  }));
}

export default function Launch() {
  const [count, setCount] = useState(COUNTDOWN);
  const [phase, setPhase] = useState<"countdown" | "button" | "celebrate">("countdown");
  const [petals, setPetals] = useState<Petal[]>([]);
  const [fadeOut, setFadeOut] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) {
      window.location.href = TARGET_URL;
    }
  }, []);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (count <= 0) { setPhase("button"); return; }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, phase]);

  const handleLaunch = useCallback(() => {
    if (phase !== "button") return;
    setPhase("celebrate");
    setPetals(makePetals(70));
    sessionStorage.setItem(SESSION_KEY, "true");

    if (!canvasRef.current) return;
    const fire = confetti.create(canvasRef.current, { resize: true, useWorker: true });

    const burst = (opts: confetti.Options) => fire({ ...opts });

    burst({ particleCount: 120, spread: 160, origin: { x: 0.5, y: 0.45 }, colors: ["#D4AF37","#FFD700","#FF6B6B","#FF69B4","#7CFC00","#FF4500","#9B59B6","#00CED1"], scalar: 1.3 });
    setTimeout(() => burst({ particleCount: 60, angle: 60,  spread: 90, origin: { x: 0,   y: 0.6 }, colors: ["#FFD700","#FF6B6B","#7CFC00","#FF69B4"] }), 300);
    setTimeout(() => burst({ particleCount: 60, angle: 120, spread: 90, origin: { x: 1,   y: 0.6 }, colors: ["#D4AF37","#FF4500","#00CED1","#9B59B6"] }), 300);
    setTimeout(() => burst({ particleCount: 80, spread: 140, origin: { x: 0.5, y: 0.5 }, colors: ["#FFD700","#FF6B6B","#FF69B4","#D4AF37"], scalar: 1.1 }), 700);
    setTimeout(() => burst({ particleCount: 50, spread: 200, origin: { x: 0.3, y: 0.3 }, colors: ["#7CFC00","#00CED1","#9B59B6"] }), 1100);
    setTimeout(() => burst({ particleCount: 50, spread: 200, origin: { x: 0.7, y: 0.3 }, colors: ["#D4AF37","#FF6B6B","#FF69B4"] }), 1100);

    setTimeout(() => setFadeOut(true), 3000);
    setTimeout(() => { window.location.href = TARGET_URL; }, 4000);
  }, [phase]);

  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - count / COUNTDOWN);

  return (
    <>
      <style>{`
        @keyframes petalFall {
          0%   { transform: translateY(-80px) translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) translateX(var(--drift)) rotate(var(--rotate)); opacity: 0.4; }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 24px rgba(212,175,55,0.4), 0 0 60px rgba(212,175,55,0.15); transform: scale(1); }
          50%       { box-shadow: 0 0 48px rgba(212,175,55,0.8), 0 0 100px rgba(212,175,55,0.3); transform: scale(1.03); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes countPop {
          0%   { transform: scale(0.4); opacity: 0; }
          65%  { transform: scale(1.18); }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.75; }
          100% { opacity: 0.4; }
        }
        @keyframes ringPulse {
          0%, 100% { opacity: 0.12; transform: scale(1); }
          50%      { opacity: 0.28; transform: scale(1.05); }
        }
      `}</style>

      <div
        style={{
          position: "fixed", inset: 0,
          background: "radial-gradient(ellipse at center, #fffef8 0%, #f8f3e6 55%, #f0e9d4 100%)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          zIndex: 9999, overflow: "hidden",
          transition: "opacity 1.2s ease",
          opacity: fadeOut ? 0 : 1,
          userSelect: "none",
        }}
      >
        {/* Confetti canvas */}
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 20 }}
        />

        {/* Falling flower petals */}
        {petals.map((p) => (
          <div
            key={p.id}
            style={{
              position: "absolute",
              top: "-80px",
              left: p.left,
              fontSize: p.size,
              animationName: "petalFall",
              animationDuration: p.duration,
              animationDelay: p.delay,
              animationTimingFunction: "ease-in",
              animationFillMode: "forwards",
              "--rotate": `${p.rotate}deg`,
              "--drift": `${p.drift}px`,
              pointerEvents: "none",
              zIndex: 15,
            } as React.CSSProperties}
          >
            {p.emoji}
          </div>
        ))}

        {/* Decorative ambient rings */}
        {[280, 380, 480].map((size, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: size, height: size,
              borderRadius: "50%",
              border: "1px solid rgba(212,175,55,0.25)",
              animationName: "ringPulse",
              animationDuration: `${3 + i}s`,
              animationDelay: `${i * 0.6}s`,
              animationTimingFunction: "ease-in-out",
              animationIterationCount: "infinite",
              pointerEvents: "none",
            }}
          />
        ))}

        {/* Logo — original colours */}
        <div style={{ marginBottom: 44, position: "relative", zIndex: 5 }}>
          <img src={logoImg} alt="Susruta Hospital" style={{ height: 72, objectFit: "contain" }} />
        </div>

        {/* Countdown ring */}
        {phase === "countdown" && (
          <div style={{ position: "relative", width: 168, height: 168, marginBottom: 36, zIndex: 5 }}>
            <svg width="168" height="168" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="84" cy="84" r={radius} fill="none" stroke="rgba(22,40,20,0.08)" strokeWidth="9" />
              <circle
                cx="84" cy="84" r={radius}
                fill="none"
                stroke="#D4AF37"
                strokeWidth="9"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.85s cubic-bezier(0.4, 0, 0.2, 1)" }}
              />
            </svg>
            <div
              key={count}
              style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                animationName: "countPop",
                animationDuration: "0.45s",
                animationTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              <span style={{ fontSize: 58, fontWeight: 800, color: "#162814", lineHeight: 1, fontFamily: "'Georgia', serif" }}>
                {count}
              </span>
              <span style={{ fontSize: 10, color: "rgba(22,40,20,0.4)", marginTop: 6, letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: "sans-serif" }}>
                seconds
              </span>
            </div>
          </div>
        )}

        {/* Launch button */}
        {(phase === "button" || phase === "celebrate") && (
          <button
            onClick={handleLaunch}
            disabled={phase === "celebrate"}
            style={{
              position: "relative", zIndex: 5,
              animationName: phase === "button" ? "fadeInUp, pulseGlow" : "none",
              animationDuration: "0.7s, 2.2s",
              animationDelay: "0s, 0.7s",
              animationTimingFunction: "cubic-bezier(0.22,1,0.36,1), ease-in-out",
              animationFillMode: "forwards, none",
              animationIterationCount: "1, infinite",
              background: "linear-gradient(135deg, #c9a227 0%, #f5d76e 50%, #c9a227 100%)",
              color: "#162814",
              border: "none",
              borderRadius: "60px",
              padding: "22px 64px",
              fontSize: 22,
              fontWeight: 800,
              fontFamily: "'Georgia', serif",
              cursor: phase === "celebrate" ? "default" : "pointer",
              letterSpacing: "0.05em",
              opacity: phase === "celebrate" ? 0.7 : 1,
              marginBottom: 12,
            }}
          >
            🌿 &nbsp;Launch Website
          </button>
        )}

        {/* Tagline */}
        <p
          style={{
            position: "relative", zIndex: 5,
            marginTop: phase === "countdown" ? 28 : 36,
            color: "rgba(22,40,20,0.4)",
            fontSize: 12,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            fontFamily: "sans-serif",
            animationName: "shimmer",
            animationDuration: "3s",
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
          }}
        >
          Susruta Hospital &nbsp;·&nbsp; Tirupati
        </p>
      </div>
    </>
  );
}
