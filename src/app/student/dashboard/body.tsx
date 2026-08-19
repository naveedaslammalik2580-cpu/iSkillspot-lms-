import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/stat-card";
import { formatDate } from "@/lib/utils";
import type { getStudentDashboard } from "@/lib/data/student-self";

const QUICK = [
  { label: "Continue Learning", href: "/student/courses", icon: "PlayCircle" },
  { label: "Assignments", href: "/student/assignments", icon: "FileText" },
  { label: "Quizzes", href: "/student/quizzes", icon: "ClipboardList" },
  { label: "Attendance", href: "/student/attendance", icon: "CalendarCheck" },
  { label: "Grades", href: "/student/grades", icon: "Award" },
  { label: "Certificates", href: "/student/certificates", icon: "BadgeCheck" },
];

/**
 * Everything below the page header, as one async Server Component awaiting
 * a promise started (not awaited) in page.tsx — see the equivalent note in
 * teacher/dashboard/body.tsx for why this stays one call rather than being
 * pulled apart further.
 */
export async function StudentDashboardBody({
  dataPromise,
}: {
  dataPromise: ReturnType<typeof getStudentDashboard>;
}) {
  const data = await dataPromise;
  if (!data) return null;

  return (
    <>
      {/* Mirrors PageHeader's description styling — relocated here (instead
          of passed as PageHeader's description prop in page.tsx) because
          it depends on this same dashboard query; keeping it in page.tsx
          would force the whole header to wait on the slow query too. */}
      <p className="-mt-4 mb-6 text-sm text-muted-foreground">{data.currentCourse}</p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Overall progress" value={`${data.overallProgress}%`} icon="TrendingUp" />
        <StatCard label="Attendance" value={`${data.attendancePct}%`} icon="CalendarCheck" tone="success" />
        <StatCard label="Pending assignments" value={data.pendingAssignments} icon="FileText" tone="warning" />
        <StatCard label="Recent grades" value={data.recentGrades.length} icon="Award" />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {QUICK.map((q) => (
          <Button key={q.href} asChild variant="outline" className="h-20 flex-col">
            <Link href={q.href}>{q.label}</Link>
          </Button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Recent grades</CardTitle></CardHeader>
          <CardContent>
            {data.recentGrades.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No grades yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.recentGrades.map((g) => (
                  <li key={g.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                    <span>{g.title} <span className="text-muted-foreground">· {g.course.title}</span></span>
                    <span className="font-semibold">{Math.round(g.percentage)}%</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Announcements</CardTitle></CardHeader>
          <CardContent>
            {data.announcements.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No announcements.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {data.announcements.map((a) => (
                  <li key={a.id} className="border-b border-border pb-3 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{a.title}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(a.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{a.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export function StudentDashboardBodySkeleton() {
  return (
    <>
      <Skeleton className="-mt-4 mb-6 h-4 w-40" />

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

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-md" />
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
            <CardContent className="space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-12 w-full" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
