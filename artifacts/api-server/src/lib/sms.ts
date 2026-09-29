/**
 * SMS Gateway Service for Susruta Hospital
 * Supports Indian & Global SMS Providers:
 * - Fast2SMS (FAST2SMS_API_KEY)
 * - 2Factor (TWO_FACTOR_API_KEY)
 * - MSG91 (MSG91_AUTH_KEY, MSG91_TEMPLATE_ID)
 * - Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_PHONE)
 * - Custom HTTP Webhook (SMS_GATEWAY_URL)
 */

export interface SendSmsOtpOptions {
  phone: string; // e.g. +91XXXXXXXXXX or 10 digits
  otp: string;   // 6-digit OTP
}

export function isSmsConfigured(): boolean {
  return !!(
    process.env.FAST2SMS_API_KEY?.trim() ||
    process.env.TWO_FACTOR_API_KEY?.trim() ||
    process.env.MSG91_AUTH_KEY?.trim() ||
    (process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim() && process.env.TWILIO_FROM_PHONE?.trim()) ||
    process.env.SMS_GATEWAY_URL?.trim()
  );
}

export async function sendMobileOtp({ phone, otp }: SendSmsOtpOptions): Promise<{ success: boolean; provider?: string; error?: string }> {
  const digits = phone.replace(/\D/g, "").slice(-10);
  const fullIndianNumber = `+91${digits}`;

  // 1. Fast2SMS (India OTP route)
  if (process.env.FAST2SMS_API_KEY?.trim()) {
    try {
      const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
        method: "POST",
        headers: {
          "authorization": process.env.FAST2SMS_API_KEY.trim(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          route: "otp",
          variables_values: otp,
          numbers: digits,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data as any)?.return) {
        return { success: true, provider: "fast2sms" };
      }
      const errMsg = (data as any)?.message?.[0] || (data as any)?.message || `HTTP ${res.status}`;
      console.error("[SMS] Fast2SMS error:", errMsg);
      return { success: false, provider: "fast2sms", error: errMsg };
    } catch (err: any) {
      console.error("[SMS] Fast2SMS exception:", err.message);
      return { success: false, provider: "fast2sms", error: err.message };
    }
  }

  // 2. 2Factor (India OTP route)
  if (process.env.TWO_FACTOR_API_KEY?.trim()) {
    try {
      const key = process.env.TWO_FACTOR_API_KEY.trim();
      const url = `https://2factor.in/API/V1/${key}/SMS/${digits}/${otp}/OTP1`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data as any)?.Status === "Success") {
        return { success: true, provider: "2factor" };
      }
      const errMsg = (data as any)?.Details || `HTTP ${res.status}`;
      console.error("[SMS] 2Factor error:", errMsg);
      return { success: false, provider: "2factor", error: errMsg };
    } catch (err: any) {
      console.error("[SMS] 2Factor exception:", err.message);
      return { success: false, provider: "2factor", error: err.message };
    }
  }

  // 3. MSG91
  if (process.env.MSG91_AUTH_KEY?.trim()) {
    try {
      const authKey = process.env.MSG91_AUTH_KEY.trim();
      const templateId = process.env.MSG91_TEMPLATE_ID?.trim() || "";
      const url = `https://control.msg91.com/api/v5/otp?template_id=${templateId}&mobile=91${digits}&authkey=${authKey}&otp=${otp}`;
      const res = await fetch(url, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data as any)?.type === "success") {
        return { success: true, provider: "msg91" };
      }
      const errMsg = (data as any)?.message || `HTTP ${res.status}`;
      console.error("[SMS] MSG91 error:", errMsg);
      return { success: false, provider: "msg91", error: errMsg };
    } catch (err: any) {
      console.error("[SMS] MSG91 exception:", err.message);
      return { success: false, provider: "msg91", error: err.message };
    }
  }

  // 4. Twilio
  if (process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim() && process.env.TWILIO_FROM_PHONE?.trim()) {
    try {
      const sid = process.env.TWILIO_ACCOUNT_SID.trim();
      const token = process.env.TWILIO_AUTH_TOKEN.trim();
      const auth = Buffer.from(`${sid}:${token}`).toString("base64");
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: fullIndianNumber,
          From: process.env.TWILIO_FROM_PHONE.trim(),
          Body: `Your Susruta Hospital phone verification code is: ${otp}. Valid for 10 minutes.`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data as any)?.sid) {
        return { success: true, provider: "twilio" };
      }
      const errMsg = (data as any)?.message || `HTTP ${res.status}`;
      console.error("[SMS] Twilio error:", errMsg);
      return { success: false, provider: "twilio", error: errMsg };
    } catch (err: any) {
      console.error("[SMS] Twilio exception:", err.message);
      return { success: false, provider: "twilio", error: err.message };
    }
  }

  // 5. Generic Gateway Webhook
  if (process.env.SMS_GATEWAY_URL?.trim()) {
    try {
      const url = process.env.SMS_GATEWAY_URL.replace("{phone}", digits).replace("{otp}", otp);
      const res = await fetch(url, { method: "POST" });
      if (res.ok) {
        return { success: true, provider: "custom_gateway" };
      }
      return { success: false, provider: "custom_gateway", error: `HTTP ${res.status}` };
    } catch (err: any) {
      console.error("[SMS] Custom gateway exception:", err.message);
      return { success: false, provider: "custom_gateway", error: err.message };
    }
  }

  // No SMS provider configured
  return {
    success: false,
    error: "sms_not_configured",
  };
}
