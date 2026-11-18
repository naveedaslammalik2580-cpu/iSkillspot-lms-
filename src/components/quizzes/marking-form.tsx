"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markQuizAttempt } from "@/lib/actions/quizzes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, XCircle } from "lucide-react";

export type MarkingQuestion = {
  id: string;
  question: string;
  type: string;
  options: string[];
  points: number;
  correctAnswer: string | null;
  yourAnswer: string | null;
  isAuto: boolean;
  isCorrect: boolean | null;
  earnedPoints: number | null;
  awardedPoints: number | null;
};

export function MarkingForm({
  quizId,
  attemptId,
  questions,
}: {
  quizId: string;
  attemptId: string;
  questions: MarkingQuestion[];
}) {
  const router = useRouter();
  const written = questions.filter((q) => !q.isAuto);
  const [awarded, setAwarded] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const q of written) {
      if (q.awardedPoints !== null) init[q.id] = String(q.awardedPoints);
    }
    return init;
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSavedNote(null);

    const payload: Record<string, number> = {};
    for (const q of written) {
      const raw = (awarded[q.id] ?? "").trim();
      if (raw === "") continue; // leave unmarked
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > q.points) {
        setPending(false);
        setError(`Points for "${q.question}" must be between 0 and ${q.points}.`);
        return;
      }
      payload[q.id] = value;
    }

    const res = await markQuizAttempt({ quizId, attemptId, awarded: payload });
    setPending(false);
    if (res.ok) {
      setSavedNote(
        res.pendingMarking
          ? "Saved — some written answers are still unmarked, so this attempt is still pending."
          : "Marking complete — the final result is saved and the student has been notified."
      );
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-4">
      {questions.map((q, i) => (
        <Card key={q.id}>
          <CardContent className="space-y-3 pt-6">
            <p className="font-medium">
              {i + 1}. {q.question}{" "}
              <span className="text-sm text-muted-foreground">
                ({q.points} pt{q.points === 1 ? "" : "s"} ·{" "}
                {q.isAuto ? (q.type === "TRUE_FALSE" ? "True/False" : "Multiple choice") : "Short answer"})
              </span>
            </p>

            {q.isAuto ? (
              <>
                <p className="flex items-center gap-1 text-sm">
                  {q.isCorrect ? (
                    <CheckCircle2 className="h-4 w-4 text-green-700 dark:text-green-400" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  Student answer: <span className="font-medium">{q.yourAnswer ?? "— (not answered)"}</span>
                  <span className="text-muted-foreground">
                    · earned {q.earnedPoints ?? 0} / {q.points}
                  </span>
                </p>
                {!q.isCorrect && (
                  <p className="text-sm text-muted-foreground">
                    Correct answer: <span className="font-medium text-foreground">{q.correctAnswer}</span>
                  </p>
                )}
              </>
            ) : (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">Student answer</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                    {q.yourAnswer ?? "— (not answered)"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Model answer (marking reference)</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{q.correctAnswer ?? "— none provided —"}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`award-${q.id}`}>Points awarded (0–{q.points})</Label>
                  <Input
                    id={`award-${q.id}`}
                    type="number"
                    min={0}
                    max={q.points}
                    step="0.01"
                    value={awarded[q.id] ?? ""}
                    onChange={(e) => setAwarded({ ...awarded, [q.id]: e.target.value })}
                    placeholder="Not marked yet"
                    className="w-32"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ))}

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {savedNote && (
        <p className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">{savedNote}</p>
      )}

      {written.length > 0 && (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save marking"}
        </Button>
      )}
    </form>
  );
}
