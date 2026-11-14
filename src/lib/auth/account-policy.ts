import type { Prisma, Role } from "@prisma/client";
import type { SessionPayload } from "./token";
import { can, type Permission } from "./permissions";
import { AccountError } from "./identity";

export function manageableRoles(role: Role): Role[] {
  return role === "SUPER_ADMIN" ? ["ADMIN", "TEACHER", "STUDENT"] : role === "ADMIN" ? ["TEACHER", "STUDENT"] : [];
}

// Lock actor before target in all mutations. Recheck authorization inside the
// transaction so a concurrent reset/deactivation/role change fails closed.
export async function authorizeActor(tx: Prisma.TransactionClient, session: SessionPayload, permission: Permission) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${session.userId} FOR UPDATE`;
  const actor = await tx.user.findUnique({ where: { id: session.userId }, select: {
    id: true, status: true, role: true, sessionVersion: true, mustChangePassword: true,
  } });
  if (!actor || actor.status !== "ACTIVE" || actor.role !== session.role ||
      actor.sessionVersion !== session.sessionVersion || actor.mustChangePassword || !can(actor.role, permission)) {
    throw new AccountError("Account management is not permitted.");
  }
  return actor;
}

export async function manageableTarget(tx: Prisma.TransactionClient, session: SessionPayload, userId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
  const target = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true, status: true,
    teacher: { select: { id: true, status: true } }, student: { select: { id: true, status: true } } } });
  if (!target || userId === session.userId || !manageableRoles(session.role).includes(target.role)) {
    throw new AccountError("Account management is not permitted.");
  }
  if ((target.role === "TEACHER" && !target.teacher) || (target.role === "STUDENT" && !target.student)) {
    throw new AccountError("The account needs its linked profile repaired by an operator.");
  }
  return target;
}
