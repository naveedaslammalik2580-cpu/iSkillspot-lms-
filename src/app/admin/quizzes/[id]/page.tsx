import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getQuizForAdmin } from "@/lib/data/quizzes";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { QuizAdminActions } from "@/components/quizzes/quiz-admin-actions";
import { formatDate } from "@/lib/utils";
import { CheckCircle2, Pencil } from "lucide-react";

export default async function AdminQuizDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("quiz.manage");
  const { id } = await params;
  const quiz = await getQuizForAdmin(id);
  if (!quiz) notFound();

  return (
    <>
      <PageHeader
        title={quiz.title}
        description={`${quiz.courseTitle}${quiz.moduleTitle ? ` · ${quiz.moduleTitle}` : ""}`}
        action={
          <div className="flex items-start gap-2">
            <Button asChild variant="outline">
              <Link href={`/admin/quizzes/${quiz.id}/edit`}>
                <Pencil className="h-4 w-4" /> Edit & questions
              </Link>
            </Button>
            <QuizAdminActions quizId={quiz.id} status={quiz.status} questionCount={quiz.questions.length} />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Status</p><StatusBadge status={quiz.status} /></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Pass mark</p><p className="text-lg font-semibold">{quiz.passingScore}%</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Attempts allowed</p><p className="text-lg font-semibold">{quiz.attemptsAllowed}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total points</p><p className="text-lg font-semibold">{quiz.totalPoints}</p></CardContent></Card>
      </div>

      {quiz.description && (
        <Card className="mt-4"><CardContent className="whitespace-pre-wrap pt-6 text-sm">{quiz.description}</CardContent></Card>
      )}

      <Card className="mt-6">
        <CardHeader><CardTitle>Questions ({quiz.questions.length})</CardTitle></CardHeader>
        <CardContent>
          {quiz.questions.length === 0 ? (
            <EmptyState title="No questions yet." hint="Use Edit & questions to add the first question." />
          ) : (
            <ol className="space-y-4">
              {quiz.questions.map((q, i) => (
                <li key={q.id} className="rounded-md border border-border p-4">
                  <p className="font-medium">{i + 1}. {q.question} <span className="text-sm text-muted-foreground">({q.points} pt{q.points === 1 ? "" : "s"} · {q.type === "TRUE_FALSE" ? "True/False" : q.type === "SHORT_ANSWER" ? "Short answer" : "Multiple choice"})</span></p>
                  {q.type === "SHORT_ANSWER" ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Model answer (marking reference):{" "}
                      <span className="font-medium text-foreground">{q.correctAnswer ?? "— none provided —"}</span>
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm">
                      {q.options.map((opt) => (
                        <li key={opt} className={opt === q.correctAnswer ? "flex items-center gap-1 font-medium text-green-700 dark:text-green-400" : "text-muted-foreground"}>
                          {opt === q.correctAnswer && <CheckCircle2 className="h-4 w-4" />}
                          {opt}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader><CardTitle>Student attempts ({quiz.attempts.length})</CardTitle></CardHeader>
        <CardContent>
          {quiz.attempts.length === 0 ? (
            <EmptyState title="No attempts yet." hint="Attempts will appear here once students take this quiz." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Attempt</th>
                    <th className="px-4 py-3 font-medium">Score</th>
                    <th className="px-4 py-3 font-medium">%</th>
                    <th className="px-4 py-3 font-medium">Result</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {quiz.attempts.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/quizzes/${quiz.id}/attempts/${a.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {a.studentName}
                        </Link>{" "}
                        <span className="text-muted-foreground">({a.studentCode})</span>
                      </td>
                      <td className="px-4 py-3">#{a.attemptNumber}</td>
                      <td className="px-4 py-3">{a.score} / {quiz.totalPoints}</td>
                      <td className="px-4 py-3">{Math.round(a.percentage)}%</td>
                      <td className="px-4 py-3">
                        {a.pendingMarking ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={a.passed ? "font-medium text-green-700 dark:text-green-400" : "font-medium text-destructive"}>
                            {a.passed ? "Passed" : "Failed"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {a.pendingMarking ? (
                          <span className="font-medium text-amber-600 dark:text-amber-400">Pending marking</span>
                        ) : (
                          <span className="text-muted-foreground">Final</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{a.completedAt ? formatDate(a.completedAt) : "—"}</td>
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
