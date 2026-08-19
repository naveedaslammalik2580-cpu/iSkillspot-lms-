"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { setSetting, DEFAULT_SETTINGS } from "@/lib/settings";
import { logAction } from "@/lib/audit";

export async function saveSettingsAction(formData: FormData) {
  const session = await requirePermission("settings.manage");
  try {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      const value = formData.get(key);
      if (typeof value === "string") await setSetting(key, value);
    }
    await logAction({ userId: session.userId, action: "Updated settings", entity: "Setting" });
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save settings." };
  }
}
