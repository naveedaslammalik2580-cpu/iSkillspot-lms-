import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getBatchById } from "@/lib/data/batches";
import { getTeacherPicker } from "@/lib/data/teachers";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { DeleteBatchButton } from "@/components/batches/delete-batch-button";
import { ReassignTeacherButton } from "@/components/batches/reassign-teacher-button";
import { formatDate } from "@/lib/utils";
import { Pencil, UserPlus } from "lucide-react";

export default async function AdminBatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("batch.manage");
  const { id } = await params;
  const [batch, teachers] = await Promise.all([getBatchById(id), getTeacherPicker()]);
  if (!batch) notFound();

  return (
    <>
      <PageHeader
        title={batch.name}
        description={`${batch.courseTitle} · ${batch.code}`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/admin/batches/${batch.id}/edit`}>
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            </Button>
            <DeleteBatchButton batchId={batch.id} batchName={batch.name} />
          </div>
        }
      />

      <Card className="mb-6">
        <CardContent className="grid gap-4 p-6 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="mt-1"><StatusBadge status={batch.status} /></p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Dates</p>
            <p className="font-medium">
              {batch.startDate ? formatDate(batch.startDate) : "—"} – {batch.endDate ? formatDate(batch.endDate) : "—"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Course</p>
            <Link href={`/admin/courses/${batch.courseId}`} className="font-medium text-primary hover:underline">
              {batch.courseTitle}
            </Link>
          </div>
          <div className="sm:col-span-2">
            <p className="text-sm text-muted-foreground">Teacher</p>
            <p className="font-medium">{batch.teacherName ?? "Unassigned"}</p>
          </div>
          <div className="flex items-end justify-end">
            <ReassignTeacherButton batchId={batch.id} currentTeacherId={batch.teacherId} teachers={teachers} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total enrolled</p>
            <p className="font-medium">{batch.stats.totalEnrolled}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Active</p>
            <p className="font-medium">{batch.stats.activeEnrolled}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Attendance marked</p>
            <p className="font-medium">{batch.stats.attendanceMarkedDays} day(s)</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Enrolled students</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/students/new">
              <UserPlus className="h-4 w-4" /> Add student
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {batch.students.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No students enrolled yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Student ID</th>
                    <th className="px-4 py-3 font-medium">Enrollment status</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.students.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link href={`/admin/students/${s.id}`} className="font-medium text-primary hover:underline">
                          {s.fullName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.studentIdCode}</td>
                      <td className="px-4 py-3"><StatusBadge status={s.enrollmentStatus} /></td>
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
