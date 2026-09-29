import nodemailer from "nodemailer";
import { createHmac } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { db, siteSettingsTable } from "@workspace/db";

// ── Inline logo for emails (CID attachment — works in Gmail, Outlook, Apple Mail) ──
const LOGO_CID = "logo@susrutahospital.com";
const LOGO_PATH = (() => {
  try {
    const p = join(process.cwd(), "src", "lib", "assets", "logo.png");
    readFileSync(p); // verify it exists at startup
    return p;
  } catch (e) {
    console.warn("[email] Logo asset not found:", (e as Error).message);
    return null;
  }
})();

function logoAttachments(): import("nodemailer/lib/mailer").Attachment[] {
  if (!LOGO_PATH) return [];
  return [{
    filename: "logo.png",
    path: LOGO_PATH,
    cid: LOGO_CID,
    contentDisposition: "inline",
  }];
}

// ── Load SMTP config from DB (env vars as fallback) ───────────
export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
  fromName: string;
  fromEmail: string;
  subscriberFrom: string;
}

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  try {
    const [row] = await db.select().from(siteSettingsTable);
    if (row?.smtpHost?.trim() && row?.smtpUser?.trim() && row?.smtpPass?.trim()) {
      return {
        host: row.smtpHost.trim(),
        port: row.smtpPort ?? 587,
        user: row.smtpUser.trim(),
        pass: row.smtpPass.replace(/\s+/g, ""),
        secure: row.smtpSecure ?? false,
        fromName: row.smtpFromName || "Susruta Hospital",
        fromEmail: row.smtpFromEmail || row.smtpUser.trim(),
        subscriberFrom: row.smtpSubscriberFrom || row.smtpFromEmail || row.smtpUser.trim(),
      };
    }
  } catch {}

  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, "") : "";
  if (host && user && pass) {
    const port = parseInt(process.env.SMTP_PORT || "587");
    const secure = process.env.SMTP_SECURE === "true" || port === 465;
    const fromName = process.env.SMTP_FROM_NAME || "Susruta Hospital";
    const fromEmail = process.env.SMTP_FROM_EMAIL || user;
    return {
      host,
      port,
      user,
      pass,
      secure,
      fromName,
      fromEmail,
      subscriberFrom: fromEmail,
    };
  }

  return null;
}

function buildTransport(cfg: SmtpConfig) {
  const isSTARTTLS = !cfg.secure && (cfg.port === 587 || cfg.port === 25);
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    requireTLS: isSTARTTLS,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: false, minVersion: "TLSv1" as any },
    socketTimeout: 15000,
    connectionTimeout: 15000,
  });
}

function senderStr(name: string, email: string) {
  return `${name} <${email}>`;
}

// ── Base URL (for unsubscribe links) ─────────────────────────
function getBaseUrl(): string {
  // In a deployed environment, never use the dev preview URL
  if (process.env.REPLIT_DEPLOYMENT === "1") {
    return process.env.APP_URL || "https://susrutahospital.com";
  }
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (domain) return `https://${domain}`;
  return process.env.APP_URL || "https://susrutahospital.com";
}

// ── Unsubscribe token (HMAC-SHA256, no DB needed) ─────────────
const UNSUB_SECRET = process.env.UNSUBSCRIBE_SECRET || "susruta-unsub-hmac-2024";

export function makeUnsubscribeToken(email: string): string {
  return createHmac("sha256", UNSUB_SECRET)
    .update(email.toLowerCase().trim())
    .digest("hex")
    .slice(0, 32);
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = makeUnsubscribeToken(email);
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}

function makeUnsubscribeUrl(email: string): string {
  const token = makeUnsubscribeToken(email);
  return `${getBaseUrl()}/api/subscribers/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

// ── HTML → plain text (for multipart/alternative) ─────────────
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/blockquote>/gi, "\n")
    .replace(/<hr[^>]*>/gi, "\n" + "─".repeat(40) + "\n")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, "$2 ( $1 )")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Inline CSS for HTML email clients ─────────────────────────
function inlineEmailStyles(html: string): string {
  return html
    .replace(/<h1(?=[> ])/g, '<h1 style="color:#1a3d2b;font-size:22px;font-weight:bold;margin:0 0 14px;line-height:1.3;"')
    .replace(/<h2(?=[> ])/g, '<h2 style="color:#1a3d2b;font-size:18px;font-weight:bold;margin:0 0 12px;line-height:1.3;"')
    .replace(/<h3(?=[> ])/g, '<h3 style="color:#2d6a4f;font-size:15px;font-weight:bold;margin:0 0 10px;"')
    .replace(/<p(?=[> ])/g, '<p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 14px;"')
    .replace(/<ul(?=[> ])/g, '<ul style="color:#555;font-size:15px;line-height:1.7;margin:0 0 14px;padding-left:22px;"')
    .replace(/<ol(?=[> ])/g, '<ol style="color:#555;font-size:15px;line-height:1.7;margin:0 0 14px;padding-left:22px;"')
    .replace(/<li(?=[> ])/g, '<li style="margin-bottom:6px;"')
    .replace(/<blockquote(?=[> ])/g, '<blockquote style="border-left:4px solid #2d6a4f;margin:0 0 16px 0;padding:14px 18px;background:#f0f7f4;border-radius:0 8px 8px 0;font-style:italic;"')
    .replace(/<hr(?=[> /])/g, '<hr style="border:none;border-top:1px solid #e8e8e8;margin:22px 0;"')
    .replace(/<strong(?=[> ])/g, '<strong style="color:#333;"')
    .replace(/<a href=/g, '<a style="color:#2d6a4f;text-decoration:underline;" href=');
}

// ── Shared HTML email wrapper ─────────────────────────────────
const EMAIL_FOOTER_HTML = `
  <tr>
    <td style="padding:16px 36px 28px;border-top:1px solid #f0f0f0;">
      <p style="color:#bbb;font-size:11px;margin:0;text-align:center;line-height:1.7;">
        Susruta Hospital · 119, Ramulavari North Mada Street, Tirupati - 517 507<br>
        Phone: +91 9492068180 · <a href="https://susrutahospital.com" style="color:#bbb;">susrutahospital.com</a>
      </p>
    </td>
  </tr>`;

function emailWrapper(content: string) {
  const logoHeader = LOGO_PATH
    ? `<tr>
          <td style="background:#ffffff;padding:28px 36px 20px;text-align:center;border-bottom:4px solid #1a3d2b;">
            <img src="cid:${LOGO_CID}" alt="Susruta Hospital" width="240" height="27"
              style="display:block;margin:0 auto;max-width:240px;height:auto;border:0;" />
            <p style="color:#6b7280;margin:8px 0 0;font-size:11px;font-family:Arial,sans-serif;letter-spacing:0.5px;">Authentic Ayurvedic Healthcare &middot; Tirupati</p>
          </td>
        </tr>`
    : `<tr>
          <td style="background:#1a3d2b;padding:32px;text-align:center;border-bottom:4px solid #0f2419;">
            <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:bold;letter-spacing:0.5px;font-family:Arial,sans-serif;">SUSRUTA HOSPITAL</h1>
            <p style="color:rgba(255,255,255,0.6);margin:6px 0 0;font-size:12px;font-family:Arial,sans-serif;">Authentic Ayurvedic Healthcare &middot; Tirupati</p>
          </td>
        </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>Susruta Hospital</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.07);">
        ${logoHeader}
        ${content}
        ${EMAIL_FOOTER_HTML}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Magic link / email verify ─────────────────────────────────
export async function sendMagicLink(opts: {
  to: string;
  name: string;
  verifyUrl: string;
  isNewAccount: boolean;
  isVerificationReminder?: boolean;
}) {
  const { to, name, verifyUrl, isNewAccount, isVerificationReminder = false } = opts;
  const isVerificationEmail = isNewAccount || isVerificationReminder;
  const subject = isVerificationReminder
    ? "Reminder: Verify your Susruta Hospital Patient Account"
    : isNewAccount
      ? "Verify your Susruta Hospital Patient Account"
      : "Your Susruta Hospital Login Link";

  const bodyHtml = `
    <tr><td style="padding:36px 36px 24px;">
      <p style="color:#444;font-size:15px;margin:0 0 12px;font-family:Arial,sans-serif;">Namaste, <strong>${name}</strong></p>
      <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 28px;font-family:Arial,sans-serif;">
        ${isVerificationEmail
          ? isVerificationReminder
            ? "This is a friendly reminder to verify your email so you can access your Susruta Hospital patient portal."
            : "Welcome! Please click the button below to verify your email and activate your patient account."
          : "Click the button below to securely log in to your patient portal. This link is valid for <strong>15 minutes</strong>."}
      </p>
      <div style="text-align:center;margin:0 0 28px;">
        <a href="${verifyUrl}" style="display:inline-block;background:#2d6a4f;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:15px;font-weight:bold;font-family:Arial,sans-serif;">
          ${isVerificationEmail ? "Verify Email &amp; Continue" : "Log In to Portal"}
        </a>
      </div>
      <p style="color:#999;font-size:12px;line-height:1.6;margin:0;font-family:Arial,sans-serif;">
        If you did not request this, you can safely ignore this email.<br>
        This link expires in ${isVerificationEmail ? "24 hours" : "15 minutes"} and can only be used once.
      </p>
    </td></tr>`;

  const html = emailWrapper(bodyHtml);
  const text = [
    `Namaste, ${name}`,
    "",
    isVerificationEmail
      ? isVerificationReminder
        ? "This is a friendly reminder to verify your email so you can access your Susruta Hospital patient portal."
        : "Welcome! Please visit the link below to verify your email and activate your patient account."
      : "Visit the link below to securely log in to your patient portal. This link is valid for 15 minutes.",
    "",
    verifyUrl,
    "",
    "If you did not request this, please ignore this email.",
    `This link expires in ${isVerificationEmail ? "24 hours" : "15 minutes"} and can only be used once.`,
    "",
    "─────────────────────────────────────────",
    "Susruta Hospital · Tirupati · +91 9492068180",
  ].join("\n");

  const cfg = await getSmtpConfig();

  if (!cfg) {
    console.warn("[email] Verification email skipped because SMTP is not configured.");
    return false;
  }

  await buildTransport(cfg).sendMail({
    from: senderStr(cfg.fromName, cfg.fromEmail),
    to,
    subject,
    html,
    text,
    attachments: logoAttachments(),
  });
  return true;
}

// ── Password reset email ──────────────────────────────────────
export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  resetUrl: string;
}) {
  const { to, name, resetUrl } = opts;
  const subject = "Reset your Susruta Hospital password";

  const bodyHtml = `
    <tr><td style="padding:36px 36px 24px;">
      <p style="color:#444;font-size:15px;margin:0 0 12px;font-family:Arial,sans-serif;">Namaste, <strong>${name}</strong></p>
      <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 28px;font-family:Arial,sans-serif;">
        We received a request to reset your patient portal password. Click the button below to set a new password. This link is valid for <strong>1 hour</strong> and can only be used once.
      </p>
      <div style="text-align:center;margin:0 0 28px;">
        <a href="${resetUrl}" style="display:inline-block;background:#2d6a4f;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:15px;font-weight:bold;font-family:Arial,sans-serif;">
          Reset Password
        </a>
      </div>
      <p style="color:#999;font-size:12px;line-height:1.6;margin:0;font-family:Arial,sans-serif;">
        If you did not request a password reset, you can safely ignore this email — your password will not change.<br>
        This link expires in 1 hour.
      </p>
    </td></tr>`;

  const html = emailWrapper(bodyHtml);
  const text = [
    `Namaste, ${name}`,
    "",
    "We received a request to reset your patient portal password.",
    "Visit the link below to set a new password. Valid for 1 hour.",
    "",
    resetUrl,
    "",
    "If you did not request this, please ignore this email.",
    "",
    "─────────────────────────────────────────",
    "Susruta Hospital · Tirupati · +91 9492068180",
  ].join("\n");

  const cfg = await getSmtpConfig();

  if (!cfg) {
    console.warn("[email] Password reset email skipped because SMTP is not configured.");
    return;
  }

  await buildTransport(cfg).sendMail({
    from: senderStr(cfg.fromName, cfg.fromEmail),
    to,
    subject,
    html,
    text,
    attachments: logoAttachments(),
  });
}

// ── Profile Email Change OTP ──────────────────────────────────
export async function sendProfileEmailOtp(opts: {
  to: string;
  name: string;
  otp: string;
  newEmail: string;
}) {
  const { to, name, otp, newEmail } = opts;
  const subject = `${otp} is your Susruta Hospital email verification code`;

  const bodyHtml = `
    <tr><td style="padding:36px 36px 24px;">
      <p style="color:#444;font-size:15px;margin:0 0 12px;font-family:Arial,sans-serif;">Namaste, <strong>${name}</strong></p>
      <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px;font-family:Arial,sans-serif;">
        You recently requested to update your email address on the <strong>Susruta Hospital Patient Portal</strong> to <strong>${newEmail}</strong>. Use the 6-digit verification code below to confirm this change:
      </p>
      <div style="text-align:center;margin:0 0 24px;">
        <div style="display:inline-block;background:#f0fdf4;border:2px dashed #16a34a;color:#15803d;padding:16px 36px;border-radius:12px;font-size:32px;font-weight:900;letter-spacing:8px;font-family:monospace;">
          ${otp}
        </div>
      </div>
      <p style="color:#666;font-size:13px;line-height:1.6;margin:0 0 16px;font-family:Arial,sans-serif;text-align:center;">
        This code is valid for <strong>10 minutes</strong>. Do not share this code with anyone.
      </p>
      <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:4px;margin-bottom:20px;">
        <p style="color:#991b1b;font-size:12px;margin:0;font-family:Arial,sans-serif;">
          <strong>Security Notice:</strong> If you did not initiate this request, someone may be attempting to access your account. Please ignore this email or contact the hospital immediately.
        </p>
      </div>
    </td></tr>`;

  const html = emailWrapper(bodyHtml);
  const text = [
    `Namaste, ${name}`,
    "",
    `Your Susruta Hospital verification code is: ${otp}`,
    "",
    `This code was requested to change your email address to: ${newEmail}`,
    "This code will expire in 10 minutes.",
    "",
    "If you did not request this, please ignore this email.",
    "",
    "─────────────────────────────────────────",
    "Susruta Hospital · Tirupati · +91 9492068180",
  ].join("\n");

  const cfg = await getSmtpConfig();
  if (!cfg) {
    console.warn("[email] Email OTP skipped because SMTP is not configured.");
    return;
  }

  await buildTransport(cfg).sendMail({
    from: senderStr(cfg.fromName, cfg.fromEmail),
    to,
    subject,
    html,
    text,
    attachments: logoAttachments(),
  });
}

// ── Profile Phone Change OTP ──────────────────────────────────
export async function sendProfilePhoneOtp(opts: {
  to: string;
  name: string;
  otp: string;
  newPhone: string;
}) {
  const { to, name, otp, newPhone } = opts;
  const subject = `${otp} is your verification code to update your phone number`;

  const bodyHtml = `
    <tr><td style="padding:36px 36px 24px;">
      <p style="color:#444;font-size:15px;margin:0 0 12px;font-family:Arial,sans-serif;">Namaste, <strong>${name}</strong></p>
      <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px;font-family:Arial,sans-serif;">
        You requested to update your registered contact phone number to <strong>${newPhone}</strong> on your Susruta Hospital profile. Enter the 6-digit code below to complete this update:
      </p>
      <div style="text-align:center;margin:0 0 24px;">
        <div style="display:inline-block;background:#fff7ed;border:2px dashed #ea580c;color:#c2410c;padding:16px 36px;border-radius:12px;font-size:32px;font-weight:900;letter-spacing:8px;font-family:monospace;">
          ${otp}
        </div>
      </div>
      <p style="color:#666;font-size:13px;line-height:1.6;margin:0 0 16px;font-family:Arial,sans-serif;text-align:center;">
        This code is valid for <strong>10 minutes</strong>.
      </p>
      <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:4px;margin-bottom:20px;">
        <p style="color:#991b1b;font-size:12px;margin:0;font-family:Arial,sans-serif;">
          <strong>Security Notice:</strong> If you did not make this request, please contact the hospital immediately.
        </p>
      </div>
    </td></tr>`;

  const html = emailWrapper(bodyHtml);
  const text = [
    `Namaste, ${name}`,
    "",
    `Your Susruta Hospital phone update verification code is: ${otp}`,
    "",
    `This code was requested to change your phone number to: ${newPhone}`,
    "This code will expire in 10 minutes.",
    "",
    "If you did not request this, please ignore this email.",
    "",
    "─────────────────────────────────────────",
    "Susruta Hospital · Tirupati · +91 9492068180",
  ].join("\n");

  const cfg = await getSmtpConfig();
  if (!cfg) {
    console.warn("[email] Phone OTP skipped because SMTP is not configured.");
    return;
  }

  await buildTransport(cfg).sendMail({
    from: senderStr(cfg.fromName, cfg.fromEmail),
    to,
    subject,
    html,
    text,
    attachments: logoAttachments(),
  });
}

// ── Email Change Security Notification ────────────────────────
export async function sendEmailChangeNotification(opts: {
  to: string;
  name: string;
  newEmail: string;
}) {
  const { to, name, newEmail } = opts;
  const subject = "Security Alert: Your Susruta Hospital account email was changed";

  const bodyHtml = `
    <tr><td style="padding:36px 36px 24px;">
      <p style="color:#444;font-size:15px;margin:0 0 12px;font-family:Arial,sans-serif;">Namaste, <strong>${name}</strong></p>
      <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px;font-family:Arial,sans-serif;">
        This is a security alert to confirm that your registered email address for your Susruta Hospital account has been changed to <strong>${newEmail}</strong>.
      </p>
      <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 20px;font-family:Arial,sans-serif;">
        Future notifications, appointments, and medical records will be sent to the new address.
      </p>
      <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:4px;margin-bottom:20px;">
        <p style="color:#991b1b;font-size:12px;margin:0;font-family:Arial,sans-serif;">
          <strong>Didn't make this change?</strong> Please contact Susruta Hospital support immediately at +91 9492068180 or visit our clinic.
        </p>
      </div>
    </td></tr>`;

  const html = emailWrapper(bodyHtml);
  const text = [
    `Namaste, ${name}`,
    "",
    `Security Alert: Your Susruta Hospital account email has been updated to: ${newEmail}`,
    "",
    "If you did not authorize this change, please contact Susruta Hospital support immediately at +91 9492068180.",
    "",
    "─────────────────────────────────────────",
    "Susruta Hospital · Tirupati · +91 9492068180",
  ].join("\n");

  const cfg = await getSmtpConfig();
  if (!cfg) return;

  await buildTransport(cfg).sendMail({
    from: senderStr(cfg.fromName, cfg.fromEmail),
    to,
    subject,
    html,
    text,
    attachments: logoAttachments(),
  }).catch(err => console.error("[email] Email change notification error:", err));
}

// ── Subscriber acknowledgement ────────────────────────────────
export async function sendSubscriptionConfirmation(opts: { to: string; name: string }) {
  const { to, name } = opts;
  const subject = "You're on the list — Susruta Hospital";
  const unsubUrl = makeUnsubscribeUrl(to);

  const bodyHtml = `
    <tr><td style="padding:36px 36px 24px;">
      <p style="color:#444;font-size:15px;margin:0 0 12px;font-family:Arial,sans-serif;">Namaste, <strong>${name}</strong></p>
      <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 16px;font-family:Arial,sans-serif;">
        Thank you for subscribing. You are now on our early-access list.
      </p>
      <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 28px;font-family:Arial,sans-serif;">
        As soon as our <strong>online appointment booking, patient portal, and digital services</strong> go live, you will be among the very first to know.
      </p>
      <div style="background:#f0f7f4;border-left:4px solid #2d6a4f;border-radius:0 8px 8px 0;padding:16px 20px;margin:0 0 24px;">
        <p style="color:#2d6a4f;font-size:14px;margin:0;font-style:italic;font-family:Arial,sans-serif;">
          "Healing through nature, guided by science — your Ayurvedic journey begins here."
        </p>
      </div>
      <p style="color:#777;font-size:13px;line-height:1.6;margin:0 0 0;font-family:Arial,sans-serif;">
        In the meantime, reach us directly:<br>
        Phone: <strong>+91 9492068180</strong><br>
        Address: 119, Ramulavari North Mada Street, Tirupati
      </p>
      <hr style="border:none;border-top:1px solid #f0f0f0;margin:24px 0 16px;">
      <p style="color:#ccc;font-size:11px;margin:0 0 8px;line-height:1.6;font-family:Arial,sans-serif;">
        You subscribed to updates from Susruta Hospital.
      </p>
      <p style="margin:0;font-family:Arial,sans-serif;">
        <a href="${unsubUrl}" style="color:#aaa;font-size:11px;text-decoration:underline;font-family:Arial,sans-serif;">Unsubscribe</a>
      </p>
    </td></tr>`;

  const html = emailWrapper(bodyHtml);
  const text = [
    `Namaste, ${name}`,
    "",
    "Thank you for subscribing. You are now on our early-access list.",
    "",
    "As soon as our online appointment booking, patient portal, and digital services go live, you will be among the very first to know.",
    "",
    '"Healing through nature, guided by science — your Ayurvedic journey begins here."',
    "",
    "In the meantime, reach us directly:",
    "Phone: +91 9492068180",
    "Address: 119, Ramulavari North Mada Street, Tirupati",
    "",
    "─────────────────────────────────────────",
    "Susruta Hospital · susrutahospital.com",
    `To unsubscribe: ${unsubUrl}`,
  ].join("\n");

  const cfg = await getSmtpConfig();

  if (!cfg) {
    console.log(`\nSUBSCRIPTION CONFIRMATION -> ${to} (${name}) — SMTP not configured\n`);
    return;
  }

  await buildTransport(cfg).sendMail({
    from: senderStr(cfg.fromName, cfg.subscriberFrom),
    replyTo: cfg.subscriberFrom,
    to,
    subject,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>, <mailto:${cfg.subscriberFrom}?subject=Unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    attachments: logoAttachments(),
  });
}

// ── Broadcast to subscriber ───────────────────────────────────
export async function sendBroadcastEmail(opts: {
  to: string;
  name: string;
  subject: string;
  bodyHtml: string;
}) {
  const { to, name, subject, bodyHtml } = opts;
  const cfg = await getSmtpConfig();
  if (!cfg) throw new Error("SMTP not configured. Please set up email settings first.");

  const unsubUrl = makeUnsubscribeUrl(to);
  const styledBody = inlineEmailStyles(bodyHtml);

  const wrappedBodyHtml = `
    <tr><td style="padding:36px 36px 28px;">
      <p style="color:#444;font-size:15px;margin:0 0 22px;font-family:Arial,sans-serif;">Namaste, <strong>${name}</strong></p>
      <div style="font-family:Arial,sans-serif;">${styledBody}</div>
      <hr style="border:none;border-top:1px solid #f0f0f0;margin:28px 0 18px;">
      <p style="color:#ccc;font-size:11px;margin:0 0 8px;line-height:1.7;font-family:Arial,sans-serif;">
        You are receiving this because you subscribed to updates from Susruta Hospital.
      </p>
      <p style="margin:0;font-family:Arial,sans-serif;">
        <a href="${unsubUrl}" style="color:#aaa;font-size:11px;text-decoration:underline;font-family:Arial,sans-serif;">Unsubscribe</a>
      </p>
    </td></tr>`;

  const html = emailWrapper(wrappedBodyHtml);

  // Generate plain-text alternative from the raw body HTML
  const text = [
    `Namaste, ${name}`,
    "",
    htmlToText(bodyHtml),
    "",
    "─────────────────────────────────────────",
    "Susruta Hospital · Tirupati · susrutahospital.com",
    `To unsubscribe: ${unsubUrl}`,
  ].join("\n");

  const msgId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@susrutahospital.com>`;

  await buildTransport(cfg).sendMail({
    from: senderStr(cfg.fromName, cfg.subscriberFrom),
    replyTo: cfg.subscriberFrom,
    to,
    subject,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>, <mailto:${cfg.subscriberFrom}?subject=Unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "Precedence": "bulk",
      "X-Mailer": "Susruta Hospital Newsletter",
      "Message-ID": msgId,
    },
    attachments: logoAttachments(),
  });
}

// ── Appointment booking acknowledgement ──────────────────────
export async function sendAppointmentAckEmail(opts: {
  to: string;
  patientName: string;
  type: "offline" | "online";
  date: string;
  timeSlot?: string;
  slotStartTime?: string;
  slotEndTime?: string;
  reason?: string;
}) {
  const { to, patientName, type, date, timeSlot, slotStartTime, slotEndTime, reason } = opts;

  const cfg = await getSmtpConfig();
  if (!cfg) {
    console.log(`[email] Appointment ack -> ${to} — SMTP not configured`);
    return;
  }

  const fmtDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  function fmtTime(t: string) {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
  }

  const typeLabel = type === "online" ? "Online Consultation" : "In-Person Visit";
  const timeStr = type === "online" && slotStartTime && slotEndTime
    ? `${fmtTime(slotStartTime)} – ${fmtTime(slotEndTime)}`
    : timeSlot ?? "";
  const subject = `Appointment Request Received — Susruta Hospital`;

  const bodyHtml = `
    <tr><td style="padding:36px 36px 24px;">
      <p style="color:#444;font-size:15px;margin:0 0 12px;font-family:Arial,sans-serif;">Namaste, <strong>${patientName}</strong></p>
      <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px;font-family:Arial,sans-serif;">
        We have received your <strong>${typeLabel}</strong> appointment request. Our team will review and confirm it shortly.
      </p>
      <div style="background:#f0f7f4;border-radius:12px;padding:20px 24px;margin:0 0 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:4px 0;">
            <p style="color:#666;font-size:12px;font-family:Arial,sans-serif;margin:0;text-transform:uppercase;letter-spacing:0.5px;">Appointment Type</p>
            <p style="color:#1a3d2b;font-size:14px;font-weight:bold;font-family:Arial,sans-serif;margin:2px 0 12px;">${typeLabel}</p>
          </td></tr>
          <tr><td style="padding:4px 0;">
            <p style="color:#666;font-size:12px;font-family:Arial,sans-serif;margin:0;text-transform:uppercase;letter-spacing:0.5px;">Date</p>
            <p style="color:#1a3d2b;font-size:14px;font-weight:bold;font-family:Arial,sans-serif;margin:2px 0 12px;">${fmtDate(date)}</p>
          </td></tr>
          ${timeStr ? `<tr><td style="padding:4px 0;">
            <p style="color:#666;font-size:12px;font-family:Arial,sans-serif;margin:0;text-transform:uppercase;letter-spacing:0.5px;">Time</p>
            <p style="color:#1a3d2b;font-size:14px;font-weight:bold;font-family:Arial,sans-serif;margin:2px 0 12px;">${timeStr}</p>
          </td></tr>` : ""}
          ${reason ? `<tr><td style="padding:4px 0;">
            <p style="color:#666;font-size:12px;font-family:Arial,sans-serif;margin:0;text-transform:uppercase;letter-spacing:0.5px;">Reason</p>
            <p style="color:#444;font-size:14px;font-family:Arial,sans-serif;margin:2px 0 0;">${reason}</p>
          </td></tr>` : ""}
        </table>
      </div>
      ${type === "online"
        ? `<div style="background:#fffbea;border:1px solid #f0d080;border-radius:10px;padding:14px 18px;margin:0 0 20px;">
            <p style="color:#7a5800;font-size:13px;font-family:Arial,sans-serif;margin:0;line-height:1.6;">
              <strong>Next step:</strong> Once our admin approves your request, you will receive a separate email with the meeting link for your video consultation.
            </p>
          </div>`
        : `<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 20px;font-family:Arial,sans-serif;">
            You will receive a confirmation once your appointment is approved. For queries, call <strong>+91 9492068180</strong>.
          </p>`}
      <p style="color:#999;font-size:12px;font-family:Arial,sans-serif;margin:0;">
        Dr. P. Murali Krishna — Susruta Hospital, Tirupati
      </p>
    </td></tr>`;

  const html = emailWrapper(bodyHtml);
  const text = [
    `Namaste, ${patientName}`,
    "",
    `We have received your ${typeLabel} appointment request.`,
    "",
    `Date: ${fmtDate(date)}`,
    timeStr ? `Time: ${timeStr}` : "",
    reason ? `Reason: ${reason}` : "",
    "",
    type === "online"
      ? "Once our admin approves your request, you will receive a separate email with the meeting link."
      : "You will receive a confirmation once your appointment is approved. For queries, call +91 9492068180.",
    "",
    "─────────────────────────────────────────",
    "Susruta Hospital · Tirupati · +91 9492068180",
  ].filter(Boolean).join("\n");

  await buildTransport(cfg).sendMail({
    from: senderStr(cfg.fromName, cfg.fromEmail),
    to,
    subject,
    html,
    text,
    attachments: logoAttachments(),
  });
}

// ── Online consultation approval with meeting link ────────────
export async function sendOnlineMeetingLinkEmail(opts: {
  to: string;
  patientName: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  meetingLink: string;
}) {
  const { to, patientName, slotDate, startTime, endTime, meetingLink } = opts;

  const cfg = await getSmtpConfig();
  if (!cfg) {
    console.log(`[email] Meeting link -> ${to} — SMTP not configured`);
    return;
  }

  const fmtDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  function fmtTime(t: string) {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
  }

  const subject = `Your Online Consultation is Confirmed — Susruta Hospital`;

  const bodyHtml = `
    <tr><td style="padding:36px 36px 24px;">
      <p style="color:#444;font-size:15px;margin:0 0 12px;font-family:Arial,sans-serif;">Namaste, <strong>${patientName}</strong></p>
      <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px;font-family:Arial,sans-serif;">
        Your online consultation with <strong>Dr. P. Murali Krishna</strong> has been <strong style="color:#1a7a4a;">confirmed</strong>. Please join using the link below at the scheduled time.
      </p>
      <div style="background:#f0f7f4;border-radius:12px;padding:20px 24px;margin:0 0 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:4px 0;">
            <p style="color:#666;font-size:12px;font-family:Arial,sans-serif;margin:0;text-transform:uppercase;letter-spacing:0.5px;">Date</p>
            <p style="color:#1a3d2b;font-size:14px;font-weight:bold;font-family:Arial,sans-serif;margin:2px 0 12px;">${fmtDate(slotDate)}</p>
          </td></tr>
          <tr><td style="padding:4px 0;">
            <p style="color:#666;font-size:12px;font-family:Arial,sans-serif;margin:0;text-transform:uppercase;letter-spacing:0.5px;">Time</p>
            <p style="color:#1a3d2b;font-size:14px;font-weight:bold;font-family:Arial,sans-serif;margin:2px 0 0;">${fmtTime(startTime)} – ${fmtTime(endTime)}</p>
          </td></tr>
        </table>
      </div>
      <div style="text-align:center;margin:0 0 20px;">
        <a href="${meetingLink}" target="_blank" style="display:inline-block;background:#1a7a4a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:15px;font-weight:bold;font-family:Arial,sans-serif;">
          Join Video Consultation
        </a>
      </div>
      <p style="color:#777;font-size:13px;line-height:1.6;margin:0 0 12px;font-family:Arial,sans-serif;">
        If the button above does not work, copy and paste this link into your browser:
      </p>
      <p style="margin:0 0 20px;">
        <a href="${meetingLink}" style="color:#1a7a4a;font-size:13px;word-break:break-all;font-family:Arial,sans-serif;">${meetingLink}</a>
      </p>
      <div style="background:#fff8f0;border:1px solid #f0c080;border-radius:10px;padding:14px 18px;margin:0 0 20px;">
        <p style="color:#7a4800;font-size:13px;font-family:Arial,sans-serif;margin:0;line-height:1.6;">
          <strong>Tips:</strong> Please join 2–3 minutes early. Keep your uploaded reports or documents handy. Ensure a stable internet connection and a quiet space.
        </p>
      </div>
      <p style="color:#999;font-size:12px;font-family:Arial,sans-serif;margin:0;">
        Dr. P. Murali Krishna — Susruta Hospital, Tirupati · +91 9492068180
      </p>
    </td></tr>`;

  const html = emailWrapper(bodyHtml);
  const text = [
    `Namaste, ${patientName}`,
    "",
    "Your online consultation with Dr. P. Murali Krishna has been CONFIRMED.",
    "",
    `Date: ${fmtDate(slotDate)}`,
    `Time: ${fmtTime(startTime)} – ${fmtTime(endTime)}`,
    "",
    "Join your video consultation using this link:",
    meetingLink,
    "",
    "Tips: Join 2–3 minutes early. Keep your documents handy. Ensure stable internet.",
    "",
    "─────────────────────────────────────────",
    "Susruta Hospital · Tirupati · +91 9492068180",
  ].join("\n");

  await buildTransport(cfg).sendMail({
    from: senderStr(cfg.fromName, cfg.fromEmail),
    to,
    subject,
    html,
    text,
    attachments: logoAttachments(),
  });
}

// ── Donation Thank-You Email ──────────────────────────────────
export async function sendDonationThankYou({ to, name, patientCode, amount, lastSixDigits, donationDate }: {
  to: string; name: string; patientCode?: string | null; amount: string; lastSixDigits: string; donationDate: string;
}): Promise<void> {
  const cfg = await getSmtpConfig();
  if (!cfg) throw new Error("SMTP not configured");

  const subject = "Susruta Hospital — Thank You for Your Generous Donation 🙏";

  const bodyHtml = `
    <tr><td style="padding:32px 36px 24px;">
      <h2 style="color:#1a3d2b;font-size:20px;font-weight:bold;margin:0 0 16px;font-family:Arial,sans-serif;">Thank You, ${name}! 🙏</h2>
      <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 14px;font-family:Arial,sans-serif;">
        We are deeply touched by your generous donation to Susruta Hospital. Your kindness means more than words can express.
      </p>
      <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 20px;font-family:Arial,sans-serif;">
        Every contribution helps Dr. P. Murali Krishna continue providing Ayurvedic care to those who cannot afford treatment, sustaining a mission rooted in compassion and healing.
      </p>
      <table role="presentation" width="100%" style="background:#f0f7f4;border-radius:12px;padding:20px;margin-bottom:20px;">
        <tr><td style="padding:4px 0;">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#888;">Donation Receipt</p>
        </td></tr>
        <tr><td style="padding:4px 0;">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#333;"><strong>Name:</strong> ${name}</p>
        </td></tr>
        ${patientCode ? `<tr><td style="padding:4px 0;"><p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#333;"><strong>Patient ID:</strong> ${patientCode}</p></td></tr>` : ""}
        <tr><td style="padding:4px 0;">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#333;"><strong>Amount:</strong> ₹${amount}</p>
        </td></tr>
        <tr><td style="padding:4px 0;">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#333;"><strong>Transaction (last 6):</strong> xxxxxx${lastSixDigits}</p>
        </td></tr>
        <tr><td style="padding:4px 0;">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#333;"><strong>Date:</strong> ${donationDate}</p>
        </td></tr>
      </table>
      <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 14px;font-family:Arial,sans-serif;">
        May your good deed return to you and your loved ones in the form of health, prosperity, and happiness. 🌿
      </p>
      <p style="color:#555;font-size:14px;line-height:1.7;margin:0;font-family:Arial,sans-serif;font-style:italic;">
        With gratitude,<br>Dr. P. Murali Krishna &amp; Team Susruta Hospital
      </p>
    </td></tr>`;

  const html = emailWrapper(bodyHtml);
  const text = [
    `Thank You, ${name}!`,
    "",
    "We are deeply touched by your generous donation to Susruta Hospital.",
    "",
    "Donation Receipt:",
    `  Name: ${name}`,
    patientCode ? `  Patient ID: ${patientCode}` : "",
    `  Amount: Rs. ${amount}`,
    `  Transaction (last 6): xxxxxx${lastSixDigits}`,
    `  Date: ${donationDate}`,
    "",
    "With gratitude,",
    "Dr. P. Murali Krishna & Team Susruta Hospital",
    "─────────────────────────────────────────",
    "Susruta Hospital · Tirupati · +91 9492068180",
  ].filter(Boolean).join("\n");

  await buildTransport(cfg).sendMail({
    from: senderStr(cfg.fromName, cfg.fromEmail),
    to,
    subject,
    html,
    text,
    attachments: logoAttachments(),
  });
}

// ── SMTP connection test ──────────────────────────────────────
export async function testSmtpConnection(cfg: SmtpConfig, testTo: string): Promise<void> {
  const transport = buildTransport(cfg);
  await transport.verify();

  const bodyHtml = `
    <tr><td style="padding:36px 36px 24px;">
      <p style="color:#444;font-size:15px;margin:0 0 16px;font-family:Arial,sans-serif;"><strong>SMTP Test Successful</strong></p>
      <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 12px;font-family:Arial,sans-serif;">
        Your email settings are working correctly.<br>
        System emails will be sent from: <strong style="color:#1a3d2b;">${senderStr(cfg.fromName, cfg.fromEmail)}</strong>
      </p>
      <p style="color:#555;font-size:14px;line-height:1.6;margin:0;font-family:Arial,sans-serif;">
        Subscriber newsletters will be sent from: <strong style="color:#1a3d2b;">${senderStr(cfg.fromName, cfg.subscriberFrom)}</strong>
      </p>
    </td></tr>`;

  const html = emailWrapper(bodyHtml);
  const text = `SMTP Test Successful\n\nYour email settings are working correctly.\nSystem emails: ${senderStr(cfg.fromName, cfg.fromEmail)}\nNewsletter emails: ${senderStr(cfg.fromName, cfg.subscriberFrom)}`;

  await transport.sendMail({
    from: senderStr(cfg.fromName, cfg.fromEmail),
    to: testTo,
    subject: "Susruta Hospital — SMTP Test Successful",
    html,
    text,
    attachments: logoAttachments(),
  });
}
