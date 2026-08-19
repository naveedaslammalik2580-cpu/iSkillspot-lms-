import { requireStaff } from "@/lib/auth/guards";
import { PageHeader, EmptyState } from "@/components/page-header";

export default async function Page() {
  await requireStaff();
  return (
    <>
      <PageHeader title="Quizzes" description="Stage: Stage 3" />
      <EmptyState title="Quizzes module" hint="Backed by the shared schema and guards. Full UI ships in Stage 3." />
    </>
  );
}
