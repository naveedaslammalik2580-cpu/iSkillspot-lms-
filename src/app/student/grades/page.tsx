import { requireStudentSelf } from "@/lib/auth/guards";
import { PageHeader, EmptyState } from "@/components/page-header";

export default async function Page() {
  await requireStudentSelf();
  return (
    <>
      <PageHeader title="Grades" description="Your Grades — Stage: Stage 4" />
      <EmptyState title="Nothing here yet." hint="This shows only your own data, enforced server-side." />
    </>
  );
}
