import nodemailer from "nodemailer";
import { db, siteSettingsTable } from "@workspace/db";

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
  // Try DB first
  try {
    const [row] = await db.select().from(siteSettingsTable);
    if (row?.smtpHost && row?.smtpUser && row?.smtpPass) {
      return {
        host: row.smtpHost,
        port: row.smtpPort ?? 587,
        user: row.smtpUser,
        pass: row.smtpPass,
        secure: row.smtpSecure ?? false,
        fromName: row.smtpFromName ?? "Susruta Hospital",
        fromEmail: row.smtpFromEmail ?? "noreply@susrutahospital.com",
        subscriberFrom: row.smtpSubscriberFrom ?? "updates@susrutahospital.com",
      };
    }
  } catch {}

  // Fallback: env vars
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (host && user && pass) {
    return {
      host,
      port: parseInt(process.env.SMTP_PORT || "587"),
      user,
      pass,
      secure: process.env.SMTP_PORT === "465",
      fromName: "Susruta Hospital",
      fromEmail: process.env.SMTP_FROM_EMAIL || "noreply@susrutahospital.com",
      subscriberFrom: "updates@susrutahospital.com",
    };
  }

  return null;
}

function buildTransport(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: false },
  });
}

function senderStr(name: string, email: string) {
  return `${name} <${email}>`;
}

// ── Shared email footer ───────────────────────────────────────
const EMAIL_FOOTER = `
  <tr>
    <td style="padding:16px 36px 28px;border-top:1px solid #f0f0f0;">
      <p style="color:#bbb;font-size:11px;margin:0;text-align:center;">
        Susruta Hospital · 119, Ramulavari North Mada Street, Tirupati - 517 507<br>
        Phone: +91 9492068180 · <a href="https://susrutahospital.com" style="color:#bbb;">susrutahospital.com</a>
      </p>
    </td>
  </tr>`;

function emailWrapper(content: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#1a3d2b;padding:32px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:bold;letter-spacing:0.5px;">SUSRUTA HOSPITAL</h1>
            <p style="color:rgba(255,255,255,0.6);margin:6px 0 0;font-size:13px;">Authentic Ayurvedic Healthcare · Tirupati</p>
          </td>
        </tr>
        ${content}
        ${EMAIL_FOOTER}
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
}) {
  const { to, name, verifyUrl, isNewAccount } = opts;
  const subject = isNewAccount
    ? "Verify your Susruta Hospital Patient Account"
    : "Your Susruta Hospital Login Link";

  const body = `
    <tr><td style="padding:36px 36px 24px;">
      <p style="color:#444;font-size:16px;margin:0 0 12px;">Namaste, <strong>${name}</strong> 🙏</p>
      <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 28px;">
        ${isNewAccount
          ? "Welcome! Please click the button below to verify your email and activate your patient account."
          : "Click the button below to securely log in to your patient portal. This link is valid for <strong>15 minutes</strong>."}
      </p>
      <div style="text-align:center;margin:0 0 28px;">
        <a href="${verifyUrl}" style="display:inline-block;background:#2d6a4f;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:16px;font-weight:bold;">
          ${isNewAccount ? "Verify Email &amp; Continue" : "Log In to Portal →"}
        </a>
      </div>
      <p style="color:#999;font-size:12px;line-height:1.6;margin:0;">
        If you didn't request this, you can safely ignore this email.<br>
        This link expires in 15 minutes and can only be used once.
      </p>
    </td></tr>`;

  const html = emailWrapper(body);
  const cfg = await getSmtpConfig();

  if (!cfg) {
    console.log("\n========================================");
    console.log("📧 MAGIC LINK (SMTP not configured)");
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Verify URL: ${verifyUrl}`);
    console.log("========================================\n");
    return;
  }

  const from = senderStr(cfg.fromName, cfg.fromEmail);
  await buildTransport(cfg).sendMail({ from, to, subject, html });
}

// ── Subscriber acknowledgement ────────────────────────────────
export async function sendSubscriptionConfirmation(opts: { to: string; name: string }) {
  const { to, name } = opts;
  const subject = "You're on the list! — Susruta Hospital";

  const body = `
    <tr><td style="padding:36px 36px 24px;">
      <p style="color:#444;font-size:16px;margin:0 0 12px;">Namaste, <strong>${name}</strong> 🙏</p>
      <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Thank you for subscribing! You are now on our early-access list.
      </p>
      <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 28px;">
        As soon as our <strong>online appointment booking, patient portal, and other digital services</strong> go live, you will be among the very first to know — right in your inbox.
      </p>
      <div style="background:#f0f7f4;border-left:4px solid #2d6a4f;border-radius:8px;padding:16px 20px;margin:0 0 24px;">
        <p style="color:#2d6a4f;font-size:14px;margin:0;font-style:italic;">
          "Healing through nature, guided by science — your Ayurvedic journey begins here."
        </p>
      </div>
      <p style="color:#777;font-size:13px;line-height:1.6;margin:0;">
        In the meantime, feel free to reach us directly:<br>
        📞 <strong>+91 9492068180</strong><br>
        📍 119, Ramulavari North Mada Street, Tirupati
      </p>
    </td></tr>`;

  const html = emailWrapper(body);
  const cfg = await getSmtpConfig();

  if (!cfg) {
    console.log(`\n📧 SUBSCRIPTION CONFIRMATION → ${to} (${name}) — SMTP not configured\n`);
    return;
  }

  const from = senderStr(cfg.fromName, cfg.subscriberFrom);
  await buildTransport(cfg).sendMail({
    from,
    replyTo: cfg.subscriberFrom,
    to,
    subject,
    html,
  });
}

// ── Inline email styles for broadcast HTML ────────────────────
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

  const styledBody = inlineEmailStyles(bodyHtml);

  const body = `
    <tr><td style="padding:36px 36px 28px;">
      <p style="color:#444;font-size:15px;margin:0 0 22px;">Namaste, <strong>${name}</strong> 🙏</p>
      <div>${styledBody}</div>
      <hr style="border:none;border-top:1px solid #f0f0f0;margin:28px 0 18px;">
      <p style="color:#bbb;font-size:11px;margin:0;line-height:1.6;">
        You are receiving this because you subscribed for updates from Susruta Hospital.<br>
        To unsubscribe, reply to this email with the subject <em>Unsubscribe</em>.
      </p>
    </td></tr>`;

  const html = emailWrapper(body);
  const from = senderStr(cfg.fromName, cfg.subscriberFrom);
  const msgId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@susrutahospital.com>`;

  await buildTransport(cfg).sendMail({
    from,
    replyTo: cfg.subscriberFrom,
    to,
    subject,
    html,
    headers: {
      "List-Unsubscribe": `<mailto:${cfg.subscriberFrom}?subject=Unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "Precedence": "bulk",
      "X-Mailer": "Susruta Hospital Newsletter v1.0",
      "Message-ID": msgId,
    },
  });
}

// ── SMTP connection test ──────────────────────────────────────
export async function testSmtpConnection(cfg: SmtpConfig, testTo: string): Promise<void> {
  const transport = buildTransport(cfg);
  await transport.verify();

  const html = emailWrapper(`
    <tr><td style="padding:36px 36px 24px;">
      <p style="color:#444;font-size:16px;margin:0 0 16px;">✅ <strong>SMTP Test Successful!</strong></p>
      <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px;">
        Your email settings are working correctly. Emails from Susruta Hospital will be delivered from:<br>
        <strong style="color:#1a3d2b;">${senderStr(cfg.fromName, cfg.fromEmail)}</strong>
      </p>
      <p style="color:#555;font-size:14px;line-height:1.6;margin:0;">
        Subscriber communications will show:<br>
        <strong style="color:#1a3d2b;">${senderStr(cfg.fromName, cfg.subscriberFrom)}</strong>
      </p>
    </td></tr>`);

  await transport.sendMail({
    from: senderStr(cfg.fromName, cfg.fromEmail),
    to: testTo,
    subject: "✅ Susruta Hospital — SMTP Test Successful",
    html,
  });
}
