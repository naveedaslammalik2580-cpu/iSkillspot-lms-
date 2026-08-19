import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { getAdminStats, getAtRiskStudents, getStudentStatusBreakdown, getRecentActivity, getEnrollmentByCourse } from "@/lib/data/dashboard";
import { formatCurrency } from "@/lib/utils";
import { getSetting } from "@/lib/settings";
import {
  AtRiskCountCard,
  AtRiskCountCardSkeleton,
  EnrollmentPanel,
  EnrollmentPanelSkeleton,
  StatusBreakdownPanel,
  StatusBreakdownPanelSkeleton,
  AtRiskPanel,
  AtRiskPanelSkeleton,
  ActivityPanel,
  ActivityPanelSkeleton,
} from "./panels";

export default async function AdminDashboard() {
  // Primary content: the 7 stat cards that don't depend on the slower
  // secondary queries below. Awaited directly so they paint as soon as
  // they're ready, instead of waiting on the slowest of six queries the
  // way the previous single Promise.all did.
  const [stats, currency] = await Promise.all([
    getAdminStats(),
    getSetting("currency", "PKR"),
  ]);

  // Secondary content: started here (so the fetch begins immediately, same
  // as before) but NOT awaited — each promise is handed to its own async
  // panel component below, wrapped in <Suspense>, so slow ones don't block
  // fast ones or the primary stat row.
  //
  // atRiskPromise is shared between the "At Risk" stat card and the At-Risk
  // detail panel below — both await the *same* promise, so this remains a
  // single getAtRiskStudents() call, not two. Its count is a genuine
  // by-product of the same slow query as the detail list, so that one stat
  // card streams in slightly after the other 7 rather than duplicating the
  // query to force an instant count.
  const atRiskPromise = getAtRiskStudents();
  const statusBreakdownPromise = getStudentStatusBreakdown();
  const activityPromise = getRecentActivity();
  const enrollmentPromise = getEnrollmentByCourse();

  return (
    <>
      <PageHeader title="Dashboard" description="Institute overview at a glance" />

      {/* Primary: the 4 stats that matter day-to-day (confirmed with product
          owner during Phase 2 planning) — current headcount, who needs
          intervention, who owes money, what's currently running. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active Students" value={stats.activeStudents} icon="UserCheck" tone="success" />
        <Suspense fallback={<AtRiskCountCardSkeleton />}>
          <AtRiskCountCard dataPromise={atRiskPromise} />
        </Suspense>
        <StatCard label="Outstanding Fees" value={formatCurrency(stats.outstandingFees, currency)} icon="Wallet" tone="danger" />
        <StatCard label="Active Batches" value={stats.activeBatches} icon="Layers" />
      </div>

      {/* Secondary: cumulative/contextual totals — same numbers as before,
          just quieter (StatCard's compact variant) so they don't compete
          with the primary row above. */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total Students" value={stats.totalStudents} icon="Users" variant="compact" />
        <StatCard label="Completed" value={stats.completedStudents} icon="GraduationCap" variant="compact" />
        <StatCard label="Teachers" value={stats.totalTeachers} icon="Presentation" variant="compact" />
        <StatCard label="Active Courses" value={stats.activeCourses} icon="BookOpen" variant="compact" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Suspense fallback={<EnrollmentPanelSkeleton />}>
          <EnrollmentPanel dataPromise={enrollmentPromise} />
        </Suspense>
        <Suspense fallback={<StatusBreakdownPanelSkeleton />}>
          <StatusBreakdownPanel dataPromise={statusBreakdownPromise} />
        </Suspense>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<AtRiskPanelSkeleton />}>
          <AtRiskPanel dataPromise={atRiskPromise} />
        </Suspense>
        <Suspense fallback={<ActivityPanelSkeleton />}>
          <ActivityPanel dataPromise={activityPromise} />
        </Suspense>
      </div>
    </>
  );
}
