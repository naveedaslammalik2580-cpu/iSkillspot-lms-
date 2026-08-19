import { notFound } from "next/navigation";
import { requireStudentSelf } from "@/lib/auth/guards";
import { getStudentAssignmentDetail } from "@/lib/data/assignments";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { SubmissionForm } from "@/components/assignments/submission-form";
import { formatDate } from "@/lib/utils";

export default async function StudentAssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { student } = await requireStudentSelf();
  const { id } = await params;
  // Returns null both when the assignment doesn't exist and when the
  // student isn't enrolled in its course — same 404 either way, no leak.
  const assignment = await getStudentAssignmentDetail(id, student.id);
  if (!assignment) notFound();

  return (
    <>
      <PageHeader
        title={assignment.title}
        description={`${assignment.courseTitle} · Due ${assignment.dueDate ? formatDate(assignment.dueDate) : "—"}`}
      />

      <Card className="mb-6">
        <CardContent className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Due date</p>
              <p className="font-medium">
                {assignment.dueDate ? formatDate(assignment.dueDate) : "No due date"}
                {assignment.isPastDue && !assignment.submission && (
                  <span className="ml-2 text-xs text-destructive">Past due — late submissions still accepted</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Max score</p>
              <p className="font-medium">{assignment.maxScore}</p>
            </div>
          </div>
          {assignment.description && (
            <div>
              <p className="text-sm text-muted-foreground">Description</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{assignment.description}</p>
            </div>
          )}
          {assignment.instructions && (
            <div>
              <p className="text-sm text-muted-foreground">Instructions</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{assignment.instructions}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <SubmissionForm
        assignmentId={assignment.id}
        submissionId={assignment.submission?.id ?? null}
        status={assignment.submission?.status ?? null}
        score={assignment.submission?.score ?? null}
        feedback={assignment.submission?.feedback ?? null}
        submissionText={assignment.submission?.submissionText ?? null}
        files={assignment.submission?.files ?? []}
        maxScore={assignment.maxScore}
      />
    </>
  );
}
