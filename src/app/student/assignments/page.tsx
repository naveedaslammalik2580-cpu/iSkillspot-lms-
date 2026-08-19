import Link from "next/link";
import { requireStudentSelf } from "@/lib/auth/guards";
import { getAssignmentsForStudent } from "@/lib/data/assignments";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";

export default async function StudentAssignmentsPage() {
  const { student } = await requireStudentSelf();
  const assignments = await getAssignmentsForStudent(student.id);

  return (
    <>
      <PageHeader title="Assignments" description="Across all your enrolled courses" />
      {assignments.length === 0 ? (
        <EmptyState title="No assignments yet." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/student/assignments/${a.id}`} className="font-medium text-primary hover:underline">
                        {a.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{a.courseTitle}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {a.dueDate ? formatDate(a.dueDate) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status === "NOT_SUBMITTED" ? "PENDING" : a.status} />
                    </td>
                    <td className="px-4 py-3">
                      {a.score !== null ? `${a.score} / ${a.maxScore}` : "—"}
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
