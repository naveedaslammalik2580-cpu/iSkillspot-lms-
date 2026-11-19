import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { getBankItems } from "@/lib/data/question-bank";
import { getCoursesForAdmin } from "@/lib/data/assignments";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BankDeleteButton } from "@/components/quizzes/bank-delete-button";
import { ArrowLeft, CheckCircle2, Pencil, Plus } from "lucide-react";

function typeLabel(type: string): string {
  return type === "TRUE_FALSE" ? "True/False" : type === "SHORT_ANSWER" ? "Short answer" : "Multiple choice";
}

export default async function QuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("quiz.manage");
  const sp = await searchParams;

  const [items, courses] = await Promise.all([
    getBankItems({ courseId: sp.courseId || undefined, moduleId: sp.moduleId || undefined }),
    getCoursesForAdmin(),
  ]);
  const modules = courses.find((c) => c.id === sp.courseId)?.modules ?? [];

  return (
    <>
      <PageHeader
        title="Question Bank"
        description={`${items.length} reusable question${items.length === 1 ? "" : "s"} — adding one to a quiz copies it; the copy is independent of the bank.`}
        action={
          <div className="flex items-start gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/quizzes">
                <ArrowLeft className="h-4 w-4" /> Quizzes
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/quizzes/bank/new">
                <Plus className="h-4 w-4" /> New bank question
              </Link>
            </Button>
          </div>
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
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="moduleId">Module</label>
            <select
              id="moduleId"
              name="moduleId"
              defaultValue={sp.moduleId ?? ""}
              disabled={!sp.courseId}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All modules</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline">Filter</Button>
        </form>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          title="No bank questions found."
          hint="Try a different filter, or add the first reusable question."
          action={
            <Button asChild>
              <Link href="/admin/quizzes/bank/new">New bank question</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{item.question}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {typeLabel(item.type)} · {item.points} pt{item.points === 1 ? "" : "s"} ·{" "}
                      {item.courseTitle}
                      {item.moduleTitle ? ` · ${item.moduleTitle}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/quizzes/bank/${item.id}/edit`}>
                        <Pencil className="h-4 w-4" /> Edit
                      </Link>
                    </Button>
                    <BankDeleteButton itemId={item.id} />
                  </div>
                </div>
                {item.type === "SHORT_ANSWER" ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Model answer (marking reference):{" "}
                    <span className="font-medium text-foreground">{item.correctAnswer ?? "— none provided —"}</span>
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {item.options.map((opt) => (
                      <li
                        key={opt}
                        className={
                          opt === item.correctAnswer
                            ? "flex items-center gap-1 font-medium text-green-700 dark:text-green-400"
                            : "text-muted-foreground"
                        }
                      >
                        {opt === item.correctAnswer && <CheckCircle2 className="h-4 w-4" />}
                        {opt}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
