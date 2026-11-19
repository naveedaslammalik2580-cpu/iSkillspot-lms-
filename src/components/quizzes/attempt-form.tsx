"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { submitQuizAttempt } from "@/lib/actions/quizzes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Timer } from "lucide-react";

type AttemptQuiz = {
  id: string;
  questions: { id: string; question: string; type: string; options: string[]; points: number }[];
};

export type TimedAttemptInfo = {
  attemptId: string;
  /** Seconds left when the page was rendered, computed by the SERVER
   *  from startedAt + timeLimit. The countdown below only ticks toward
   *  that server deadline — it never extends it. */
  remainingSeconds: number;
};

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function AttemptForm({ quiz, timed }: { quiz: AttemptQuiz; timed?: TimedAttemptInfo }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Countdown state. The starting value comes from the server (see
  // TimedAttemptInfo); a ref pins it so re-renders can't reset the clock.
  const initialRemaining = useRef(timed?.remainingSeconds ?? null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(initialRemaining.current);
  const formRef = useRef<HTMLFormElement>(null);
  const autoSubmitted = useRef(false);

  useEffect(() => {
    if (initialRemaining.current === null) return;
    const endAt = Date.now() + initialRemaining.current * 1000;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(id);
        // Auto-submit with whatever is answered. The server re-checks
        // the real deadline (plus grace) when this lands.
        if (!autoSubmitted.current) {
          autoSubmitted.current = true;
          formRef.current?.requestSubmit();
        }
      }
    }, 250);
    return () => clearInterval(id);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await submitQuizAttempt({
      quizId: quiz.id,
      attemptId: timed?.attemptId,
      answers,
    });
    setPending(false);
    if (res.ok) {
      router.push(`/student/quizzes/${quiz.id}?attempt=${res.attemptId}`);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  const answered = Object.values(answers).filter((v) => v.trim() !== "").length;
  const lastMinute = secondsLeft !== null && secondsLeft <= 60;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      {timed && secondsLeft !== null && (
        <div
          role="timer"
          aria-label="Time remaining"
          className={`sticky top-2 z-10 flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium shadow-sm ${
            lastMinute
              ? "border-destructive/50 bg-destructive/10 text-destructive"
              : "border-border bg-background"
          }`}
        >
          <Timer className="h-4 w-4" />
          Time remaining: <span className="tabular-nums">{formatClock(secondsLeft)}</span>
          {lastMinute && (
            <span className="font-normal">
              — time is almost up; your answers are submitted automatically at zero.
            </span>
          )}
        </div>
      )}

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
