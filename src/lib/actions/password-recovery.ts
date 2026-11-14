"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { emailSchema } from "@/lib/auth/identity";
import { strongPassword } from "@/lib/auth/password";
import { rateLimited } from "@/lib/auth/throttle";
import {
  accountEligibleForRecovery,
  consumePasswordResetToken,
  deliverPasswordResetEmail,
  hashResetToken,
  issuePasswordResetToken,
} from "@/lib/auth/password-reset";
import { sendAccountResetLink } from "@/lib/auth/accounts";
import { getSession } from "@/lib/auth/session";
import { logAction } from "@/lib/audit";

export type RecoveryState = { error?: string; ok?: boolean };

const requestSchema = z.object({ email: emailSchema });

/**
 * Self-service recovery request. The response is IDENTICAL whether the
 * email is unknown, belongs to an ineligible account, is rate-limited,
 * or a reset email was actually sent — account enumeration must not be
 * possible through this endpoint.
 */
export async function requestPasswordResetAction(
  _prev: RecoveryState,
  formData: FormData
): Promise<RecoveryState> {
  const parsed = requestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Enter a valid email address." };
  }
  const email = parsed.data.email;

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (await rateLimited(`password-reset-request:${email}`)) return { ok: true };
  if (ip && (await rateLimited(`password-reset-request-ip:${ip}`))) return { ok: true };

  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    include: { teacher: { select: { status: true } }, student: { select: { status: true } } },
  });

  if (user && accountEligibleForRecovery(user)) {
    const issued = await issuePasswordResetToken(user.id, null);
    if (issued) {
      const delivery = await deliverPasswordResetEmail(user, issued.token);
      try {
        await logAction({
          userId: user.id,
          action: delivery.delivered
            ? "Password reset email requested"
            : "Password reset requested (email delivery unavailable)",
          entity: "User",
          entityId: user.id,
        });
      } catch { /* auditing must not change the response */ }
    }
  }
  return { ok: true };
}

const resetSchema = z
  .object({
    token: z.string().min(1).max(200),
    newPassword: strongPassword,
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const GENERIC_RESET_ERROR = "This reset link is invalid or has expired. Please request a new one.";

export async function resetPasswordAction(
  _prev: RecoveryState,
  formData: FormData
): Promise<RecoveryState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    // Password-policy problems are safe to explain; anything about the
    // token itself stays generic.
    const issue = parsed.error.issues[0];
    if (issue && issue.path[0] !== "token") return { error: issue.message };
    return { error: GENERIC_RESET_ERROR };
  }
  if (await rateLimited(`password-reset-consume:${hashResetToken(parsed.data.token)}`)) {
    return { error: "Too many attempts. Please request a new reset link." };
  }
  const result = await consumePasswordResetToken(parsed.data.token, parsed.data.newPassword);
  if (!result.ok) return { error: GENERIC_RESET_ERROR };
  return { ok: true };
}

export type StaffResetLinkResult = { ok: true } | { ok: false; error: string };

/** Staff-initiated reset link for an account managed via /admin/accounts. */
export async function sendResetLinkAction(userId: string): Promise<StaffResetLinkResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Your session has expired. Sign in again." };
  try {
    const result = await sendAccountResetLink(session, userId);
    if (result === "not-configured") {
      return {
        ok: false,
        error:
          "Email is not configured on the server, so no link was sent. Use “Reset password” to issue a temporary password instead.",
      };
    }
    if (result === "failed") {
      return { ok: false, error: "The reset email could not be sent. Please try again." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Unable to send a reset link for this account." };
  }
}
