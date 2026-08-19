import { requireStudentSelf } from "@/lib/auth/guards";
import { PageHeader, EmptyState } from "@/components/page-header";

export default async function Page() {
  await requireStudentSelf();
  return (
    <>
      <PageHeader title="My Courses" description="Your courses — Stage: Stage 3" />
      <EmptyState title="Nothing here yet." hint="This shows only your own data, enforced server-side." />
    </>
  );
}
