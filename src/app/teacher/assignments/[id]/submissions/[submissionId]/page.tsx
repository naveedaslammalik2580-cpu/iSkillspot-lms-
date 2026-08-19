import { notFound } from "next/navigation";
import { requireTeacherSelf } from "@/lib/auth/guards";
import { getSubmissionDetail } from "@/lib/data/assignments";
import { PageHeader } from "@/components/page-header";
import { GradingForm } from "@/components/assignments/grading-form";
import { formatDate } from "@/lib/utils";

export default async function TeacherGradingPage({
  params,
}: {
  params: Promise<{ id: string; submissionId: string }>;
}) {
  const { session } = await requireTeacherSelf();
  const { submissionId } = await params;
  const submission = await getSubmissionDetail(submissionId, session);
  if (!submission) notFound();

  return (
    <>
      <PageHeader title={submission.assignmentTitle} description="Grade submission" />
      <GradingForm
        submissionId={submission.id}
        studentName={submission.studentName}
        studentIdCode={submission.studentIdCode}
        maxScore={submission.maxScore}
        status={submission.status}
        score={submission.score}
        feedback={submission.feedback}
        submissionText={submission.submissionText}
        submittedAt={submission.submittedAt ? formatDate(submission.submittedAt) : null}
        files={submission.files}
      />
    </>
  );
}
