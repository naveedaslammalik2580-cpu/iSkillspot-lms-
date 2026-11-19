"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createQuiz, updateQuiz } from "@/lib/actions/quizzes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CourseOption = { id: string; title: string; modules: { id: string; title: string }[] };

export function QuizForm({
  courses,
  quiz,
}: {
  courses: CourseOption[];
  /** Present only in edit mode. Course/module are fixed after creation. */
  quiz?: {
    id: string;
    courseTitle: string;
    moduleTitle: string | null;
    title: string;
    description: string | null;
    passingScore: number;
    attemptsAllowed: number;
    timeLimit: number | null;
  };
}) {
  const router = useRouter();
  const [courseId, setCourseId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modules = courses.find((c) => c.id === courseId)?.modules ?? [];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const common = {
      title: String(fd.get("title") || ""),
      description: String(fd.get("description") || "") || undefined,
      passingScore: Number(fd.get("passingScore") || 70),
      attemptsAllowed: Number(fd.get("attemptsAllowed") || 1),
      timeLimit: String(fd.get("timeLimit") || "") ? Number(fd.get("timeLimit")) : undefined,
    };
    const res = quiz
      ? await updateQuiz({ id: quiz.id, ...common })
      : await createQuiz({
          courseId: String(fd.get("courseId") || ""),
          moduleId: String(fd.get("moduleId") || "") || undefined,
          ...common,
        });
    setPending(false);
    if (res.ok) {
      // After creating, go to the editor to add questions; after editing, back to detail.
      router.push(quiz ? `/admin/quizzes/${res.quizId}` : `/admin/quizzes/${res.quizId}/edit`);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Quiz details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" name="title" required defaultValue={quiz?.title} maxLength={200} />
          </div>

          {quiz ? (
            <>
              <div className="space-y-2">
                <Label>Course</Label>
                <Input value={quiz.courseTitle} disabled readOnly />
              </div>
              <div className="space-y-2">
                <Label>Module</Label>
                <Input value={quiz.moduleTitle ?? "— (whole course)"} disabled readOnly />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="courseId">Course *</Label>
                <select
                  id="courseId"
                  name="courseId"
                  required
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="" disabled>Select a course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="moduleId">Module (optional)</Label>
                <select
                  id="moduleId"
                  name="moduleId"
                  disabled={!courseId}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Whole course</option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={quiz?.description ?? ""}
              maxLength={10000}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="passingScore">Passing score (%) *</Label>
            <Input id="passingScore" name="passingScore" type="number" min={0} max={100} required defaultValue={quiz?.passingScore ?? 70} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="attemptsAllowed">Attempts allowed *</Label>
            <Input id="attemptsAllowed" name="attemptsAllowed" type="number" min={1} max={20} required defaultValue={quiz?.attemptsAllowed ?? 1} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="timeLimit">Time limit (minutes, optional)</Label>
            <Input id="timeLimit" name="timeLimit" type="number" min={1} max={600} defaultValue={quiz?.timeLimit ?? ""} placeholder="No limit" />
            <p className="text-xs text-muted-foreground">Enforced: the countdown starts when the student starts the attempt (never before), and the attempt is submitted automatically at zero.</p>
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : quiz ? "Save changes" : "Create quiz & add questions"}
        </Button>
      </div>
    </form>
  );
}
