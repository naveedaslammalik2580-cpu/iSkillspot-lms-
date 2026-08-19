import { requireStaff } from "@/lib/auth/guards";
import { PageHeader, EmptyState } from "@/components/page-header";

export default async function Page() {
  await requireStaff();
  return (
    <>
      <PageHeader title="Grades" description="Stage: Stage 4" />
      <EmptyState title="Grades module" hint="Backed by the shared schema and guards. Full UI ships in Stage 4." />
    </>
  );
}
