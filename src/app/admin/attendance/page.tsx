import { requirePermission } from "@/lib/auth/guards";
import { getBatchesForAdmin, getRosterForBatch } from "@/lib/data/attendance";
import { PageHeader } from "@/components/page-header";
import { MarkAttendanceForm } from "@/components/attendance/mark-attendance-form";

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("attendance.manage");
  const sp = await searchParams;
  const batches = await getBatchesForAdmin();

  const rosterData =
    sp.batchId && sp.date ? await getRosterForBatch(sp.batchId, sp.date) : null;

  return (
    <>
      <PageHeader title="Attendance" description="Mark daily attendance by batch" />
      <MarkAttendanceForm
        basePath="/admin/attendance"
        batches={batches}
        batchId={sp.batchId}
        date={sp.date}
        roster={rosterData?.roster ?? null}
      />
    </>
  );
}
