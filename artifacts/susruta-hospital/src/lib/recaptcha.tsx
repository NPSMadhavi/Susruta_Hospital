/**
 * Google reCAPTCHA v3 (Invisible) Client Integration
 * 
 * Provides automated, score-based bot protection without disrupting user experience.
 * Fully compliant with Google reCAPTCHA Terms of Service.
 */

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

// Google Official Test Key: 6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI (always succeeds in test/dev)
export const RECAPTCHA_SITE_KEY: string =
  (import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined)?.trim() ||
  "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";

let scriptLoadingPromise: Promise<void> | null = null;

/**
 * Dynamically loads the official Google reCAPTCHA v3 script once.
 */
export function loadRecaptchaScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  // Already loaded
  if (window.grecaptcha) {
    return Promise.resolve();
  }

  if (scriptLoadingPromise) {
    return scriptLoadingPromise;
  }

  scriptLoadingPromise = new Promise<void>((resolve, reject) => {
    // Check if script element already exists
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="google.com/recaptcha/api.js"]'
    );
    if (existingScript) {
      if (window.grecaptcha) {
        resolve();
      } else {
        existingScript.addEventListener("load", () => resolve());
        existingScript.addEventListener("error", (e) => reject(e));
      }
      return;
    }

    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(RECAPTCHA_SITE_KEY)}`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      resolve();
    };

    script.onerror = (err) => {
      scriptLoadingPromise = null;
      console.warn("[reCAPTCHA] Failed to load Google reCAPTCHA v3 script:", err);
      reject(err);
    };

    document.head.appendChild(script);
  });

  return scriptLoadingPromise;
}

/**
 * Executes reCAPTCHA v3 for a specific user action and returns the verification token.
 * 
 * @param action Distinct action name identifying the user interaction (e.g. 'patient_login', 'appointment_booking')
 * @returns Verification token string, or empty string if verification cannot be completed.
 */
export async function executeRecaptcha(action: string): Promise<string> {
  if (typeof window === "undefined") return "";

  try {
    await loadRecaptchaScript();

    if (!window.grecaptcha) {
      console.warn("[reCAPTCHA] grecaptcha object not available after script load");
      return "";
    }

    return await new Promise<string>((resolve) => {
      window.grecaptcha!.ready(async () => {
        try {
          const token = await window.grecaptcha!.execute(RECAPTCHA_SITE_KEY, { action });
          resolve(token);
        } catch (err) {
          console.warn(`[reCAPTCHA] Error executing action '${action}':`, err);
          resolve("");
        }
      });
    });
  } catch (err) {
    console.warn(`[reCAPTCHA] Failed to obtain token for action '${action}':`, err);
    return "";
  }
}

/**
 * Google reCAPTCHA Terms & Privacy notice component.
 * Required if hiding the floating reCAPTCHA badge or for transparent compliance disclosure.
 */
export function RecaptchaLegalNotice({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[11px] text-muted-foreground/75 leading-relaxed ${className}`}>
      This site is protected by reCAPTCHA and the Google{" "}
      <a
        href="https://policies.google.com/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-foreground transition-colors"
      >
        Privacy Policy
      </a>{" "}
      and{" "}
      <a
        href="https://policies.google.com/terms"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-foreground transition-colors"
      >
        Terms of Service
      </a>{" "}
      apply.
    </p>
  );
}
