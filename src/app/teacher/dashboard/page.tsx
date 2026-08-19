import { Suspense } from "react";
import { requireTeacherSelf } from "@/lib/auth/guards";
import { getTeacherDashboard } from "@/lib/data/dashboard";
import { PageHeader } from "@/components/page-header";
import { TeacherDashboardBody, TeacherDashboardBodySkeleton } from "./body";

export default async function TeacherDashboard() {
  // Guard resolves fully before anything below starts fetching or rendering.
  const { teacher } = await requireTeacherSelf();

  // Started here (fetch begins immediately) but not awaited — the header
  // above can paint as soon as the (fast) teacher lookup resolves, while the
  // heavier dashboard body streams in behind its own Suspense boundary.
  const dataPromise = getTeacherDashboard(teacher.id);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${teacher.fullName}`}
        description="Here's what's happening across your batches today"
      />

      <Suspense fallback={<TeacherDashboardBodySkeleton />}>
        <TeacherDashboardBody dataPromise={dataPromise} />
      </Suspense>
    </>
  );
}
