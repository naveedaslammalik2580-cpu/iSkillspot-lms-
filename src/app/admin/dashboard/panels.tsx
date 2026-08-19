import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/stat-card";
import { EnrollmentChart } from "./enrollment-chart";
import type {
  getAtRiskStudents,
  getStudentStatusBreakdown,
  getRecentActivity,
  getEnrollmentByCourse,
} from "@/lib/data/dashboard";

/**
 * Each panel below is an async Server Component that awaits a promise
 * *started* (not awaited) in page.tsx, so it can be wrapped in its own
 * <Suspense> boundary there — the fast primary stat row doesn't wait on
 * these slower secondary queries, but nothing here starts fetching a
 * moment later than it used to; only the awaiting/rendering is deferred.
 */

// ---------------------------------------------------------------------------
// At-risk count — the 8th stat card. Its count comes from the same
// getAtRiskStudents() call as <AtRiskPanel> below (the same promise is
// passed to both from page.tsx), so this never issues a second query.
// ---------------------------------------------------------------------------

export async function AtRiskCountCard({
  dataPromise,
}: {
  dataPromise: ReturnType<typeof getAtRiskStudents>;
}) {
  const atRisk = await dataPromise;
  return <StatCard label="At Risk" value={atRisk.length} icon="AlertTriangle" tone="warning" />;
}

export function AtRiskCountCardSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className="h-6 w-8" />
        </div>
        <Skeleton className="h-11 w-11 rounded-lg" />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Enrollment by course (chart)
// ---------------------------------------------------------------------------

export async function EnrollmentPanel({
  dataPromise,
}: {
  dataPromise: ReturnType<typeof getEnrollmentByCourse>;
}) {
  const enrollment = await dataPromise;
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Enrollment by course</CardTitle>
      </CardHeader>
      <CardContent>
        {enrollment.length ? (
          <EnrollmentChart data={enrollment} />
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">No enrollment data yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function EnrollmentPanelSkeleton() {
  return (
    <Card className="lg:col-span-2">
      <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
      <CardContent><Skeleton className="h-64 w-full" /></CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Student status breakdown
// ---------------------------------------------------------------------------

export async function StatusBreakdownPanel({
  dataPromise,
}: {
  dataPromise: ReturnType<typeof getStudentStatusBreakdown>;
}) {
  const statusBreakdown = await dataPromise;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Student status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(statusBreakdown).map(([status, count]) => (
          <div key={status} className="flex items-center justify-between text-sm">
            <span className="capitalize text-muted-foreground">{status.replace("_", " ").toLowerCase()}</span>
            <span className="font-semibold">{count}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function StatusBreakdownPanelSkeleton() {
  return (
    <Card>
      <CardHeader><Skeleton className="h-5 w-28" /></CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-6" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// At-risk students (detail list)
// ---------------------------------------------------------------------------

export async function AtRiskPanel({
  dataPromise,
}: {
  dataPromise: ReturnType<typeof getAtRiskStudents>;
}) {
  const atRisk = await dataPromise;
  return (
    // Visually distinct from the other dashboard cards: this is the one
    // genuinely actionable list here (needs someone to follow up), not just
    // a glance-metric, so it gets a left accent stripe in the same warning
    // color already used elsewhere (StatCard's "warning" tone, Badge's
    // "warning" variant) rather than a new color introduced just for this.
    <Card className="border-l-4 border-l-amber-400">
      <CardHeader>
        <CardTitle>At-risk students</CardTitle>
      </CardHeader>
      <CardContent>
        {atRisk.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No students currently at risk.</p>
        ) : (
          <div className="space-y-2">
            {atRisk.slice(0, 6).map((student) => (
              <Link
                key={student.id}
                href={`/admin/students/${student.id}`}
                className="flex items-center justify-between rounded-md border border-border p-3 text-sm hover:bg-muted"
              >
                <div>
                  <p className="font-medium">{student.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    {student.studentId} · {student.course}
                  </p>
                </div>
                <div className="flex gap-1">
                  {student.reasons.map((reason) => (
                    <Badge key={reason} variant="warning">{reason}</Badge>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AtRiskPanelSkeleton() {
  return (
    <Card className="border-l-4 border-l-amber-400">
      <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
      <CardContent className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Recent activity
// ---------------------------------------------------------------------------

export async function ActivityPanel({
  dataPromise,
}: {
  dataPromise: ReturnType<typeof getRecentActivity>;
}) {
  const activity = await dataPromise;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {activity.map((activityItem) => (
              <li
                key={activityItem.id}
                className="flex items-center justify-between border-b border-border pb-2 last:border-0"
              >
                <span>
                  <span className="font-medium">{activityItem.action}</span>
                  {activityItem.entity && (
                    <span className="text-muted-foreground"> · {activityItem.entity}</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{activityItem.user?.username ?? "system"}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ActivityPanelSkeleton() {
  return (
    <Card>
      <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
      <CardContent className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
