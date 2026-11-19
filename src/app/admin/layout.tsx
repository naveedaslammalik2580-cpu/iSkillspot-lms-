import { Suspense } from "react";
import { requireStaff } from "@/lib/auth/guards";
import { AppShell } from "@/components/app-shell";
import { navFor } from "@/lib/nav";
import { NotificationBellServer, NotificationBellFallback } from "@/components/notifications/notification-bell-server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff();
  return (
    <AppShell nav={navFor(session.role)} role={session.role} displayName={session.username} notificationBell={(
      <Suspense fallback={<NotificationBellFallback />}>
        <NotificationBellServer userId={session.userId} basePath="/admin" />
      </Suspense>
    )}>
      {children}
    </AppShell>
  );
}
