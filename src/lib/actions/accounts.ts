"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { createAdminAccount, resetAccountPassword, setAccountActive } from "@/lib/auth/accounts";
import { AccountError } from "@/lib/auth/identity";

export type AccountResult = { ok: true; tempPassword?: string; username?: string } | { ok: false; error: string };
function safeError(error: unknown): AccountResult {
  return { ok: false, error: error instanceof AccountError ? error.message : "Unable to update account. Check the details and try again." };
}
export async function createAdminAction(input: { username: string; email: string }): Promise<AccountResult> {
  const session = await requirePermission("admin.manage");
  try {
    const result = await createAdminAccount(session, input);
    revalidatePath("/admin/accounts");
    return { ok: true, username: result.username, tempPassword: result.tempPassword };
  } catch (error) { return safeError(error); }
}
export async function resetAccountAction(userId: string): Promise<AccountResult> {
  const session = await requirePermission("account.manage");
  if (typeof userId !== "string" || !userId || userId.length > 128) return { ok: false, error: "Invalid account." };
  try {
    const result = await resetAccountPassword(session, userId);
    revalidatePath("/admin/accounts");
    return { ok: true, tempPassword: result.tempPassword };
  } catch (error) { return safeError(error); }
}
export async function setAccountActiveAction(userId: string, active: boolean): Promise<AccountResult> {
  const session = await requirePermission("account.manage");
  if (typeof userId !== "string" || !userId || userId.length > 128) return { ok: false, error: "Invalid account." };
  try {
    await setAccountActive(session, userId, active);
    revalidatePath("/admin/accounts");
    revalidatePath("/admin/teachers");
    revalidatePath("/admin/students");
    return { ok: true };
  } catch (error) { return safeError(error); }
}
