import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { getQuizzesForAdmin } from "@/lib/data/quizzes";
import { getCoursesForAdmin } from "@/lib/data/assignments";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Plus } from "lucide-react";

export default async function AdminQuizzesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("quiz.manage");
  const sp = await searchParams;

  const [quizzes, courses] = await Promise.all([
    getQuizzesForAdmin({ courseId: sp.courseId }),
    getCoursesForAdmin(),
  ]);

  return (
    <>
      <PageHeader
        title="Quizzes"
        description={`${quizzes.length} total`}
        action={
          <Button asChild>
            <Link href="/admin/quizzes/new">
              <Plus className="h-4 w-4" /> New quiz
            </Link>
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-end gap-3" method="GET">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="courseId">Course</label>
            <select
              id="courseId"
              name="courseId"
              defaultValue={sp.courseId ?? ""}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline">Filter</Button>
        </form>
      </Card>

      {quizzes.length === 0 ? (
        <EmptyState
          title="No quizzes found."
          hint="Try a different course filter, or create your first quiz."
          action={
            <Button asChild>
              <Link href="/admin/quizzes/new">New quiz</Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Questions</th>
                  <th className="px-4 py-3 font-medium">Points</th>
                  <th className="px-4 py-3 font-medium">Pass mark</th>
                  <th className="px-4 py-3 font-medium">Attempts</th>
                </tr>
              </thead>
              <tbody>
                {quizzes.map((q) => (
                  <tr key={q.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/admin/quizzes/${q.id}`} className="font-medium text-primary hover:underline">
                        {q.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {q.courseTitle}
                      {q.moduleTitle ? <span className="text-muted-foreground"> · {q.moduleTitle}</span> : null}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={q.status} /></td>
                    <td className="px-4 py-3">{q.questionCount}</td>
                    <td className="px-4 py-3">{q.totalPoints}</td>
                    <td className="px-4 py-3">{q.passingScore}%</td>
                    <td className="px-4 py-3">{q.attemptCount}</td>
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
