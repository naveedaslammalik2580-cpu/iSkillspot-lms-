import Link from "next/link";
import { requireStudentSelf } from "@/lib/auth/guards";
import { getStudentDashboard } from "@/lib/data/student-self";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

const QUICK = [
  { label: "Continue Learning", href: "/student/courses", icon: "PlayCircle" },
  { label: "Assignments", href: "/student/assignments", icon: "FileText" },
  { label: "Quizzes", href: "/student/quizzes", icon: "ClipboardList" },
  { label: "Attendance", href: "/student/attendance", icon: "CalendarCheck" },
  { label: "Grades", href: "/student/grades", icon: "Award" },
  { label: "Certificates", href: "/student/certificates", icon: "BadgeCheck" },
];

export default async function StudentDashboard() {
  const { student } = await requireStudentSelf();
  const data = await getStudentDashboard(student.id);
  if (!data) return null;

  return (
    <>
      <PageHeader title={`Welcome, ${student.fullName}`} description={data.currentCourse} />

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
