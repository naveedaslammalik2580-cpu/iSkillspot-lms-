import { z } from "zod";
import type { SessionPayload } from "./token";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword, generateTempPassword, temporaryPasswordExpiry } from "./password";
import { emailSchema, usernameSchema, assertIdentityAvailable, AccountError } from "./identity";
import { authorizeActor, manageableTarget } from "./account-policy";
import { logAction } from "@/lib/audit";

export const adminAccountSchema = z.object({ username: usernameSchema, email: emailSchema }).strict();

export async function createAdminAccount(session: SessionPayload, input: unknown) {
  const data = adminAccountSchema.parse(input);
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const account = await db.$transaction(async tx => {
    await authorizeActor(tx, session, "admin.manage");
    await assertIdentityAvailable(tx, data.email, data.username);
    const user = await tx.user.create({ data: { ...data, passwordHash, role: "ADMIN", status: "ACTIVE",
      mustChangePassword: true, passwordExpiresAt: temporaryPasswordExpiry() } });
    await logAction({ userId: session.userId, action: "Created administrator", entity: "User", entityId: user.id }, tx);
    return { id: user.id, username: user.username };
  });
  return { ...account, tempPassword };
}

export async function resetAccountPassword(session: SessionPayload, userId: string, expectedRole?: Role) {
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await db.$transaction(async tx => {
    await authorizeActor(tx, session, "account.manage");
    const target = await manageableTarget(tx, session, userId);
    if (expectedRole && target.role !== expectedRole) throw new AccountError("Invalid linked account role.");
    await tx.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: true,
      passwordExpiresAt: temporaryPasswordExpiry(), sessionVersion: { increment: 1 } } });
    await logAction({ userId: session.userId, action: "Reset account password", entity: "User", entityId: userId }, tx);
  });
  return { tempPassword };
}

export async function setAccountActive(session: SessionPayload, userId: string, active: boolean, expectedRole?: Role) {
  if (typeof active !== "boolean") throw new AccountError("Invalid account status.");
  await db.$transaction(async tx => {
    await authorizeActor(tx, session, "account.manage");
    const target = await manageableTarget(tx, session, userId);
    if (expectedRole && target.role !== expectedRole) throw new AccountError("Invalid linked account role.");
    if (active && target.student && ["SUSPENDED", "DROPPED"].includes(target.student.status)) {
      throw new AccountError("Restore the student's academic status before activating this account.");
    }
    if (!active && target.teacher && await tx.batch.count({ where: { teacherId: target.teacher.id, status: "ONGOING" } })) {
      throw new AccountError("Reassign this teacher's ongoing batches before deactivation.");
    }
    if (target.teacher) await tx.teacher.update({ where: { id: target.teacher.id }, data: { status: active ? "ACTIVE" : "INACTIVE" } });
    await tx.user.update({ where: { id: userId }, data: { status: active ? "ACTIVE" : "INACTIVE", sessionVersion: { increment: 1 } } });
    await logAction({ userId: session.userId, action: active ? "Activated account" : "Deactivated account", entity: "User", entityId: userId }, tx);
  });
}
