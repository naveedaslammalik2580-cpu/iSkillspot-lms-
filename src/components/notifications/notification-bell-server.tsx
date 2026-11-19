import { Bell } from "lucide-react";
import { getNotificationSummary } from "@/lib/data/notifications";
import { NotificationBell } from "@/components/notifications/notification-bell";

/**
 * Same-shaped placeholder shown while the bell's summary streams in.
 * The layouts wrap NotificationBellServer in <Suspense> with this as the
 * fallback so the shell (and the page below it) never waits on the bell's
 * notification queries before first paint — the bell fills in a beat
 * later with identical markup geometry, so nothing shifts.
 */
export function NotificationBellFallback() {
  return (
    <div className="relative">
      <div className="rounded-md p-2 text-muted-foreground" aria-hidden="true">
        <Bell className="h-5 w-5" />
      </div>
    </div>
  );
}

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
