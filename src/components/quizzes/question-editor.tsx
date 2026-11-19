"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addQuestion, updateQuestion, deleteQuestion, moveQuestion } from "@/lib/actions/quizzes";
import { saveQuizQuestionToBank } from "@/lib/actions/question-bank";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Library, Trash2 } from "lucide-react";

type QuestionData = {
  id: string;
  question: string;
  type: string;
  options: string[];
  correctAnswer: string | null;
  points: number;
  order: number;
};

/** The editable question fields. Exported (with QuestionFields below)
 *  so the question-bank form edits questions through the exact same UI
 *  and field semantics as the quiz editor. */
export type Draft = {
  question: string;
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";
  options: string[];
  /** Correct option text (MCQ / True-False), or the model answer used
   *  as a marking reference for Short answer questions. */
  correctAnswer: string;
  points: number;
};

const emptyDraft = (): Draft => ({
  question: "",
  type: "MULTIPLE_CHOICE",
  options: ["", "", "", ""],
  correctAnswer: "",
  points: 1,
});

export function QuestionFields({
  draft,
  setDraft,
  prefix,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  prefix: string;
}) {
  return (
    <div className="grid gap-4">
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-question`}>Question *</Label>
        <Input
          id={`${prefix}-question`}
          value={draft.question}
          onChange={(e) => setDraft({ ...draft, question: e.target.value })}
          required
          maxLength={2000}
        />
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-type`}>Type</Label>
          <select
            id={`${prefix}-type`}
            value={draft.type}
            onChange={(e) => {
              const type = e.target.value as Draft["type"];
              setDraft({
                ...draft,
                type,
                options:
                  type === "TRUE_FALSE"
                    ? ["True", "False"]
                    : type === "SHORT_ANSWER"
                      ? []
                      : draft.options.length === 4
                        ? draft.options
                        : ["", "", "", ""],
                correctAnswer: "",
              });
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="MULTIPLE_CHOICE">Multiple choice</option>
            <option value="TRUE_FALSE">True / False</option>
            <option value="SHORT_ANSWER">Short answer (written)</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-points`}>Points *</Label>
          <Input
            id={`${prefix}-points`}
            type="number"
            min={1}
            max={100}
            required
            value={draft.points}
            onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) })}
            className="w-24"
          />
        </div>
      </div>

      {draft.type === "SHORT_ANSWER" ? (
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-model-answer`}>Model answer (for marking reference)</Label>
          <textarea
            id={`${prefix}-model-answer`}
            value={draft.correctAnswer}
            onChange={(e) => setDraft({ ...draft, correctAnswer: e.target.value })}
            rows={3}
            maxLength={5000}
            placeholder="Optional — shown only to whoever marks the written answers, never to students."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Students write their answer in their own words; an admin awards the points manually.
          </p>
        </div>
      ) : draft.type === "MULTIPLE_CHOICE" ? (
        <div className="space-y-2">
          <Label>Options — select the correct one *</Label>
          {draft.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${prefix}-correct`}
                aria-label={`Mark option ${i + 1} as correct`}
                checked={draft.correctAnswer !== "" && draft.correctAnswer === opt && opt !== ""}
                onChange={() => setDraft({ ...draft, correctAnswer: opt })}
              />
              <Input
                value={opt}
                placeholder={`Option ${i + 1}`}
                maxLength={500}
                onChange={(e) => {
                  const options = [...draft.options];
                  const wasCorrect = draft.correctAnswer === options[i];
                  options[i] = e.target.value;
                  setDraft({ ...draft, options, correctAnswer: wasCorrect ? e.target.value : draft.correctAnswer });
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Correct answer *</Label>
          <div className="flex gap-4">
            {["True", "False"].map((v) => (
              <label key={v} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`${prefix}-correct-tf`}
                  checked={draft.correctAnswer === v}
                  onChange={() => setDraft({ ...draft, correctAnswer: v })}
                />
                {v}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExistingQuestion({ quizId, q, isFirst, isLast }: { quizId: string; q: QuestionData; isFirst: boolean; isLast: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({
    question: q.question,
    type:
      q.type === "TRUE_FALSE"
        ? "TRUE_FALSE"
        : q.type === "SHORT_ANSWER"
          ? "SHORT_ANSWER"
          : "MULTIPLE_CHOICE",
    options:
      q.type === "TRUE_FALSE"
        ? ["True", "False"]
        : q.type === "SHORT_ANSWER"
          ? []
          : q.options.length === 4
            ? q.options
            : ["", "", "", ""],
    correctAnswer: q.correctAnswer ?? "",
    points: q.points,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bankSaved, setBankSaved] = useState(false);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true);
    setError(null);
    const res = await fn();
    setPending(false);
    if (res.ok) router.refresh();
    else setError(res.error ?? "Something went wrong.");
  }

  async function onSaveToBank() {
    setPending(true);
    setError(null);
    setBankSaved(false);
    const res = await saveQuizQuestionToBank(q.id, quizId);
    setPending(false);
    if (res.ok) setBankSaved(true);
    else setError(res.error ?? "Something went wrong.");
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <QuestionFields draft={draft} setDraft={setDraft} prefix={`q-${q.id}`} />
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {bankSaved && <p className="rounded-md bg-green-700/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">Saved a copy to the question bank.</p>}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => run(() => updateQuestion({ id: q.id, quizId, ...draft }))}
          >
            Save question
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onSaveToBank}>
            <Library className="h-4 w-4" /> Save to bank
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending || isFirst} onClick={() => run(() => moveQuestion(q.id, quizId, "up"))}>
            <ArrowUp className="h-4 w-4" /> Up
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending || isLast} onClick={() => run(() => moveQuestion(q.id, quizId, "down"))}>
            <ArrowDown className="h-4 w-4" /> Down
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              if (confirm("Delete this question?")) run(() => deleteQuestion(q.id, quizId));
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function QuestionEditor({ quizId, questions }: { quizId: string; questions: QuestionData[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await addQuestion({ quizId, ...draft });
    setPending(false);
    if (res.ok) {
      setDraft(emptyDraft());
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="space-y-6">
      {questions.map((q, i) => (
        <ExistingQuestion key={q.id} quizId={quizId} q={q} isFirst={i === 0} isLast={i === questions.length - 1} />
      ))}

      <Card>
        <CardHeader><CardTitle>Add a question</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onAdd} className="space-y-4">
            <QuestionFields draft={draft} setDraft={setDraft} prefix="new" />
            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add question"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
