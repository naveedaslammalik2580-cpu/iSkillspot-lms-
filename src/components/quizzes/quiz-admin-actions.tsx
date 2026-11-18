"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setQuizStatus, deleteQuiz } from "@/lib/actions/quizzes";
import { Button } from "@/components/ui/button";

export function QuizAdminActions({ quizId, status, questionCount }: { quizId: string; status: string; questionCount: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const published = status === "PUBLISHED";

  async function toggle() {
    setPending(true);
    setError(null);
    const res = await setQuizStatus(quizId, published ? "DRAFT" : "PUBLISHED");
    setPending(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  async function remove() {
    if (!confirm("Delete this quiz? Its questions and all student attempts will also be deleted.")) return;
    setPending(true);
    setError(null);
    const res = await deleteQuiz(quizId);
    setPending(false);
    if (res.ok) {
      router.push("/admin/quizzes");
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <Button type="button" variant={published ? "outline" : "default"} disabled={pending} onClick={toggle}>
          {published ? "Unpublish" : questionCount === 0 ? "Publish (add questions first)" : "Publish"}
        </Button>
        <Button type="button" variant="destructive" disabled={pending} onClick={remove}>
          Delete quiz
        </Button>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
