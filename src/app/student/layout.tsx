import { Suspense } from "react";
import { requireStudentSelf } from "@/lib/auth/guards";
import { AppShell } from "@/components/app-shell";
import { STUDENT_NAV } from "@/lib/nav";
import { NotificationBellServer, NotificationBellFallback } from "@/components/notifications/notification-bell-server";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { session, student } = await requireStudentSelf();
  return (
    <AppShell nav={STUDENT_NAV} role={session.role} displayName={student.fullName} notificationBell={(
      <Suspense fallback={<NotificationBellFallback />}>
        <NotificationBellServer userId={session.userId} basePath="/student" />
      </Suspense>
    )}>
      {children}
    </AppShell>
  );
}
