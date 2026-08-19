import Link from "next/link";
import { requireTeacherSelf } from "@/lib/auth/guards";
import { getAssignmentsForTeacher, getCoursesForTeacher } from "@/lib/data/assignments";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";

export default async function TeacherAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { teacher } = await requireTeacherSelf();
  const sp = await searchParams;

  const [assignments, courses] = await Promise.all([
    getAssignmentsForTeacher(teacher.id, { courseId: sp.courseId }),
    getCoursesForTeacher(teacher.id),
  ]);

  return (
    <>
      <PageHeader
        title="Assignments"
        description={`${assignments.length} total`}
        action={
          <Button asChild>
            <Link href="/teacher/assignments/new">
              <Plus className="h-4 w-4" /> New assignment
            </Link>
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-end gap-3" method="GET">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="courseId">Course</label>
            <select
              id="courseId"
              name="courseId"
              defaultValue={sp.courseId ?? ""}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All my courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline">Filter</Button>
        </form>
      </Card>

      {assignments.length === 0 ? (
        <EmptyState
          title="No assignments found."
          hint="Try a different course filter, or create your first assignment."
          action={
            <Button asChild>
              <Link href="/teacher/assignments/new">New assignment</Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 font-medium">Submitted</th>
                  <th className="px-4 py-3 font-medium">Graded</th>
                  <th className="px-4 py-3 font-medium">Late</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/teacher/assignments/${a.id}`} className="font-medium text-primary hover:underline">
                        {a.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{a.courseTitle}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {a.dueDate ? formatDate(a.dueDate) : "—"}
                    </td>
                    <td className="px-4 py-3">{a.counts.submitted}</td>
                    <td className="px-4 py-3">{a.counts.graded}</td>
                    <td className="px-4 py-3">{a.counts.late}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
