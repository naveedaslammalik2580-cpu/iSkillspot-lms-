/**
 * Notification read model. Every query is scoped to a single user id that
 * the caller derived from the server-side session — there is deliberately
 * no way to read another user's notifications through this module.
 */
import type { NotificationType } from "@prisma/client";
import { db } from "@/lib/db";

export type NotificationRow = {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
  linkUrl: string | null;
};

const select = {
  id: true,
  title: true,
  message: true,
  type: true,
  read: true,
  readAt: true,
  createdAt: true,
  linkUrl: true,
} as const;

export type PreferenceRow = { type: NotificationType; inApp: boolean; push: boolean };

export const NOTIFICATION_TYPES: NotificationType[] = [
  "LESSON",
  "ASSIGNMENT",
  "QUIZ",
  "ATTENDANCE",
  "ANNOUNCEMENT",
  "CERTIFICATE",
  "FEE",
  "SYSTEM",
];

/**
 * Effective preferences for a user: every type, with stored rows overlaid
 * on the defaults (both channels on). Users with no rows get all defaults.
 */
export async function getPreferencesForUser(userId: string): Promise<PreferenceRow[]> {
  const stored = await db.notificationPreference.findMany({ where: { userId } });
  const byType = new Map(stored.map((p) => [p.type, p]));
  return NOTIFICATION_TYPES.map((type) => {
    const p = byType.get(type);
    return { type, inApp: p?.inApp ?? true, push: p?.push ?? true };
  });
}

/** Unread count for the bell badge. */
export async function getUnreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, read: false } });
}

/** Most recent notifications (dropdown), newest first. */
export async function getRecentNotifications(userId: string, limit = 8): Promise<NotificationRow[]> {
  return db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 20),
    select,
  });
}

/** Bell payload in one round trip: unread count + recent list. */
export async function getNotificationSummary(userId: string): Promise<{ unreadCount: number; recent: NotificationRow[] }> {
  const [unreadCount, recent] = await Promise.all([getUnreadCount(userId), getRecentNotifications(userId, 8)]);
  return { unreadCount, recent };
}

export type NotificationPage = {
  rows: NotificationRow[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** Paginated history for the notifications pages. */
export async function getNotificationsPage(
  userId: string,
  opts: { page?: number; pageSize?: number; unreadOnly?: boolean } = {}
): Promise<NotificationPage> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 50);
  const where = { userId, ...(opts.unreadOnly ? { read: false } : {}) };
  const total = await db.notification.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(opts.page ?? 1, 1), totalPages);
  const [rows, unreadCount] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select,
    }),
    getUnreadCount(userId),
  ]);
  return { rows, total, unreadCount, page, pageSize, totalPages };
}
