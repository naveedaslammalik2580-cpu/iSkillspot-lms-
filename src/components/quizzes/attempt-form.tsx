"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitQuizAttempt } from "@/lib/actions/quizzes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type AttemptQuiz = {
  id: string;
  questions: { id: string; question: string; type: string; options: string[]; points: number }[];
};

export function AttemptForm({ quiz }: { quiz: AttemptQuiz }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await submitQuizAttempt({ quizId: quiz.id, answers });
    setPending(false);
    if (res.ok) {
      router.push(`/student/quizzes/${quiz.id}?attempt=${res.attemptId}`);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  const answered = Object.values(answers).filter((v) => v.trim() !== "").length;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {quiz.questions.map((q, i) => (
        <Card key={q.id}>
          <CardContent className="pt-6">
            <p className="font-medium">
              {i + 1}. {q.question}{" "}
              <span className="text-sm text-muted-foreground">
                ({q.points} pt{q.points === 1 ? "" : "s"}{q.type === "SHORT_ANSWER" ? " · written answer" : ""})
              </span>
            </p>
            {q.type === "SHORT_ANSWER" ? (
              <textarea
                aria-label={`Your answer to question ${i + 1}`}
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                rows={5}
                maxLength={5000}
                placeholder="Write your answer here…"
                className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            ) : (
              <div className="mt-3 space-y-2">
                {q.options.map((opt) => (
                  <label key={opt} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40">
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      value={opt}
                      checked={answers[q.id] === opt}
                      onChange={() => setAnswers({ ...answers, [q.id]: opt })}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Submitting…" : "Submit quiz"}
        </Button>
        <p className="text-sm text-muted-foreground">
          {answered} of {quiz.questions.length} answered — unanswered questions score 0.
        </p>
      </div>
    </form>
  );
}
