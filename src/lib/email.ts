import nodemailer from "nodemailer";

/**
 * Transactional email delivery.
 *
 * Configuration (see .env.example):
 * - SMTP (preferred, provider-agnostic): SMTP_HOST, SMTP_PORT,
 *   SMTP_USER, SMTP_PASS, EMAIL_FROM. Port 465 uses implicit TLS;
 *   other ports use STARTTLS (required, never silently downgraded).
 * - Or Resend: RESEND_API_KEY + EMAIL_FROM.
 *
 * If neither is configured, sending reports `not-configured` and the
 * caller decides how to surface that — this module NEVER pretends an
 * email was delivered. Provider errors are reported as `failed` with a
 * generic reason; credentials and message bodies are never logged.
 */
export type EmailResult =
  | { delivered: true; provider: "smtp" | "resend" }
  | { delivered: false; reason: "not-configured" | "failed" };

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function emailFrom(): string | null {
  const from = process.env.EMAIL_FROM?.trim();
  return from && /.+@.+\..+/.test(from) ? from : null;
}

export function emailProviderConfigured(): boolean {
  if (!emailFrom()) return false;
  return Boolean(process.env.SMTP_HOST?.trim() || process.env.RESEND_API_KEY?.trim());
}

async function sendViaSmtp(message: EmailMessage): Promise<boolean> {
  const host = process.env.SMTP_HOST!.trim();
  const port = Number(process.env.SMTP_PORT ?? (process.env.SMTP_SECURE === "true" ? 465 : 587));
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  // STARTTLS is mandatory on non-implicit-TLS ports by default; the
  // explicit SMTP_REQUIRE_TLS=false escape hatch exists only for
  // trusted private relays that do not offer it. Timeouts keep a dead
  // or misbehaving mail server from hanging the request.
  const requireTLS = process.env.SMTP_REQUIRE_TLS
    ? process.env.SMTP_REQUIRE_TLS === "true"
    : !secure;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: user ? { user, pass } : undefined,
  });
  await transport.sendMail({
    from: emailFrom()!,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  return true;
}

async function sendViaResend(message: EmailMessage): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom()!,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });
  return res.ok;
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (!emailFrom()) return { delivered: false, reason: "not-configured" };
  try {
    if (process.env.SMTP_HOST?.trim()) {
      await sendViaSmtp(message);
      return { delivered: true, provider: "smtp" };
    }
    if (process.env.RESEND_API_KEY?.trim()) {
      const ok = await sendViaResend(message);
      return ok ? { delivered: true, provider: "resend" } : { delivered: false, reason: "failed" };
    }
  } catch {
    return { delivered: false, reason: "failed" };
  }
  return { delivered: false, reason: "not-configured" };
}

/** Password-reset email body. The reset URL carries the only copy of the plaintext token. */
export function passwordResetEmail(params: {
  instituteName: string;
  resetUrl: string;
  expiresMinutes: number;
}): Omit<EmailMessage, "to"> {
  const { instituteName, resetUrl, expiresMinutes } = params;
  const subject = `Reset your ${instituteName} password`;
  const text = [
    `We received a request to reset the password for your ${instituteName} account.`,
    "",
    `Open this link within ${expiresMinutes} minutes to choose a new password:`,
    resetUrl,
    "",
    "If you did not request this, you can ignore this email — your password will not change.",
    "For your security, never share this link with anyone.",
  ].join("\n");
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <h1 style="font-size:20px;margin:0 0 12px">Reset your password</h1>
  <p style="font-size:14px;line-height:1.6">We received a request to reset the password for your ${instituteName} account.</p>
  <p style="margin:24px 0"><a href="${resetUrl}" style="background:#1450d2;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-size:14px">Choose a new password</a></p>
  <p style="font-size:13px;line-height:1.6;color:#475569">This link expires in ${expiresMinutes} minutes and can be used once. If the button does not work, copy this address into your browser:<br>${resetUrl}</p>
  <p style="font-size:13px;line-height:1.6;color:#475569">If you did not request this, ignore this email — your password will not change. Never share this link with anyone.</p>
</div>`;
  return { subject, text, html };
}
