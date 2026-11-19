import Link from "next/link";
import { requireStudentSelf } from "@/lib/auth/guards";
import { getQuizzesForStudent } from "@/lib/data/quizzes";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";

export default async function StudentQuizzesPage() {
  const { student } = await requireStudentSelf();
  const quizzes = await getQuizzesForStudent(student.id);

  return (
    <>
      <PageHeader title="Quizzes" description="Quizzes for your enrolled courses" />
      {quizzes.length === 0 ? (
        <EmptyState title="No quizzes available yet." hint="Published quizzes for your courses will appear here." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Quiz</th>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Questions</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Your best</th>
                  <th className="px-4 py-3 font-medium">Attempts left</th>
                </tr>
              </thead>
              <tbody>
                {quizzes.map((q) => (
                  <tr key={q.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/student/quizzes/${q.id}`} className="font-medium text-primary hover:underline">
                        {q.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {q.courseTitle}
                      {q.moduleTitle ? <span className="text-muted-foreground"> · {q.moduleTitle}</span> : null}
                    </td>
                    <td className="px-4 py-3">{q.questionCount}</td>
                    <td className="px-4 py-3">
                      {q.myAttemptCount === 0 ? (
                        "Not attempted"
                      ) : q.latestInProgress ? (
                        <span className="font-medium text-primary">In progress</span>
                      ) : q.latestPendingMarking ? (
                        <span className="font-medium text-amber-600 dark:text-amber-400">Pending marking</span>
                      ) : (
                        <span className={q.latestPassed ? "font-medium text-green-700 dark:text-green-400" : "font-medium text-destructive"}>
                          {q.latestPassed ? "Passed" : "Failed"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {q.bestPercentage !== null ? `${Math.round(q.bestPercentage)}% (pass mark ${q.passingScore}%)` : "—"}
                    </td>
                    <td className="px-4 py-3">{q.attemptsRemaining}</td>
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
