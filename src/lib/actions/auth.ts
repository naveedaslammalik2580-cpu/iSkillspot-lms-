"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { createSession, destroySession, getSession } from "@/lib/auth/session";
import { homePathFor } from "@/lib/auth/permissions";
import { logAction } from "@/lib/audit";

// --- Simple in-memory rate limiter for auth (per-identifier) ---
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW = 15 * 60 * 1000; // 15 min
const MAX_ATTEMPTS = 8;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.first > WINDOW) {
    attempts.set(key, { count: 1, first: now });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_ATTEMPTS;
}

const loginSchema = z.object({
  identifier: z.string().min(1, "Enter your username, email, or student ID"),
  password: z.string().min(1, "Enter your password"),
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

  if (rateLimited(identifier.toLowerCase())) {
    return { error: "Too many attempts. Please try again in a few minutes." };
  }

  // Identifier may be username, email, or student ID.
  const user = await db.user.findFirst({
    where: {
      OR: [
        { username: identifier },
        { email: identifier },
        { student: { studentId: identifier } },
      ],
    },
  });

  const genericError = "Invalid credentials.";
  if (!user) return { error: genericError };
  if (user.status !== "ACTIVE") {
    return { error: "Invalid credentials." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await logAction({ userId: user.id, action: "Login failed", entity: "User", entityId: user.id });
    return { error: genericError };
  }

  await db.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  await createSession(
    {
      userId: user.id,
      role: user.role,
      username: user.username,
      mustChangePassword: user.mustChangePassword,
    },
    Boolean(remember)
  );

  await logAction({ userId: user.id, action: "User logged in", entity: "User", entityId: user.id });

  if (user.mustChangePassword) {
    redirect(user.role === "STUDENT" ? "/student/change-password" : "/change-password");
  }
  redirect(homePathFor(user.role));
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    await logAction({ userId: session.userId, action: "User logged out", entity: "User", entityId: session.userId });
  }
  await destroySession();
  redirect("/login");
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
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

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) redirect("/login");

  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return { error: "Current password is incorrect." };

  const newHash = await hashPassword(parsed.data.newPassword);
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash, mustChangePassword: false },
  });

  await createSession(
    { userId: user.id, role: user.role, username: user.username, mustChangePassword: false },
    false
  );

  await logAction({ userId: user.id, action: "Password changed", entity: "User", entityId: user.id });

  redirect(homePathFor(user.role));
}
