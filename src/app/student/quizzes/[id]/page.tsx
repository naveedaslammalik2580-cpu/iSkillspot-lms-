import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStudentSelf } from "@/lib/auth/guards";
import {
  getQuizForStudentAttempt,
  getStudentAttemptReview,
  type StudentAttemptReview,
} from "@/lib/data/quizzes";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AttemptForm } from "@/components/quizzes/attempt-form";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

function ReviewView({ quizId, review, attemptsRemaining }: { quizId: string; review: StudentAttemptReview; attemptsRemaining: number }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          {review.pendingMarking ? (
            <>
              <p className="text-sm text-muted-foreground">Attempt #{review.attemptNumber} — marking in progress</p>
              <p className="mt-1 text-2xl font-bold">
                MCQ/True-False part: {review.autoScore} of {review.autoTotalPoints} points
              </p>
              <p className="mt-2 flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                <Clock className="h-5 w-5" />
                Your written answers are with the admin for marking. Your final score will appear here once marking is complete.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Attempt #{review.attemptNumber} result</p>
              <p className="mt-1 text-2xl font-bold">
                {review.score} / {review.totalPoints} points · {Math.round(review.percentage)}%
              </p>
              <p className={`mt-1 flex items-center gap-1 font-medium ${review.passed ? "text-green-700 dark:text-green-400" : "text-destructive"}`}>
                {review.passed ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                {review.passed ? "You passed" : "You did not pass"} (pass mark {review.passingScore}%)
              </p>
            </>
          )}
          {attemptsRemaining > 0 && (
            <Button asChild className="mt-4" variant="outline">
              <Link href={`/student/quizzes/${quizId}`}>Try again ({attemptsRemaining} attempt{attemptsRemaining === 1 ? "" : "s"} left)</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Review your answers</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-4">
            {review.questions.map((q, i) => (
              <li key={q.id} className="rounded-md border border-border p-4">
                <p className="font-medium">
                  {i + 1}. {q.question}{" "}
                  <span className="text-sm text-muted-foreground">
                    ({q.points} pt{q.points === 1 ? "" : "s"}{q.isAuto ? "" : " · written answer"})
                  </span>
                </p>
                {q.isAuto ? (
                  <>
                    <p className="mt-2 flex items-center gap-1 text-sm">
                      {q.isCorrect ? (
                        <CheckCircle2 className="h-4 w-4 text-green-700 dark:text-green-400" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      Your answer: <span className="font-medium">{q.yourAnswer ?? "— (not answered)"}</span>
                    </p>
                    {!q.isCorrect && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Correct answer: <span className="font-medium text-foreground">{q.correctAnswer}</span>
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-muted-foreground">Your answer:</p>
                    <p className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                      {q.yourAnswer ?? "— (not answered)"}
                    </p>
                    {q.awardedPoints !== null ? (
                      <p className="mt-2 text-sm">
                        Awarded: <span className="font-medium">{q.awardedPoints} / {q.points} points</span>
                      </p>
                    ) : (
                      <p className="mt-2 flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
                        <Clock className="h-4 w-4" /> Awaiting marking
                      </p>
                    )}
                  </>
                )}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function StudentQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { student } = await requireStudentSelf();
  const { id } = await params;
  const sp = await searchParams;

  const quiz = await getQuizForStudentAttempt(id, student.id);
  if (!quiz) notFound();

  // Just submitted (or a specific past attempt): show that attempt's result.
  if (sp.attempt) {
    const review = await getStudentAttemptReview(id, student.id, sp.attempt);
    if (review) {
      return (
        <>
          <PageHeader title={quiz.title} description={quiz.courseTitle} />
          <ReviewView quizId={id} review={review} attemptsRemaining={quiz.attemptsRemaining} />
        </>
      );
    }
  }

  // Attempts left: show the attempt form. Correct answers are never part
  // of this payload — the DTO strips them by construction.
  if (quiz.attemptsRemaining > 0) {
    return (
      <>
        <PageHeader
          title={quiz.title}
          description={`${quiz.courseTitle}${quiz.moduleTitle ? ` · ${quiz.moduleTitle}` : ""}`}
        />
        <Card className="mb-4">
          <CardContent className="flex flex-wrap gap-x-6 gap-y-1 pt-6 text-sm text-muted-foreground">
            <span>Pass mark: <span className="font-medium text-foreground">{quiz.passingScore}%</span></span>
            <span>Attempts: <span className="font-medium text-foreground">{quiz.myAttemptCount} of {quiz.attemptsAllowed} used</span></span>
            {quiz.timeLimit !== null && (
              <span>Suggested time: <span className="font-medium text-foreground">{quiz.timeLimit} minutes</span></span>
            )}
          </CardContent>
        </Card>
        {quiz.description && (
          <Card className="mb-4"><CardContent className="whitespace-pre-wrap pt-6 text-sm">{quiz.description}</CardContent></Card>
        )}
        <AttemptForm quiz={quiz} />
      </>
    );
  }

  // No attempts left: show the latest result and review.
  const review = await getStudentAttemptReview(id, student.id);
  if (!review) notFound();
  return (
    <>
      <PageHeader title={quiz.title} description={quiz.courseTitle} />
      <ReviewView quizId={id} review={review} attemptsRemaining={0} />
    </>
  );
}
