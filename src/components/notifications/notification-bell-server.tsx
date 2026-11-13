import { getNotificationSummary } from "@/lib/data/notifications";
import { NotificationBell } from "@/components/notifications/notification-bell";

/**
 * Server wrapper: fetches the acting user's summary (session-derived
 * userId passed in by the role layout) and hands a serialized DTO to the
 * client bell. Rendered into the shared AppShell header for every role.
 */
export async function NotificationBellServer({ userId, basePath }: { userId: string; basePath: string }) {
  const { unreadCount, recent } = await getNotificationSummary(userId);
  return (
    <NotificationBell
      notificationsPath={`${basePath}/notifications`}
      initial={{
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
      }}
    />
  );
}
