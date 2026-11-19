"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBankItem, updateBankItem } from "@/lib/actions/question-bank";
import { QuestionFields, type Draft } from "@/components/quizzes/question-editor";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CourseOption = { id: string; title: string; modules: { id: string; title: string }[] };

export type BankItemInitial = {
  id: string;
  courseId: string;
  moduleId: string | null;
  type: string;
  question: string;
  options: string[];
  correctAnswer: string | null;
  points: number;
};

/** Map a stored bank item to the editor's draft shape. Runs INSIDE
 *  this client component — a plain function exported from a client
 *  module cannot be called from a server component. */
function draftFromItem(item: { type: string; question: string; options: string[]; correctAnswer: string | null; points: number }): Draft {
  return {
    question: item.question,
    type:
      item.type === "TRUE_FALSE"
        ? "TRUE_FALSE"
        : item.type === "SHORT_ANSWER"
          ? "SHORT_ANSWER"
          : "MULTIPLE_CHOICE",
    options:
      item.type === "TRUE_FALSE"
        ? ["True", "False"]
        : item.type === "SHORT_ANSWER"
          ? []
          : item.options.length === 4
            ? item.options
            : ["", "", "", ""],
    correctAnswer: item.correctAnswer ?? "",
    points: item.points,
  };
}

export function BankItemForm({
  courses,
  item,
}: {
  courses: CourseOption[];
  /** Present only in edit mode. */
  item?: BankItemInitial;
}) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(item?.courseId ?? "");
  const [moduleId, setModuleId] = useState(item?.moduleId ?? "");
  const [draft, setDraft] = useState<Draft>(
    item
      ? draftFromItem(item)
      : { question: "", type: "MULTIPLE_CHOICE", options: ["", "", "", ""], correctAnswer: "", points: 1 }
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modules = courses.find((c) => c.id === courseId)?.modules ?? [];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const payload = { courseId, moduleId: moduleId || undefined, ...draft };
    const res = item
      ? await updateBankItem({ id: item.id, ...payload })
      : await createBankItem(payload);
    setPending(false);
    if (res.ok) {
      router.push("/admin/quizzes/bank");
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{item ? "Edit bank question" : "New bank question"}</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bank-course">Course *</Label>
              <select
                id="bank-course"
                required
                value={courseId}
                onChange={(e) => {
                  setCourseId(e.target.value);
                  setModuleId("");
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="" disabled>Select a course</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank-module">Module (optional)</Label>
              <select
                id="bank-module"
                value={moduleId}
                onChange={(e) => setModuleId(e.target.value)}
                disabled={!courseId}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Whole course</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>{m.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Same fields + semantics as the quiz question editor. */}
          <QuestionFields draft={draft} setDraft={setDraft} prefix="bank" />
        </CardContent>
      </Card>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : item ? "Save changes" : "Add to bank"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/admin/quizzes/bank")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
