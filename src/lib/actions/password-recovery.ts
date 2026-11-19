"use server";
import { z } from "zod";
import { strongPassword } from "@/lib/auth/password";
import { requirePermission } from "@/lib/auth/guards";
import { sendAccountResetLink } from "@/lib/auth/accounts";
import { consumeAuthToken } from "@/lib/auth/tokens";
import { publicLimit } from "@/lib/auth/public-limit";
export type RecoveryState = { error?: string; ok?: boolean; message?: string };
export async function resetPasswordAction(
  _: RecoveryState,
  form: FormData,
): Promise<RecoveryState> {
  const parsed = z
    .object({
      token: z.string().min(1).max(200),
      password: strongPassword,
      confirmPassword: z.string(),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: "Passwords do not match",
      path: ["confirmPassword"],
    })
    .safeParse({
      token: form.get("token"),
      password: form.get("newPassword") ?? form.get("password"),
      confirmPassword: form.get("confirmPassword"),
    });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message || "Invalid request" };
  if (await publicLimit("reset"))
    return { error: "Too many attempts. Try again in 15 minutes." };
  try {
    await consumeAuthToken(
      parsed.data.token,
      "RESET_PASSWORD",
      parsed.data.password,
    );
    return { ok: true };
  } catch {
    return {
      error:
        "This reset link is invalid or has expired. Please request a new one.",
    };
  }
}
export type StaffResetLinkResult = { ok: true } | { ok: false; error: string };
export async function sendResetLinkAction(
  userId: string,
): Promise<StaffResetLinkResult> {
  // Explicit action-layer authorization (defence in depth): the downstream
  // service enforces the same permission plus the manageable-target
  // hierarchy, but the requirement is declared here like every other
  // guarded action. Redirects to /login or /forbidden when not permitted.
  const session = await requirePermission("account.manage");
  try {
    const result = await sendAccountResetLink(session, userId);
    if (result === "not-configured")
      return {
        ok: false,
        error:
          "Email is not configured. Use the authorized temporary-password reset instead.",
      };
    if (result === "failed")
      return {
        ok: false,
        error: "Please wait before requesting another reset link.",
      };
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Unable to queue a reset link for this account.",
    };
  }
}
