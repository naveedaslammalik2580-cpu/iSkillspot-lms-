import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSecret } from "@/lib/auth/token";
import { sendEmail } from "@/lib/email-transport";
export { sendEmail, emailProviderConfigured } from "@/lib/email-transport";
export type { EmailResult, EmailMessage } from "@/lib/email-transport";

export function portalUrl(path: string): string {
  const configured = process.env.LMS_PUBLIC_URL || process.env.APP_URL;
  if (
    process.env.LMS_PUBLIC_URL &&
    process.env.APP_URL &&
    new URL(process.env.LMS_PUBLIC_URL).origin !==
      new URL(process.env.APP_URL).origin
  )
    throw new Error("LMS_PUBLIC_URL and APP_URL must agree");
  const base = new URL(configured || "http://localhost:3000");
  if (
    process.env.NODE_ENV === "production" &&
    (!configured || base.protocol !== "https:")
  ) {
    throw new Error("Configure the official HTTPS LMS_PUBLIC_URL");
  }
  return new URL(path, base.origin).href;
}
const key = () =>
  createHash("sha256").update(getSecret()).update("email-outbox-v1").digest();
export function encryptEmail(body: string): string {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((v) => v.toString("base64url"))
    .join(".");
}
export function decryptEmail(body: string): string {
  const [iv, tag, data] = body
    .split(".")
    .map((v) => Buffer.from(v, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", key(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
}
export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function emailTemplate(
  name: string,
  title: string,
  message: string,
  button = "Sign In to Student Portal",
  path = "/login",
) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6fa;font:16px Arial,sans-serif;color:#172033"><main style="max-width:560px;margin:24px auto;padding:28px;background:white;border-radius:12px"><p style="color:#2563eb;font-weight:bold">iSkillSpot · Learning Management System</p><h1 style="font-size:24px">${escapeHtml(title)}</h1><p>Hello ${escapeHtml(name)},</p><p style="line-height:1.7;white-space:pre-line">${escapeHtml(message)}</p><a style="display:inline-block;padding:14px 20px;background:#2563eb;color:white;text-decoration:none;border-radius:6px" href="${escapeHtml(portalUrl(path))}">${escapeHtml(button)}</a><p style="font-size:12px;color:#667085;margin-top:28px">iSkillSpot Student Services. Never share your password. If you did not request this email, contact the institute.</p></main></body></html>`;
}
export async function queueEmail(
  tx: Prisma.TransactionClient,
  input: {
    dedupeKey: string;
    recipient: string;
    subject: string;
    html: string;
  },
) {
  const { html, ...data } = input;
  return tx.emailOutbox.upsert({
    where: { dedupeKey: data.dedupeKey },
    update: {},
    create: { ...data, encryptedBody: encryptEmail(html) },
  });
}

// Durable queue: leased atomically across workers. No provider responses or token URLs enter logs.
// Provider idempotency protects an uncertain response/retry within its retention window.
export async function deliverEmails(limit = 10) {
  let sent = 0,
    failed = 0;
  for (let i = 0; i < limit; i++) {
    const rows = await db.$queryRaw<{ id: string }[]>`
      UPDATE "EmailOutbox" SET status='SENDING', "availableAt"=timezone('UTC', CURRENT_TIMESTAMP)+INTERVAL '2 minutes', attempts=attempts+1
      WHERE id=(SELECT id FROM "EmailOutbox" WHERE status IN ('PENDING','FAILED','SENDING') AND "availableAt" <= timezone('UTC', CURRENT_TIMESTAMP) AND attempts < 8 ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`;
    if (!rows[0]) break;
    const row = await db.emailOutbox.findUniqueOrThrow({
      where: { id: rows[0].id },
    });
    try {
      if (row.dedupeKey.startsWith("token:")) {
        const token = await db.authToken.findUnique({
          where: { id: row.dedupeKey.slice(6) },
          include: { user: { select: { status: true, sessionVersion: true } } },
        });
        if (
          !token ||
          token.usedAt ||
          token.expiresAt.getTime() <= Date.now() ||
          token.version !== token.user.sessionVersion ||
          token.user.status !== "ACTIVE"
        ) {
          await db.emailOutbox.update({
            where: { id: row.id },
            data: {
              status: "CANCELED",
              encryptedBody: "",
              lastError: "Link is no longer valid.",
            },
          });
          continue;
        }
      }
      const result = await sendEmail(
        {
          to: row.recipient,
          subject: row.subject,
          html: decryptEmail(row.encryptedBody),
        },
        row.id,
      );
      if (!result.delivered) throw new Error("Delivery unavailable");
      await db.emailOutbox.update({
        where: { id: row.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          encryptedBody: "",
          lastError: null,
        },
      });
      sent++;
    } catch {
      await db.emailOutbox.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          lastError:
            "Delivery unavailable. Check provider configuration and retry.",
          availableAt: new Date(
            Date.now() + Math.min(row.attempts * 60000, 3600000),
          ),
        },
      });
      failed++;
    }
  }
  return { sent, failed };
}
