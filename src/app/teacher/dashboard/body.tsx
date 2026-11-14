import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import { CheckCircle2, Circle, ClipboardCheck } from "lucide-react";
import type { getTeacherDashboard } from "@/lib/data/dashboard";
import { StatCard } from "@/components/stat-card";

/**
 * Everything below the page header, as one async Server Component awaiting
 * a promise started (not awaited) in page.tsx. getTeacherDashboard() already
 * does its own internal parallelization (see src/lib/data/dashboard.ts) —
 * it's kept as a single call here rather than pulled apart, since its three
 * internal stages are genuinely dependent on each other (this is the
 * pattern the Phase 1 diagnosis named as the reference for "what good looks
 * like" — not something to re-derive). What moves behind Suspense is only
 * the *rendering* of this whole body relative to the page header, which can
 * paint immediately once the (fast, single-row) teacher lookup resolves.
 */
export async function TeacherDashboardBody({
  dataPromise,
}: {
  dataPromise: ReturnType<typeof getTeacherDashboard>;
}) {
  const data = await dataPromise;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active batches" value={data.stats.activeBatches} icon="Layers" />
        <StatCard label="Total students" value={data.stats.totalStudents} icon="Users" tone="success" />
        <StatCard
          label="Ungraded submissions"
          value={data.stats.ungradedSubmissions}
          icon="FileText"
          tone={data.stats.ungradedSubmissions > 0 ? "warning" : "default"}
        />
        <StatCard label="Due this week" value={data.stats.upcomingAssignments} icon="CalendarClock" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Today&apos;s classes</CardTitle></CardHeader>
          <CardContent>
            {data.todaysBatches.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No ongoing batches right now.
              </p>
            ) : (
              <div className="space-y-2">
                {data.todaysBatches.map((b) => (
                  <div
                    key={b.batchId}
                    className="flex items-center justify-between rounded-md border border-border p-3 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      {b.attendanceMarked ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                      ) : (
                        <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium">{b.courseName}</p>
                        <p className="text-xs text-muted-foreground">{b.code} · {b.studentCount} students</p>
                      </div>
                    </div>
                    {b.attendanceMarked ? (
                      <span className="text-xs text-muted-foreground">Marked today</span>
                    ) : (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/teacher/attendance?batchId=${b.batchId}&date=${today}`}>
                          <ClipboardCheck className="h-4 w-4" /> Mark attendance
                        </Link>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent submissions to grade</CardTitle></CardHeader>
          <CardContent>
            {data.recentSubmissions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing waiting on you — all caught up.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.recentSubmissions.map((s) => (
                  <li
                    key={s.submissionId}
                    className="flex items-center justify-between border-b border-border pb-2 last:border-0"
                  >
                    <div>
                      <p className="font-medium">{s.studentName}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.assignmentTitle} · {s.submittedAt ? formatDate(s.submittedAt) : "—"}
                      </p>
                    </div>
                    <Link
                      href={`/teacher/assignments/${s.assignmentId}/submissions/${s.submissionId}`}
                      className="text-primary hover:underline"
                    >
                      Grade
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>My batches</CardTitle></CardHeader>
        <CardContent className="p-0">
          {data.myBatches.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No batches assigned yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Batch</th>
                    <th className="px-4 py-3 font-medium">Course</th>
                    <th className="px-4 py-3 font-medium">Students</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.myBatches.map((b) => (
                    <tr key={b.batchId} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 font-mono text-xs">{b.code}</td>
                      <td className="px-4 py-3 font-medium">{b.courseName}</td>
                      <td className="px-4 py-3">{b.studentCount}</td>
                      <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                      <td className="px-4 py-3">
                        <Link href={`/teacher/attendance?batchId=${b.batchId}`} className="text-primary hover:underline">
                          Attendance
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export function TeacherDashboardBodySkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-6 w-10" />
              </div>
              <Skeleton className="h-11 w-11 rounded-lg" />
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
            <CardContent className="space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-14 w-full" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader><Skeleton className="h-5 w-28" /></CardHeader>
        <CardContent className="space-y-2 p-6 pt-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </>
  );
}
