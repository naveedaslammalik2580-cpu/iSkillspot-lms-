"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addBankItemToQuiz } from "@/lib/actions/question-bank";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Plus } from "lucide-react";

export type BankPickerItem = {
  id: string;
  question: string;
  type: string;
  points: number;
  moduleTitle: string | null;
};

function typeLabel(type: string): string {
  return type === "TRUE_FALSE" ? "True/False" : type === "SHORT_ANSWER" ? "Short answer" : "Multiple choice";
}

/**
 * "Add from Question Bank" panel on the quiz edit page. Adding COPIES
 * the bank question into this quiz — later edits or deletion of the
 * bank item never change the copy here.
 */
export function BankPicker({ quizId, items }: { quizId: string; items: BankPickerItem[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function onAdd(itemId: string) {
    setPendingId(itemId);
    setError(null);
    const res = await addBankItemToQuiz(quizId, itemId);
    setPendingId(null);
    if (res.ok) {
      setAddedIds((prev) => new Set(prev).add(itemId));
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Add from Question Bank</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Questions saved in the bank for this quiz&apos;s course. Adding one copies it into
          this quiz — the copy is independent, so later changes to the bank item will not
          affect this quiz.
        </p>
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No bank questions for this course yet.{" "}
            <Link href="/admin/quizzes/bank" className="font-medium text-primary hover:underline">
              Open the question bank
            </Link>{" "}
            to add some.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.question}</p>
                  <p className="text-xs text-muted-foreground">
                    {typeLabel(item.type)} · {item.points} pt{item.points === 1 ? "" : "s"}
                    {item.moduleTitle ? ` · ${item.moduleTitle}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={addedIds.has(item.id) ? "outline" : "default"}
                  disabled={pendingId === item.id}
                  onClick={() => onAdd(item.id)}
                >
                  {addedIds.has(item.id) ? (
                    <><Check className="h-4 w-4" /> Added</>
                  ) : (
                    <><Plus className="h-4 w-4" /> {pendingId === item.id ? "Adding…" : "Add"}</>
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
