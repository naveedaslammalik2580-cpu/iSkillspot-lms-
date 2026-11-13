import { requireStaff } from "@/lib/auth/guards";
import { NotificationHistory } from "@/components/notifications/notification-history";
import { NotificationSettings } from "@/components/notifications/notification-preferences-server";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; filter?: string }>;
}) {
  const session = await requireStaff();
  const params = await searchParams;
  return (
    <NotificationHistory userId={session.userId} basePath="/admin" searchParams={params}>
      <NotificationSettings userId={session.userId} />
    </NotificationHistory>
  );
}
