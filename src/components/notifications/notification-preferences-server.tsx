import { getPreferencesForUser } from "@/lib/data/notifications";
import { NotificationPreferences } from "@/components/notifications/notification-preferences";
import { NotificationPushControls } from "@/components/notifications/notification-push-controls";
import { isPushConfigured, listMyPushEndpoints } from "@/lib/push-subscriptions";

/**
 * Settings block rendered under the notification history for every role:
 * per-type channel preferences plus the browser-push controls. The VAPID
 * public key is read server-side and passed as a prop — it is the public
 * half of the pair and safe to expose; the private key never leaves the
 * server.
 */
export async function NotificationSettings({ userId }: { userId: string }) {
  const prefs = await getPreferencesForUser(userId);
  const pushConfigured = isPushConfigured();
  const myEndpoints = pushConfigured ? await listMyPushEndpoints(userId) : [];
  return (
    <>
      <NotificationPreferences initial={prefs} pushConfigured={pushConfigured} />
      <NotificationPushControls
        configured={pushConfigured}
        vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? null}
        initialEndpoints={myEndpoints}
      />
    </>
  );
}
