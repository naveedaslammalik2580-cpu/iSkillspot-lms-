import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getAdminStats,
  getStudentStatusBreakdown,
  getAtRiskStudents,
  getRecentActivity,
  getEnrollmentByCourse,
} from "@/lib/data/dashboard";
import { EnrollmentChart } from "./enrollment-chart";
import { formatCurrency } from "@/lib/utils";
import { getSetting } from "@/lib/settings";

export default async function AdminDashboard() {
  const [stats, statusBreakdown, atRisk, activity, enrollment, currency] =
    await Promise.all([
      getAdminStats(),
      getStudentStatusBreakdown(),
      getAtRiskStudents(),
      getRecentActivity(),
      getEnrollmentByCourse(),
      getSetting("currency", "PKR"),
    ]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Institute overview at a glance"
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Students"
          value={stats.totalStudents}
          icon="Users"
        />

        <StatCard
          label="Active Students"
          value={stats.activeStudents}
          icon="UserCheck"
          tone="success"
        />

        <StatCard
          label="Completed"
          value={stats.completedStudents}
          icon="GraduationCap"
        />

        <StatCard
          label="Teachers"
          value={stats.totalTeachers}
          icon="Presentation"
        />

        <StatCard
          label="Active Courses"
          value={stats.activeCourses}
          icon="BookOpen"
        />

        <StatCard
          label="Active Batches"
          value={stats.activeBatches}
          icon="Layers"
        />

        <StatCard
          label="At Risk"
          value={atRisk.length}
          icon="AlertTriangle"
          tone="warning"
        />

        <StatCard
          label="Outstanding Fees"
          value={formatCurrency(stats.outstandingFees, currency)}
          icon="Wallet"
          tone="danger"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Enrollment by course</CardTitle>
          </CardHeader>

          <CardContent>
            {enrollment.length ? (
              <EnrollmentChart data={enrollment} />
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No enrollment data yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Student status</CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            {Object.entries(statusBreakdown).map(([status, count]) => (
              <div
                key={status}
                className="flex items-center justify-between text-sm"
              >
                <span className="capitalize text-muted-foreground">
                  {status.replace("_", " ").toLowerCase()}
                </span>

                <span className="font-semibold">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>At-risk students</CardTitle>
          </CardHeader>

          <CardContent>
            {atRisk.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No students currently at risk.
              </p>
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
                        <Badge key={reason} variant="warning">
                          {reason}
                        </Badge>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>

          <CardContent>
            {activity.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No activity recorded yet.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {activity.map((activityItem) => (
                  <li
                    key={activityItem.id}
                    className="flex items-center justify-between border-b border-border pb-2 last:border-0"
                  >
                    <span>
                      <span className="font-medium">
                        {activityItem.action}
                      </span>

                      {activityItem.entity && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {activityItem.entity}
                        </span>
                      )}
                    </span>

                    <span className="text-xs text-muted-foreground">
                      {activityItem.user?.username ?? "system"}
                    </span>
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