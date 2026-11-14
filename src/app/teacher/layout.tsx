import { requireTeacherSelf } from "@/lib/auth/guards";
import { AppShell } from "@/components/app-shell";
import { TEACHER_NAV } from "@/lib/nav";
import { NotificationBellServer } from "@/components/notifications/notification-bell-server";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { session, teacher } = await requireTeacherSelf();
  return (
    <AppShell nav={TEACHER_NAV} role={session.role} displayName={teacher.fullName} notificationBell={<NotificationBellServer userId={session.userId} basePath="/teacher" />}>
      {children}
    </AppShell>
  );
}
