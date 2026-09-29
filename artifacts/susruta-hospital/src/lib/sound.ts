/**
 * Centralized Audio Utility
 *
 * Uses synthesized in-memory WAV audio elements instead of AudioContext.
 * This completely prevents:
 * 1. "The AudioContext encountered an error from the audio device or the WebAudio renderer"
 * 2. Chrome's 6-AudioContext limit across tab navigations
 * 3. Memory leaks and unhandled audio renderer errors when audio output devices are unavailable
 */

function createWavBlobUrl(
  notes: { freq: number; start: number; duration: number; volume?: number }[],
  totalDuration = 1.0,
  sampleRate = 22050
): string {
  const numSamples = Math.floor(sampleRate * totalDuration);
  const buffer = new Int16Array(numSamples);

  for (const { freq, start, duration, volume = 0.3 } of notes) {
    const startSample = Math.floor(start * sampleRate);
    const numNoteSamples = Math.floor(duration * sampleRate);
    const endSample = Math.min(numSamples, startSample + numNoteSamples);

    for (let i = startSample; i < endSample; i++) {
      const t = (i - startSample) / sampleRate;
      const env = Math.sin((Math.PI * (i - startSample)) / numNoteSamples) * Math.exp(-2.5 * (t / duration));
      const sample = Math.sin(2 * Math.PI * freq * t) * env * volume * 32767;
      buffer[i] = Math.max(-32768, Math.min(32767, buffer[i] + sample));
    }
  }

  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const dataSize = numSamples * 2;
  const byteRate = sampleRate * 2;

  // "RIFF"
  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + dataSize, true);
  // "WAVE"
  view.setUint32(8, 0x57415645, false);
  // "fmt "
  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  // "data"
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, dataSize, true);

  const blob = new Blob([header, buffer], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

let adminChimeUrl: string | null = null;
let apptChimeUrl: string | null = null;
let pharmacyChimeUrl: string | null = null;
let doctorCallUrl: string | null = null;

/**
 * Play a pleasant 3-tone notification chime for admin alerts
 */
export function playAdminChime() {
  try {
    if (typeof window === "undefined") return;
    if (!adminChimeUrl) {
      adminChimeUrl = createWavBlobUrl([
        { freq: 660, start: 0, duration: 0.15, volume: 0.25 },
        { freq: 880, start: 0.12, duration: 0.15, volume: 0.3 },
        { freq: 1100, start: 0.25, duration: 0.3, volume: 0.35 },
      ], 0.65);
    }
    const audio = new Audio(adminChimeUrl);
    audio.volume = 0.5;
    audio.play().catch(() => {});
  } catch {
    // Fallback: silent fail without throwing or logging errors
  }
}

/**
 * Play a 4-tone ascending chime for new appointments
 */
export function playAppointmentChime() {
  try {
    if (typeof window === "undefined") return;
    if (!apptChimeUrl) {
      apptChimeUrl = createWavBlobUrl([
        { freq: 523.25, start: 0, duration: 0.25, volume: 0.3 },
        { freq: 659.25, start: 0.22, duration: 0.25, volume: 0.3 },
        { freq: 783.99, start: 0.44, duration: 0.3, volume: 0.35 },
        { freq: 1046.5, start: 0.66, duration: 0.55, volume: 0.4 },
      ], 1.3);
    }
    const audio = new Audio(apptChimeUrl);
    audio.volume = 0.5;
    audio.play().catch(() => {});
  } catch {
    // Fallback: silent fail
  }
}

/**
 * Play pharmacy order alert chime
 */
export function playPharmacyChime() {
  try {
    if (typeof window === "undefined") return;
    if (!pharmacyChimeUrl) {
      pharmacyChimeUrl = createWavBlobUrl([
        { freq: 880, start: 0, duration: 0.18, volume: 0.3 },
        { freq: 1100, start: 0.15, duration: 0.35, volume: 0.35 },
      ], 0.6);
    }
    const audio = new Audio(pharmacyChimeUrl);
    audio.volume = 0.5;
    audio.play().catch(() => {});
  } catch {
    // Fallback: silent fail
  }
}

/**
 * Play doctor consultation call alert + spoken announcement
 */
export function playDoctorCallAlert(patientName?: string) {
  try {
    if (typeof window === "undefined") return;
    if (!doctorCallUrl) {
      doctorCallUrl = createWavBlobUrl([
        { freq: 880, start: 0, duration: 0.25, volume: 0.35 },
        { freq: 880, start: 0.35, duration: 0.25, volume: 0.35 },
        { freq: 880, start: 0.7, duration: 0.25, volume: 0.35 },
        { freq: 880, start: 1.05, duration: 0.3, volume: 0.4 },
      ], 1.5);
    }
    const audio = new Audio(doctorCallUrl);
    audio.volume = 0.6;
    audio.play().catch(() => {});

    setTimeout(() => {
      try {
        if (typeof window !== "undefined" && window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const phrase = patientName ? `Consultation call for ${patientName}` : "Incoming consultation call";
          const utter = new SpeechSynthesisUtterance(phrase);
          utter.rate = 1.0;
          utter.pitch = 1.0;
          utter.volume = 0.9;
          window.speechSynthesis.speak(utter);
        }
      } catch {}
    }, 1200);
  } catch {}
}
