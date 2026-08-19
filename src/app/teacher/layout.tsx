import { requireTeacherSelf } from "@/lib/auth/guards";
import { AppShell } from "@/components/app-shell";
import { TEACHER_NAV } from "@/lib/nav";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { session, teacher } = await requireTeacherSelf();
  return (
    <AppShell nav={TEACHER_NAV} role={session.role} displayName={teacher.fullName}>
      {children}
    </AppShell>
  );
}
