"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startQuizAttempt } from "@/lib/actions/quizzes";
import { Button } from "@/components/ui/button";
import { PlayCircle } from "lucide-react";

/**
 * Start button for a TIMED quiz. Starting creates the attempt and starts
 * the server-side clock — the student is told plainly that starting uses
 * one attempt. On success the page refreshes and renders the attempt
 * form with the countdown (the running attempt comes back in the quiz
 * DTO as inProgressAttempt).
 */
export function StartAttemptButton({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onStart() {
    setPending(true);
    setError(null);
    const res = await startQuizAttempt(quizId);
    setPending(false);
    if (res.ok) {
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={onStart} disabled={pending}>
        <PlayCircle className="h-4 w-4" />
        {pending ? "Starting…" : "Start attempt"}
      </Button>
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
