import { requirePermission } from "@/lib/auth/guards";
import { PageHeader, EmptyState } from "@/components/page-header";

export default async function AdminReportsPage() {
  await requirePermission("report.view");

  return (
    <>
      <PageHeader title="Reports" description="Agency reports" />
      <EmptyState
        title="Reports are being reworked."
        hint="The old attendance reports were removed with the attendance module. New agency reports will be added here."
      />
    </>
  );
}
