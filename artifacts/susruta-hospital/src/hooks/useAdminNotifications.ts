import { useState, useEffect, useRef, useCallback } from "react";

export type ToastItem = { id: number; title: string; body: string };

let swReg: ServiceWorkerRegistration | null = null;

async function getSwReg(): Promise<ServiceWorkerRegistration | null> {
  if (swReg) return swReg;
  if (!("serviceWorker" in navigator)) return null;
  try {
    swReg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return swReg;
  } catch {
    return null;
  }
}

async function fireOsNotification(title: string, body: string, icon: string) {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission !== "granted") return false;

  // 1. Try via Service Worker (Chrome modern requirement)
  try {
    const reg = await getSwReg();
    if (reg) {
      await reg.showNotification(title, { body, icon, badge: icon });
      return true;
    }
  } catch {}

  // 2. Fall back to direct Notification API
  try {
    new Notification(title, { body, icon });
    return true;
  } catch {}

  return false;
}

export function useAdminNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const permRef = useRef(permission);
  useEffect(() => { permRef.current = permission; }, [permission]);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastCounter = useRef(0);

  // Warm up AudioContext on first interaction
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
    // Pre-register SW before the permission dialog
    await getSwReg();
    const perm = await Notification.requestPermission();
    setPermission(perm);
    permRef.current = perm;
  }

  function dismissToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  const notify = useCallback((title: string, body: string) => {
    playSound();

    const icon = `${window.location.origin}/favicon.png`;

    // Try OS notification; show in-page toast regardless (always reliable)
    fireOsNotification(title, body, icon);

    // Always show in-page toast so the admin never misses it
    const id = ++toastCounter.current;
    setToasts((prev) => [...prev.slice(-4), { id, title, body }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 8000);
  }, []);

  return { permission, requestPermission, notify, toasts, dismissToast };
}
