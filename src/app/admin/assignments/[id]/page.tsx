import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getAssignmentDetail } from "@/lib/data/assignments";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { DeleteAssignmentButton } from "@/components/assignments/delete-assignment-button";
import { formatDate } from "@/lib/utils";
import { Pencil } from "lucide-react";

export default async function AdminAssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission("assignment.manage");
  const { id } = await params;
  const assignment = await getAssignmentDetail(id, session);
  if (!assignment) notFound();

  return (
    <>
      <PageHeader
        title={assignment.title}
        description={`${assignment.courseTitle}${assignment.moduleTitle ? ` · ${assignment.moduleTitle}` : ""}`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/admin/assignments/${assignment.id}/edit`}>
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            </Button>
            <DeleteAssignmentButton assignmentId={assignment.id} basePath="/admin/assignments" />
          </div>
        }
      />

      <Card className="mb-6">
        <CardContent className="grid gap-4 p-6 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Due date</p>
            <p className="font-medium">{assignment.dueDate ? formatDate(assignment.dueDate) : "No due date"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Max score</p>
            <p className="font-medium">{assignment.maxScore}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Submissions</p>
            <p className="font-medium">{assignment.submissions.length}</p>
          </div>
          {assignment.description && (
            <div className="sm:col-span-3">
              <p className="text-sm text-muted-foreground">Description</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{assignment.description}</p>
            </div>
          )}
          {assignment.instructions && (
            <div className="sm:col-span-3">
              <p className="text-sm text-muted-foreground">Instructions</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{assignment.instructions}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Submissions</CardTitle></CardHeader>
        <CardContent className="p-0">
          {assignment.submissions.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No submissions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Score</th>
                    <th className="px-4 py-3 font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {assignment.submissions.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/assignments/${assignment.id}/submissions/${s.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {s.studentName}
                        </Link>
                        <div className="font-mono text-xs text-muted-foreground">{s.studentIdCode}</div>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                      <td className="px-4 py-3">
                        {s.score !== null ? `${s.score} / ${assignment.maxScore}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {s.submittedAt ? formatDate(s.submittedAt) : "—"}
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
