"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gradeSubmission, reopenSubmission } from "@/lib/actions/assignments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Download } from "lucide-react";

type SubmissionFile = { storageKey: string; name: string };

export function GradingForm({
  submissionId,
  studentName,
  studentIdCode,
  maxScore,
  status,
  score,
  feedback,
  submissionText,
  submittedAt,
  files,
}: {
  submissionId: string;
  studentName: string;
  studentIdCode: string;
  maxScore: number;
  status: string;
  score: number | null;
  feedback: string | null;
  submissionText: string | null;
  submittedAt: string | null; // pre-formatted
  files: SubmissionFile[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isGraded = status === "GRADED";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await gradeSubmission({
      submissionId,
      score: Number(fd.get("score") || 0),
      feedback: String(fd.get("feedback") || "") || undefined,
    });
    setPending(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  async function onReopen() {
    setPending(true);
    setError(null);
    const res = await reopenSubmission(submissionId);
    setPending(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{studentName}</CardTitle>
            <StatusBadge status={status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="font-mono text-xs text-muted-foreground">{studentIdCode}</p>
          {submittedAt && <p className="text-sm text-muted-foreground">Submitted {submittedAt}</p>}
          {submissionText && (
            <div>
              <Label>Note from student</Label>
              <p className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm">
                {submissionText}
              </p>
            </div>
          )}
          <div>
            <Label>Files</Label>
            {files.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">No files attached.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {files.map((f) => (
                  <Button key={f.storageKey} variant="outline" size="sm" asChild>
                    <a
                      href={`/api/assignments/files?submissionId=${submissionId}&key=${encodeURIComponent(f.storageKey)}`}
                    >
                      <Download className="h-4 w-4" /> {f.name}
                    </a>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Grade</CardTitle></CardHeader>
        <CardContent>
          {isGraded ? (
            <div className="space-y-4">
              <p className="text-2xl font-bold">
                {score} / {maxScore}
              </p>
              {feedback && <p className="text-sm text-muted-foreground">{feedback}</p>}
              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
              )}
              <Button variant="outline" size="sm" onClick={onReopen} disabled={pending}>
                {pending ? "Reopening…" : "Reopen for resubmission"}
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="score">Score (out of {maxScore}) *</Label>
                  <Input
                    id="score"
                    name="score"
                    type="number"
                    min={0}
                    max={maxScore}
                    required
                    defaultValue={score ?? ""}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="feedback">Feedback</Label>
                <textarea
                  id="feedback"
                  name="feedback"
                  rows={4}
                  maxLength={5000}
                  defaultValue={feedback ?? ""}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save grade"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
