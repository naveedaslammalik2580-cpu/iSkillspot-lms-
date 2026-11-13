"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPassword, hashPassword, strongPassword } from "@/lib/auth/password";
import { createSession, destroySession, getSession } from "@/lib/auth/session";
import { homePathFor } from "@/lib/auth/permissions";
import { logAction } from "@/lib/audit";
import { rateLimited } from "@/lib/auth/throttle";
import { randomBytes } from "node:crypto";

let dummyHash: Promise<string> | undefined;

const loginSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(1, "Enter your username, email, or student ID").max(254),
  password: z.string().min(1, "Enter your password").max(1024),
  remember: z.boolean().optional(),
});

export type ActionState = { error?: string; ok?: boolean };

export async function loginAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
    remember: formData.get("remember") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const { identifier, password, remember } = parsed.data;

  if (await rateLimited(identifier)) {
    return { error: "Too many attempts. Please try again in a few minutes." };
  }

  // Identifier may be username, email, or student ID.
  const matches = await db.user.findMany({
    where: {
      OR: [
        { username: { equals: identifier, mode: "insensitive" } },
        { email: { equals: identifier, mode: "insensitive" } },
        { student: { studentId: { equals: identifier, mode: "insensitive" } } },
      ],
    },
    include: { teacher: { select: { status: true } }, student: { select: { status: true } } },
    take: 2,
  });

  const genericError = "Invalid credentials.";
  const user = matches.length === 1 ? matches[0] : null;
  dummyHash ??= hashPassword(randomBytes(24).toString("base64url"));
  const valid = await verifyPassword(password, user?.passwordHash ?? await dummyHash);
  if (!user || !valid || user.status !== "ACTIVE" ||
      (user.role === "TEACHER" && (!user.teacher || user.teacher.status !== "ACTIVE")) ||
      (user.role === "STUDENT" && (!user.student || ["SUSPENDED", "DROPPED"].includes(user.student.status))) ||
      (user.mustChangePassword && user.passwordExpiresAt && user.passwordExpiresAt.getTime() <= Date.now())) {
    return { error: genericError };
  }

  const current = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
    const fresh = await tx.user.findUnique({ where: { id: user.id } });
    if (!fresh || fresh.status !== "ACTIVE" || fresh.role !== user.role ||
        fresh.sessionVersion !== user.sessionVersion || fresh.passwordHash !== user.passwordHash) return null;
    await tx.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    await logAction({ userId: user.id, action: "User logged in", entity: "User", entityId: user.id }, tx);
    return fresh;
  });
  if (!current) return { error: genericError };

  await createSession(
    {
      userId: user.id,
      role: user.role,
      username: user.username,
      mustChangePassword: user.mustChangePassword,
      sessionVersion: current.sessionVersion,
    },
    Boolean(remember)
  );

  if (user.mustChangePassword) {
    redirect(user.role === "STUDENT" ? "/student/change-password" : "/change-password");
  }
  redirect(homePathFor(user.role));
}

export async function logoutAction(): Promise<void> {
  try {
    const session = await getSession();
    if (session) await logAction({ userId: session.userId, action: "User logged out", entity: "User", entityId: session.userId });
  } finally { await destroySession(); }
  redirect("/login");
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: strongPassword,
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (await rateLimited(`password-change:${session.userId}`)) return { error: "Too many attempts. Please try again in a few minutes." };

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== "ACTIVE" || user.sessionVersion !== session.sessionVersion || user.role !== session.role) redirect("/login");

  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return { error: "Current password is incorrect." };
  if (await verifyPassword(parsed.data.newPassword, user.passwordHash)) return { error: "Choose a different new password." };

  const newHash = await hashPassword(parsed.data.newPassword);
  const updated = await db.$transaction(async tx => {
    const result = await tx.user.updateMany({
      where: { id: user.id, sessionVersion: session.sessionVersion, role: session.role, status: "ACTIVE" },
      data: { passwordHash: newHash, mustChangePassword: false, passwordExpiresAt: null, sessionVersion: { increment: 1 } },
    });
    if (result.count !== 1) return null;
    await logAction({ userId: user.id, action: "Password changed", entity: "User", entityId: user.id }, tx);
    return tx.user.findUnique({ where: { id: user.id } });
  });
  if (!updated) { await destroySession(); redirect("/login"); }

  await createSession(
    { userId: user.id, role: user.role, username: user.username, mustChangePassword: false, sessionVersion: updated.sessionVersion },
    false
  );

  redirect(homePathFor(user.role));
}
