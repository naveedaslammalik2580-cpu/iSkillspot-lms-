import { z } from "zod";
import type { SessionPayload } from "./token";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import {
  hashPassword,
  generateTempPassword,
  temporaryPasswordExpiry,
} from "./password";
import {
  emailSchema,
  usernameSchema,
  assertIdentityAvailable,
  AccountError,
} from "./identity";
import { authorizeActor, manageableTarget } from "./account-policy";
import { accountEligibleForRecovery, issueAuthToken } from "./tokens";
import { emailProviderConfigured } from "@/lib/email";
import { logAction } from "@/lib/audit";

export const adminAccountSchema = z
  .object({ username: usernameSchema, email: emailSchema })
  .strict();

export async function createAdminAccount(
  session: SessionPayload,
  input: unknown,
) {
  const data = adminAccountSchema.parse(input);
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const account = await db.$transaction(async (tx) => {
    await authorizeActor(tx, session, "admin.manage");
    await assertIdentityAvailable(tx, data.email, data.username);
    const user = await tx.user.create({
      data: {
        ...data,
        passwordHash,
        role: "ADMIN",
        status: "ACTIVE",
        mustChangePassword: true,
        passwordExpiresAt: temporaryPasswordExpiry(),
      },
    });
    await logAction(
      {
        userId: session.userId,
        action: "Created administrator",
        entity: "User",
        entityId: user.id,
      },
      tx,
    );
    return { id: user.id, username: user.username };
  });
  return { ...account, tempPassword };
}

export async function resetAccountPassword(
  session: SessionPayload,
  userId: string,
  expectedRole?: Role,
) {
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await db.$transaction(async (tx) => {
    await authorizeActor(tx, session, "account.manage");
    const target = await manageableTarget(tx, session, userId);
    if (expectedRole && target.role !== expectedRole)
      throw new AccountError("Invalid linked account role.");
    await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordExpiresAt: temporaryPasswordExpiry(),
        sessionVersion: { increment: 1 },
      },
    });
    await logAction(
      {
        userId: session.userId,
        action: "Reset account password",
        entity: "User",
        entityId: userId,
      },
      tx,
    );
  });
  return { tempPassword };
}

/**
 * Staff-initiated password recovery by emailed reset link — the
 * preferred recovery path (the temporary-password reset below remains
 * the fallback for accounts that cannot receive email). Authorization
 * is identical to the other account mutations: the actor must hold
 * account.manage and the target must be within the actor's manageable
 * roles, rechecked inside a transaction. The staff member never sees
 * a credential; the link goes only to the account's own email.
 */
export async function sendAccountResetLink(
  session: SessionPayload,
  userId: string,
  expectedRole?: Role,
): Promise<"queued" | "not-configured" | "failed"> {
  return db.$transaction(async (tx) => {
    await authorizeActor(tx, session, "account.manage");
    const target = await manageableTarget(tx, session, userId);
    if (expectedRole && target.role !== expectedRole)
      throw new AccountError("Invalid linked account role.");
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      include: { student: true, teacher: true },
    });
    if (!accountEligibleForRecovery(user))
      throw new AccountError(
        "Only eligible active accounts can receive a reset link.",
      );
    if (!emailProviderConfigured()) return "not-configured";
    if (
      await tx.authToken.findFirst({
        where: {
          userId,
          purpose: "RESET_PASSWORD",
          createdAt: { gt: new Date(Date.now() - 60000) },
        },
      })
    )
      return "failed";
    const token = await issueAuthToken(
      tx,
      user,
      "RESET_PASSWORD",
      session.userId,
    );
    return token ? "queued" : "failed";
  });
}

export async function setAccountActive(
  session: SessionPayload,
  userId: string,
  active: boolean,
  expectedRole?: Role,
) {
  if (typeof active !== "boolean")
    throw new AccountError("Invalid account status.");
  await db.$transaction(async (tx) => {
    await authorizeActor(tx, session, "account.manage");
    const target = await manageableTarget(tx, session, userId);
    if (expectedRole && target.role !== expectedRole)
      throw new AccountError("Invalid linked account role.");
    if (
      active &&
      target.student &&
      ["SUSPENDED", "DROPPED"].includes(target.student.status)
    ) {
      throw new AccountError(
        "Restore the student's academic status before activating this account.",
      );
    }
    if (
      !active &&
      target.teacher &&
      (await tx.batch.count({
        where: { teacherId: target.teacher.id, status: "ONGOING" },
      }))
    ) {
      throw new AccountError(
        "Reassign this teacher's ongoing batches before deactivation.",
      );
    }
    if (target.teacher)
      await tx.teacher.update({
        where: { id: target.teacher.id },
        data: { status: active ? "ACTIVE" : "INACTIVE" },
      });
    await tx.user.update({
      where: { id: userId },
      data: {
        status: active ? "ACTIVE" : "INACTIVE",
        sessionVersion: { increment: 1 },
      },
    });
    await logAction(
      {
        userId: session.userId,
        action: active ? "Activated account" : "Deactivated account",
        entity: "User",
        entityId: userId,
      },
      tx,
    );
  });
}
