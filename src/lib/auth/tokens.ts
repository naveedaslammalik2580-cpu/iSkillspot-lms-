import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AccountError } from "./identity";
import { hashPassword, strongPassword } from "./password";
import { emailTemplate, queueEmail } from "@/lib/email";
import { logAction } from "@/lib/audit";

export type TokenPurpose = "VERIFY_EMAIL" | "RESET_PASSWORD";
export const hashAuthToken = (raw: string) =>
  createHash("sha256").update(raw).digest("hex");
export class TokenError extends AccountError {
  constructor(public reason: "invalid" | "expired" | "used" | "ineligible") {
    super("This link is invalid or has expired. Please request a new one.");
  }
}
export function accountEligibleForRecovery(user: {
  status: string;
  role: string;
  student: { status: string } | null;
  teacher: { status: string } | null;
}) {
  return (
    user.status === "ACTIVE" &&
    (user.role !== "STUDENT" ||
      (!!user.student &&
        !["SUSPENDED", "DROPPED"].includes(user.student.status))) &&
    (user.role !== "TEACHER" || user.teacher?.status === "ACTIVE")
  );
}

// The only issuing path for public and staff recovery and email verification.
// Serialize against account changes before checking issuance caps.
export async function issueAuthToken(
  tx: Prisma.TransactionClient,
  principal: { id: string },
  purpose: TokenPurpose,
  requestedById: string | null = null,
) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${principal.id} FOR UPDATE`;
  const user = await tx.user.findUniqueOrThrow({
    where: { id: principal.id },
    include: { student: true, teacher: true },
  });
  if (
    !accountEligibleForRecovery(user) ||
    (purpose === "VERIFY_EMAIL" &&
      (user.role !== "STUDENT" || user.emailVerifiedAt))
  )
    return null;
  const count = await tx.authToken.count({
    where: {
      userId: user.id,
      purpose,
      createdAt: { gte: new Date(Date.now() - 3600000) },
    },
  });
  if (count >= 5) return null;
  const prior = await tx.authToken.findMany({
    where: { userId: user.id, purpose, usedAt: null },
    select: { id: true },
  });
  await tx.authToken.updateMany({
    where: { userId: user.id, purpose, usedAt: null },
    data: { usedAt: new Date() },
  });
  await tx.emailOutbox.updateMany({
    where: {
      dedupeKey: { in: prior.map((t) => `token:${t.id}`) },
      status: { in: ["PENDING", "FAILED"] },
    },
    data: {
      status: "CANCELED",
      encryptedBody: "",
      lastError: "Superseded by a newer link.",
    },
  });
  const raw = randomBytes(32).toString("base64url"),
    verify = purpose === "VERIFY_EMAIL";
  const token = await tx.authToken.create({
    data: {
      userId: user.id,
      purpose,
      digest: hashAuthToken(raw),
      version: user.sessionVersion,
      requestedById,
      expiresAt: new Date(Date.now() + (verify ? 60 : 30) * 60000),
    },
  });
  await queueEmail(tx, {
    dedupeKey: `token:${token.id}`,
    recipient: user.email,
    subject: verify
      ? "Verify your iSkillSpot email"
      : "Reset your iSkillSpot password",
    html: emailTemplate(
      user.student?.fullName || user.teacher?.fullName || user.username,
      verify ? "Verify your email" : "Password recovery",
      `Use this single-use link within ${verify ? 60 : 30} minutes. If you did not request it, you can ignore this email.`,
      verify ? "Verify Email" : "Reset Password",
      `/${verify ? "verify-email" : "reset-password"}?token=${raw}`,
    ),
  });
  await logAction(
    {
      userId: requestedById || user.id,
      action: verify
        ? "Verification link queued"
        : "Password recovery link queued",
      entity: "User",
      entityId: user.id,
    },
    tx,
  );
  return { ...token, raw };
}

export async function requestAuthEmail(email: string, purpose: TokenPurpose) {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    if (!user) return;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
    if (
      await tx.authToken.findFirst({
        where: {
          userId: user.id,
          purpose,
          createdAt: { gt: new Date(Date.now() - 60000) },
        },
      })
    )
      return;
    await issueAuthToken(tx, user, purpose);
  });
}

export async function verifyAuthToken(raw: string, purpose: TokenPurpose) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const row = await db.authToken.findUnique({
    where: { digest: hashAuthToken(raw) },
    include: { user: { include: { student: true, teacher: true } } },
  });
  if (
    !row ||
    row.purpose !== purpose ||
    row.usedAt ||
    row.expiresAt.getTime() <= Date.now() ||
    row.version !== row.user.sessionVersion ||
    !accountEligibleForRecovery(row.user)
  )
    return null;
  return { userId: row.userId };
}

export async function consumeAuthToken(
  raw: string,
  purpose: TokenPurpose,
  password?: string,
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) throw new TokenError("invalid");
  const passwordHash =
    purpose === "RESET_PASSWORD"
      ? await hashPassword(strongPassword.parse(password))
      : undefined;
  return db.$transaction(async (tx) => {
    const row = await tx.authToken.findUnique({
      where: { digest: hashAuthToken(raw) },
    });
    if (!row || row.purpose !== purpose) throw new TokenError("invalid");
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${row.userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: row.userId },
      include: { student: true, teacher: true },
    });
    if (!accountEligibleForRecovery(user)) throw new TokenError("ineligible");
    if (row.usedAt) throw new TokenError("used");
    if (row.expiresAt.getTime() <= Date.now()) throw new TokenError("expired");
    if (row.version !== user.sessionVersion) throw new TokenError("invalid");
    const used = await tx.authToken.updateMany({
      where: {
        id: row.id,
        usedAt: null,
        version: user.sessionVersion,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });
    if (used.count !== 1) throw new TokenError("used");
    const updated = await tx.user.update({
      where: { id: user.id },
      data: passwordHash
        ? {
            passwordHash,
            sessionVersion: { increment: 1 },
            mustChangePassword: false,
            passwordExpiresAt: null,
          }
        : { emailVerifiedAt: new Date() },
    });
    if (passwordHash)
      await tx.authToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
    await logAction(
      {
        userId: user.id,
        action: passwordHash
          ? row.requestedById
            ? "Password reset via staff-sent link"
            : "Password recovered"
          : "Email verified",
        entity: "User",
        entityId: user.id,
      },
      tx,
    );
    return updated;
  });
}
