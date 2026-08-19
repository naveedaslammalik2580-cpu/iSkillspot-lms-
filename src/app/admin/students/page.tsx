import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { listStudents, getCoursesAndBatches } from "@/lib/data/students";
import { StudentFiltersBar } from "./filters-bar";
import { UserPlus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { StudentStatus } from "@prisma/client";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Number(sp.page ?? "1");

  const [result, courses] = await Promise.all([
    listStudents({
      q: sp.q,
      courseId: sp.courseId,
      batchId: sp.batchId,
      status: sp.status as StudentStatus | undefined,
      page,
    }),
    getCoursesAndBatches(),
  ]);

  return (
    <>
      <PageHeader
        title="Students"
        description={`${result.total} total`}
        action={
          <Button asChild>
            <Link href="/admin/students/new">
              <UserPlus className="h-4 w-4" /> Add Student
            </Link>
          </Button>
        }
      />

      <StudentFiltersBar courses={courses} current={sp} />

      {result.rows.length === 0 ? (
        <EmptyState
          title="No students found."
          hint="Try adjusting filters, or add your first student."
          action={
            <Button asChild>
              <Link href="/admin/students/new">Add Student</Link>
            </Button>
          }
        />
      ) : (
        <Card className="mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Student ID</th>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Batch</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Admitted</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((s) => {
                  const enr = s.enrollments[0];
                  return (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link href={`/admin/students/${s.id}`} className="font-medium text-primary hover:underline">
                          {s.fullName}
                        </Link>
                        <div className="text-xs text-muted-foreground">{s.email}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{s.studentId}</td>
                      <td className="px-4 py-3">{enr?.course.title ?? "—"}</td>
                      <td className="px-4 py-3">{enr?.batch.name ?? "—"}</td>
                      <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(s.admissionDate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {result.pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {Array.from({ length: result.pages }, (_, i) => i + 1).map((p) => {
            const params = new URLSearchParams(sp as Record<string, string>);
            params.set("page", String(p));
            return (
              <Button key={p} asChild variant={p === page ? "default" : "outline"} size="sm">
                <Link href={`/admin/students?${params.toString()}`}>{p}</Link>
              </Button>
            );
          })}
        </div>
      )}
    </>
  );
}
