import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getCourseById } from "@/lib/data/courses";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { DeleteCourseButton } from "@/components/courses/delete-course-button";
import { formatDate } from "@/lib/utils";
import { Pencil } from "lucide-react";

export default async function AdminCourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("course.manage");
  const { id } = await params;
  const course = await getCourseById(id);
  if (!course) notFound();

  return (
    <>
      <PageHeader
        title={course.name}
        description={course.code}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/admin/courses/${course.id}/edit`}>
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            </Button>
            <DeleteCourseButton courseId={course.id} courseName={course.name} />
          </div>
        }
      />

      <Card className="mb-6">
        <CardContent className="grid gap-4 p-6 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="mt-1"><StatusBadge status={course.status} /></p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Level</p>
            <p className="font-medium">{course.level.charAt(0) + course.level.slice(1).toLowerCase()}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Duration</p>
            <p className="font-medium">{course.duration ?? "—"}</p>
          </div>
          {course.description && (
            <div className="sm:col-span-3">
              <p className="text-sm text-muted-foreground">Description</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{course.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Batches</CardTitle></CardHeader>
        <CardContent className="p-0">
          {course.batches.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No batches under this course yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Batch</th>
                    <th className="px-4 py-3 font-medium">Teacher</th>
                    <th className="px-4 py-3 font-medium">Dates</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Active students</th>
                  </tr>
                </thead>
                <tbody>
                  {course.batches.map((b) => (
                    <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link href={`/admin/batches/${b.id}`} className="font-medium text-primary hover:underline">
                          {b.name}
                        </Link>
                        <div className="font-mono text-xs text-muted-foreground">{b.code}</div>
                      </td>
                      <td className="px-4 py-3">{b.teacherName ?? "Unassigned"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {b.startDate ? formatDate(b.startDate) : "—"} – {b.endDate ? formatDate(b.endDate) : "—"}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                      <td className="px-4 py-3">{b.activeStudentCount}</td>
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
