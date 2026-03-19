import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587");
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || `Susruta Hospital <noreply@susrutahospital.com>`;

const SMTP_CONFIGURED = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

function createTransport() {
  if (!SMTP_CONFIGURED) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

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

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#1a3d2b;padding:32px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:bold;letter-spacing:0.5px;">SUSRUTA HOSPITAL</h1>
              <p style="color:rgba(255,255,255,0.6);margin:6px 0 0;font-size:13px;">Authentic Ayurvedic Healthcare · Tirupati</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 36px 24px;">
              <p style="color:#444;font-size:16px;margin:0 0 12px;">Namaste, <strong>${name}</strong> 🙏</p>
              <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 28px;">
                ${isNewAccount
                  ? "Welcome! Please click the button below to verify your email and activate your patient account."
                  : "Click the button below to securely log in to your patient portal. This link is valid for <strong>15 minutes</strong>."}
              </p>
              <div style="text-align:center;margin:0 0 28px;">
                <a href="${verifyUrl}" style="display:inline-block;background:#2d6a4f;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:16px;font-weight:bold;">
                  ${isNewAccount ? "Verify Email & Continue" : "Log In to Portal →"}
                </a>
              </div>
              <p style="color:#999;font-size:12px;line-height:1.6;margin:0;">
                If you didn't request this, you can safely ignore this email.<br>
                This link expires in 15 minutes and can only be used once.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 36px 28px;border-top:1px solid #f0f0f0;">
              <p style="color:#bbb;font-size:11px;margin:0;text-align:center;">
                Susruta Hospital · 119, Ramulavari North Mada Street, Tirupati - 517 507<br>
                Phone: +91 9492068180
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  if (!SMTP_CONFIGURED) {
    console.log("\n========================================");
    console.log("📧 MAGIC LINK (SMTP not configured)");
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Verify URL: ${verifyUrl}`);
    console.log("========================================\n");
    return;
  }

  const transport = createTransport()!;
  await transport.sendMail({ from: SMTP_FROM, to, subject, html });
}
