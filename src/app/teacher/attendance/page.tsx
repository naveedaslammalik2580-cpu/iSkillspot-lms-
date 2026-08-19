import { requireTeacherSelf } from "@/lib/auth/guards";
import { getBatchesForTeacher, getRosterForBatch } from "@/lib/data/attendance";
import { PageHeader } from "@/components/page-header";
import { MarkAttendanceForm } from "@/components/attendance/mark-attendance-form";

export default async function TeacherAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { teacher } = await requireTeacherSelf();
  const sp = await searchParams;
  const batches = await getBatchesForTeacher(teacher.id);

  // Only fetch the roster if the requested batch is actually one of this
  // teacher's own batches — the same rule markAttendance() enforces on write.
  const isOwnBatch = Boolean(sp.batchId && batches.some((b) => b.id === sp.batchId));
  const rosterData =
    isOwnBatch && sp.date ? await getRosterForBatch(sp.batchId!, sp.date) : null;

  return (
    <>
      <PageHeader title="Attendance" description="Mark daily attendance for your batches" />
      <MarkAttendanceForm
        basePath="/teacher/attendance"
        batches={batches}
        batchId={sp.batchId}
        date={sp.date}
        roster={rosterData?.roster ?? null}
      />
    </>
  );
}
