import nodemailer from "nodemailer";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};
export type EmailResult =
  | { delivered: true; provider: "smtp" | "resend" }
  | { delivered: false; reason: "not-configured" | "failed" };
export function emailProviderConfigured() {
  return (
    !!process.env.EMAIL_FROM?.trim() &&
    !!(process.env.SMTP_HOST?.trim() || process.env.RESEND_API_KEY?.trim())
  );
}
// "delivered" is the legacy API name: it means provider acceptance, never inbox receipt.
export async function sendEmail(
  message: EmailMessage,
  idempotencyKey?: string,
): Promise<EmailResult> {
  if (!emailProviderConfigured())
    return { delivered: false, reason: "not-configured" };
  try {
    const from = process.env.EMAIL_FROM!.trim();
    if (process.env.SMTP_HOST?.trim()) {
      const host = process.env.SMTP_HOST.trim(),
        port = Number(process.env.SMTP_PORT || 587);
      if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error("SMTP configuration");
      const secure = process.env.SMTP_SECURE
        ? process.env.SMTP_SECURE === "true"
        : port === 465;
      const requireTLS = process.env.SMTP_REQUIRE_TLS !== "false" && !secure;
      if (!secure && !requireTLS && process.env.NODE_ENV === "production")
        throw new Error("SMTP requires TLS in production");
      const transport = nodemailer.createTransport({
        host,
        port,
        secure,
        requireTLS,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      try {
        const result = await transport.sendMail({
          ...message,
          from,
          ...(idempotencyKey
            ? { messageId: `<${idempotencyKey}@iskillspot.local>` }
            : {}),
        });
        if (!result.accepted?.length || result.rejected?.length)
          throw new Error("SMTP rejection");
      } finally {
        transport.close();
      }
      return { delivered: true, provider: "smtp" };
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        ...(message.text ? { text: message.text } : {}),
      }),
    });
    if (!response.ok || typeof (await response.json()).id !== "string")
      throw new Error("Provider rejection");
    return { delivered: true, provider: "resend" };
  } catch {
    return { delivered: false, reason: "failed" };
  }
}
