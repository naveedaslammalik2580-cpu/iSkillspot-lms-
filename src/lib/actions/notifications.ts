"use server";

/**
 * Notification actions. The acting user always comes from the server-side
 * session (requireSession); no action accepts a user id from the client.
 * Mutations use compound { id, userId } ownership filters, so a forged id
 * for someone else's notification simply matches zero rows (no IDOR).
 */
import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { getNotificationSummary } from "@/lib/data/notifications";
import { ESSENTIAL_TYPES } from "@/lib/notifications";

export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  const session = await requireSession();
  if (!id || typeof id !== "string") return { ok: false };
  await db.notification.updateMany({
    where: { id, userId: session.userId, read: false },
    data: { read: true, readAt: new Date() },
  });
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  const session = await requireSession();
  await db.notification.updateMany({
    where: { userId: session.userId, read: false },
    data: { read: true, readAt: new Date() },
  });
  return { ok: true };
}

export type NotificationSummaryDTO = {
  unreadCount: number;
  recent: {
    id: string;
    title: string;
    message: string;
    type: string;
    read: boolean;
    createdAt: string;
    linkUrl: string | null;
  }[];
};

const preferenceSchema = z.object({
  type: z.enum(["LESSON", "ASSIGNMENT", "QUIZ", "ATTENDANCE", "ANNOUNCEMENT", "CERTIFICATE", "FEE", "SYSTEM"]),
  channel: z.enum(["inApp", "push"]),
  enabled: z.boolean(),
});

/**
 * Update one of the acting user's own notification preferences.
 * In-app delivery of essential (SYSTEM) notifications cannot be disabled.
 * Preferences apply to future notifications only; history is untouched.
 */
export async function updateNotificationPreference(
  input: z.infer<typeof preferenceSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession();
  const parsed = preferenceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid preference." };
  const { type, channel, enabled } = parsed.data;
  if (channel === "inApp" && !enabled && ESSENTIAL_TYPES.has(type)) {
    return { ok: false, error: "Account and system notifications can't be turned off." };
  }
  await db.notificationPreference.upsert({
    where: { userId_type: { userId: session.userId, type } },
    create: { userId: session.userId, type, [channel]: enabled },
    update: { [channel]: enabled },
  });
  return { ok: true };
}

/**
 * Register this browser's push subscription for the acting user.
 * The payload is fully validated; the endpoint's ownership follows the
 * session (see lib/push-subscriptions). userAgent is stored truncated
 * for the user's own device list/debugging only.
 */
export async function subscribePush(
  subscription: unknown,
  userAgent?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession();
  const { upsertPushSubscription, pushSubscriptionSchema } = await import("@/lib/push-subscriptions");
  const parsed = pushSubscriptionSchema.safeParse(subscription);
  if (!parsed.success) return { ok: false, error: "Invalid subscription." };
  return upsertPushSubscription(session.userId, parsed.data, userAgent ?? null);
}

/** Remove this browser's subscription if it belongs to the acting user. */
export async function unsubscribePush(endpoint: string): Promise<{ ok: boolean }> {
  const session = await requireSession();
  if (!endpoint || typeof endpoint !== "string") return { ok: false };
  const { removePushSubscription } = await import("@/lib/push-subscriptions");
  return { ok: await removePushSubscription(session.userId, endpoint) };
}

/**
 * Ownership check used by the client on load (shared-device safety):
 * if this browser's live subscription endpoint is not registered to the
 * current user, the client unsubscribes the browser locally, which kills
 * the endpoint so the previous user's rows die on their next send.
 */
export async function checkPushEndpoint(endpoint: string): Promise<{ mine: boolean }> {
  const session = await requireSession();
  if (!endpoint || typeof endpoint !== "string") return { mine: false };
  const { isEndpointMine } = await import("@/lib/push-subscriptions");
  return { mine: await isEndpointMine(session.userId, endpoint) };
}

/** Polled by the bell component (pauses while the tab is hidden). */
export async function fetchNotificationSummary(): Promise<NotificationSummaryDTO> {
  const session = await requireSession();
  const { unreadCount, recent } = await getNotificationSummary(session.userId);
  return {
    unreadCount,
    recent: recent.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
      linkUrl: n.linkUrl,
    })),
  };
}
