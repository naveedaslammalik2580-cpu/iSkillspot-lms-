import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getQuizAttemptForAdmin } from "@/lib/data/quizzes";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MarkingForm } from "@/components/quizzes/marking-form";
import { formatDate } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

export default async function AdminQuizAttemptMarkingPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  await requirePermission("quiz.manage");
  const { id, attemptId } = await params;
  const attempt = await getQuizAttemptForAdmin(id, attemptId);
  if (!attempt) notFound();

  const ev = attempt.evaluation;

  return (
    <>
      <PageHeader
        title={`Attempt #${attempt.attemptNumber} — ${attempt.studentName}`}
        description={`${attempt.quizTitle} · ${attempt.studentCode}${attempt.completedAt ? ` · submitted ${formatDate(attempt.completedAt)}` : ""}`}
        action={
          <Button asChild variant="outline">
            <Link href={`/admin/quizzes/${id}`}>
              <ArrowLeft className="h-4 w-4" /> Back to quiz
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Status</p>
            {ev.pendingMarking ? (
              <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">Pending marking</p>
            ) : (
              <p className="text-lg font-semibold">Final</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Auto-scored part</p>
            <p className="text-lg font-semibold">
              {ev.autoScore} / {ev.autoTotalPoints} points
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{ev.pendingMarking ? "Current total (auto part only)" : "Final result"}</p>
            <p className="text-lg font-semibold">
              {ev.score} / {ev.totalPoints} points · {Math.round(ev.percentage)}%
              {!ev.pendingMarking && (
                <span className={ev.passed ? "text-green-700 dark:text-green-400" : "text-destructive"}>
                  {" "}· {ev.passed ? "Passed" : "Failed"}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">Pass mark {attempt.passingScore}%</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <MarkingForm quizId={id} attemptId={attemptId} questions={attempt.questions} />
      </div>
    </>
  );
}
