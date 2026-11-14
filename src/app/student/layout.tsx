import { requireStudentSelf } from "@/lib/auth/guards";
import { AppShell } from "@/components/app-shell";
import { STUDENT_NAV } from "@/lib/nav";
import { NotificationBellServer } from "@/components/notifications/notification-bell-server";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { session, student } = await requireStudentSelf({ allowPasswordChange: true });
  return (
    <AppShell nav={STUDENT_NAV} role={session.role} displayName={student.fullName} notificationBell={<NotificationBellServer userId={session.userId} basePath="/student" />}>
      {children}
    </AppShell>
  );
}
