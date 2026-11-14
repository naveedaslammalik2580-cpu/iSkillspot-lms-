"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setLessonCompleted } from "@/lib/actions/learning";

export function MarkCompleteButton({
  lessonId,
  completed,
}: {
  lessonId: string;
  completed: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setLessonCompleted(lessonId, !completed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        onClick={toggle}
        disabled={isPending}
        variant={completed ? "outline" : "default"}
        aria-pressed={completed}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : completed ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
        {completed ? "Completed — mark as incomplete" : "Mark as complete"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
