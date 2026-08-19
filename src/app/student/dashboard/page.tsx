import { Suspense } from "react";
import { requireStudentSelf } from "@/lib/auth/guards";
import { getStudentDashboard } from "@/lib/data/student-self";
import { PageHeader } from "@/components/page-header";
import { StudentDashboardBody, StudentDashboardBodySkeleton } from "./body";

export default async function StudentDashboard() {
  // Guard resolves fully before anything below starts fetching or rendering.
  const { student } = await requireStudentSelf();

  // Started here (fetch begins immediately) but not awaited. The header's
  // description (current course) actually comes from this same query, so
  // it renders inside the Suspense-streamed body rather than here — see the
  // note in ./body.tsx.
  const dataPromise = getStudentDashboard(student.id);

  return (
    <>
      <PageHeader title={`Welcome, ${student.fullName}`} />

      <Suspense fallback={<StudentDashboardBodySkeleton />}>
        <StudentDashboardBody dataPromise={dataPromise} />
      </Suspense>
    </>
  );
}
