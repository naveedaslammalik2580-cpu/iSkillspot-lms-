import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { hashPassword } from "./password";
import { logAction } from "@/lib/audit";
import { sendEmail, passwordResetEmail, type EmailResult } from "@/lib/email";
import { getSetting } from "@/lib/settings";

/**
 * Password recovery tokens.
 *
 * - 256-bit random tokens; only their SHA-256 hash is stored.
 * - 30-minute expiry, single use. Issuing a new token supersedes every
 *   previous unused token for the account.
 * - At most 5 tokens are issued per account per hour (email-bombing
 *   guard) on top of the request rate limits in the actions.
 * - A successful reset bumps sessionVersion, which revokes every
 *   existing session through the normal session validation.
 */
export const RESET_TOKEN_TTL_MINUTES = 30;
const MAX_TOKENS_PER_HOUR = 5;

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Mirrors the login eligibility rules: an account that could not sign
 * in (inactive user, inactive teacher profile, suspended/dropped
 * student profile) must not gain anything through recovery either.
 */
export function accountEligibleForRecovery(user: {
  status: string;
  role: string;
  teacher: { status: string } | null;
  student: { status: string } | null;
}): boolean {
  if (user.status !== "ACTIVE") return false;
  if (user.role === "TEACHER" && (!user.teacher || user.teacher.status !== "ACTIVE")) return false;
  if (user.role === "STUDENT" && (!user.student || ["SUSPENDED", "DROPPED"].includes(user.student.status))) return false;
  return true;
}

export async function issuePasswordResetToken(
  userId: string,
  requestedById: string | null
): Promise<{ token: string; expiresAt: Date } | null> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await db.passwordResetToken.count({
    where: { userId, createdAt: { gte: since } },
  });
  if (recent >= MAX_TOKENS_PER_HOUR) return null;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  await db.$transaction(async (tx) => {
    // Supersede every still-unused token for this account.
    await tx.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.passwordResetToken.create({
      data: { userId, tokenHash: hashResetToken(token), expiresAt, requestedById },
    });
  });
  return { token, expiresAt };
}

/** Builds the emailed link and sends it. The plaintext token leaves the server only inside this email. */
export async function deliverPasswordResetEmail(
  user: { email: string },
  token: string
): Promise<EmailResult> {
  const configured = process.env.APP_URL?.trim().replace(/\/$/, "");
  let baseUrl = configured;
  if (!baseUrl) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    baseUrl = `${proto}://${host}`;
  }
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const instituteName = await getSetting("instituteName", "iSkillSpot");
  return sendEmail({
    to: user.email,
    ...passwordResetEmail({ instituteName, resetUrl, expiresMinutes: RESET_TOKEN_TTL_MINUTES }),
  });
}

/** Read-only validity check (used to render the reset form state). Never consumes. */
export async function verifyPasswordResetToken(
  token: string
): Promise<{ userId: string } | null> {
  if (!token || token.length > 200) return null;
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    select: { userId: true, usedAt: true, expiresAt: true },
  });
  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) return null;
  return { userId: row.userId };
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "expired" | "used" | "ineligible" };

export async function consumePasswordResetToken(
  token: string,
  newPassword: string
): Promise<ConsumeResult> {
  if (!token || token.length > 200) return { ok: false, reason: "invalid" };
  const tokenHash = hashResetToken(token);
  const newHash = await hashPassword(newPassword);

  return db.$transaction(async (tx) => {
    const row = await tx.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, usedAt: true, expiresAt: true, requestedById: true },
    });
    if (!row) return { ok: false, reason: "invalid" } as const;
    if (row.usedAt) return { ok: false, reason: "used" } as const;
    if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" } as const;

    // Claim the token first with a guarded update: a concurrent replay
    // of the same link loses the race and changes nothing.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) return { ok: false, reason: "used" } as const;

    const user = await tx.user.findUnique({
      where: { id: row.userId },
      include: { teacher: { select: { status: true } }, student: { select: { status: true } } },
    });
    if (!user || !accountEligibleForRecovery(user)) {
      return { ok: false, reason: "ineligible" } as const;
    }

    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
        passwordExpiresAt: null,
        sessionVersion: { increment: 1 }, // revokes all existing sessions
      },
    });
    // Any other outstanding tokens for the account die with this reset.
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await logAction(
      {
        userId: user.id,
        action: row.requestedById ? "Password reset via staff-sent link" : "Password reset via email link",
        entity: "User",
        entityId: user.id,
      },
      tx
    );
    return { ok: true, userId: user.id } as const;
  });
}
