import Link from "next/link";
import { requireTeacherSelf } from "@/lib/auth/guards";
import { getTeacherStudents } from "@/lib/data/learning";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FilterForm, FilterSubmitButton } from "@/components/filter-form";

export default async function TeacherStudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { teacher } = await requireTeacherSelf();
  const sp = await searchParams;
  const { rows, batches } = await getTeacherStudents(teacher.id, {
    q: sp.q,
    batchId: sp.batchId,
    courseId: sp.courseId,
  });

  const courseOptions = [...new Map(batches.map((b) => [b.courseId, b.courseTitle])).entries()];

  return (
    <>
      <PageHeader title="My Students" description="Students enrolled in your batches" />

      <Card className="mb-4 p-4">
        <FilterForm action="/teacher/students" className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="q">
              Search
            </label>
            <Input
              id="q"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Name or student ID…"
              className="w-52"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="courseId">
              Course
            </label>
            <select
              id="courseId"
              name="courseId"
              defaultValue={sp.courseId ?? ""}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All my courses</option>
              {courseOptions.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="batchId">
              Batch
            </label>
            <select
              id="batchId"
              name="batchId"
              defaultValue={sp.batchId ?? ""}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All my batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>
          <FilterSubmitButton />
        </FilterForm>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          title={batches.length === 0 ? "No batches assigned yet." : "No students match."}
          hint={
            batches.length === 0
              ? "When the institute assigns you to a batch, its enrolled students will appear here."
              : "Try a different search or filter — only students in your own batches are listed."
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Student ID</th>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Batch</th>
                  <th className="px-4 py-3 font-medium">Quick links</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.studentId}-${r.batchId}`} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{r.fullName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.studentCode}</td>
                    <td className="px-4 py-3">{r.courseTitle}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.batchName} ({r.batchCode})
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex gap-3">
                        <Link href="/teacher/attendance" className="text-primary hover:underline">
                          Attendance
                        </Link>
                        <Link href="/teacher/assignments" className="text-primary hover:underline">
                          Assignments
                        </Link>
                      </span>
                    </td>
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
