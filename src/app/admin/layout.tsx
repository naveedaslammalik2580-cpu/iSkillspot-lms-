import { requireStaff } from "@/lib/auth/guards";
import { AppShell } from "@/components/app-shell";
import { navFor } from "@/lib/nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff();
  return (
    <AppShell nav={navFor(session.role)} role={session.role} displayName={session.username}>
      {children}
    </AppShell>
  );
}
