import { db } from "@/lib/db";
import { headers } from "next/headers";

export async function logAction(params: {
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  let ip: string | undefined;
  try {
    const h = await headers();
    ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      undefined;
  } catch {
    ip = undefined;
  }

  await db.auditLog.create({
    data: {
      userId: params.userId ?? undefined,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      ipAddress: ip,
      metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
    },
  });
}
