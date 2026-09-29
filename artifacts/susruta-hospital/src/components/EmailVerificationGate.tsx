import React, { useState } from "react";
import { MailCheck, RefreshCw, ArrowLeft } from "lucide-react";
import { patientApi } from "@/lib/patient-api";

interface Props {
  email: string;
  onBack: () => void;
  onProceed?: () => void;
}

export function EmailVerificationGate({ email, onBack, onProceed }: Props) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  async function resend() {
    setSending(true); setErr("");
    try {
      await patientApi.resendVerification();
      setSent(true);
    } catch (e: any) {
      setErr(e?.message || "Failed to send. Please try again.");
    } finally { setSending(false); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-6">
          <MailCheck size={32} className="text-amber-600" />
        </div>

        <h2 className="text-xl font-bold text-foreground mb-2">Verify Your Email</h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-1">
          To receive consultation updates, please verify your email address.
        </p>
        <p className="text-sm font-semibold text-foreground mb-6">{email}</p>

        {sent ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 text-sm text-green-800 mb-6">
            Verification email sent! Please check your inbox and click the link.
          </div>
        ) : (
          <>
            {err && (
              <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 mb-4">
                {err}
              </div>
            )}
            <button
              onClick={resend}
              disabled={sending}
              className="w-full py-3 rounded-xl bg-amber-500 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-amber-600 disabled:opacity-60 transition-all shadow-sm mb-3"
            >
              {sending ? <RefreshCw size={15} className="animate-spin" /> : <MailCheck size={15} />}
              {sending ? "Sending…" : "Resend Verification Email"}
            </button>
          </>
        )}

        <div className="space-y-2">
          {onProceed && (
            <button
              onClick={onProceed}
              className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
            >
              Continue to Booking →
            </button>
          )}
          <button
            onClick={onBack}
            className="w-full py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted/40 transition-colors flex items-center justify-center gap-1.5"
          >
            <ArrowLeft size={14} /> Go Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
