import { requireTeacherSelf } from "@/lib/auth/guards";
import { PageHeader, EmptyState } from "@/components/page-header";

export default async function Page() {
  await requireTeacherSelf();
  return (
    <>
      <PageHeader title="My Courses" description="Scoped to your assigned batches — Stage: Stage 2" />
      <EmptyState title="My Courses" hint="Teacher access is restricted to assigned batches and students, enforced server-side." />
    </>
  );
}
