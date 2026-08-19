import { requireTeacherSelf } from "@/lib/auth/guards";
import { getBatchesForTeacher } from "@/lib/data/attendance";
import {
  getStudentsForTeacher,
  getBatchAttendanceSheet,
  getStudentAttendanceSummary,
} from "@/lib/data/attendance-reports";
import { PageHeader } from "@/components/page-header";
import { BatchSheetReport } from "@/components/attendance/batch-sheet-report";
import { StudentSummaryReport } from "@/components/attendance/student-summary-report";

export default async function TeacherReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { teacher } = await requireTeacherSelf();
  const sp = await searchParams;

  const [batches, students] = await Promise.all([
    getBatchesForTeacher(teacher.id),
    getStudentsForTeacher(teacher.id),
  ]);

  // Same rule markAttendance() enforces on write: only fetch report data for
  // batches/students actually belonging to this teacher.
  const isOwnBatch = Boolean(sp.batchId && batches.some((b) => b.id === sp.batchId));
  const isOwnStudent = Boolean(sp.studentId && students.some((s) => s.id === sp.studentId));

  const now = new Date();
  const [sheetYear, sheetMonth] = sp.month
    ? sp.month.split("-").map(Number)
    : [now.getFullYear(), now.getMonth() + 1];
  const sheet = isOwnBatch
    ? await getBatchAttendanceSheet(sp.batchId!, sheetYear, sheetMonth)
    : null;

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const summary = isOwnStudent
    ? await getStudentAttendanceSummary(sp.studentId!, sp.from ?? monthAgo, sp.to ?? today)
    : null;

  return (
    <>
      <PageHeader title="Reports" description="Attendance reports for your batches — export as CSV or print to PDF" />

      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Batch attendance sheet</h2>
          <BatchSheetReport
            basePath="/teacher/reports"
            batches={batches}
            batchId={sp.batchId}
            month={sp.month}
            sheet={sheet}
          />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Student attendance summary</h2>
          <StudentSummaryReport
            basePath="/teacher/reports"
            students={students}
            studentId={sp.studentId}
            from={sp.from}
            to={sp.to}
            summary={summary}
          />
        </section>
      </div>
    </>
  );
}
