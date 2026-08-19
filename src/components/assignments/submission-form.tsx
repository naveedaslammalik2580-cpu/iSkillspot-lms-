"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOrUpdateSubmission } from "@/lib/actions/assignments";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Upload } from "lucide-react";

type SubmissionFile = { storageKey: string; name: string };

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

export function SubmissionForm({
  assignmentId,
  submissionId,
  status,
  score,
  feedback,
  submissionText,
  files,
  maxScore,
}: {
  assignmentId: string;
  submissionId: string | null;
  status: string | null; // null = not submitted yet
  score: number | null;
  feedback: string | null;
  submissionText: string | null;
  files: SubmissionFile[];
  maxScore: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const isGraded = status === "GRADED";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);

    const fd = new FormData(e.currentTarget);
    const fileList = fd.getAll("files") as File[];
    const realFiles = fileList.filter((f) => f instanceof File && f.size > 0);

    // Client-side rejection for fast feedback — the server re-checks both
    // limits authoritatively regardless.
    for (const f of realFiles) {
      if (f.size > MAX_FILE_BYTES) {
        setPending(false);
        setError(`"${f.name}" is larger than 50MB.`);
        return;
      }
    }
    const total = realFiles.reduce((sum, f) => sum + f.size, 0);
    if (total > MAX_TOTAL_BYTES) {
      setPending(false);
      setError("Total upload size exceeds 200MB.");
      return;
    }

    const res = await createOrUpdateSubmission({
      assignmentId,
      submissionText: String(fd.get("submissionText") || "") || undefined,
      files: realFiles,
    });
    setPending(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  if (isGraded) {
    return (
      <Card>
        <CardHeader><CardTitle>Your submission</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-2xl font-bold">
            {score} / {maxScore}
          </p>
          {feedback && <p className="text-sm text-muted-foreground">{feedback}</p>}
          {submissionText && (
            <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm">
              {submissionText}
            </p>
          )}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
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
          <p className="text-xs text-muted-foreground">
            This submission is graded and locked. Contact your teacher if it needs to be reopened.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>{submissionId ? "Update your submission" : "Submit"}</CardTitle></CardHeader>
      <CardContent>
        {files.length > 0 && (
          <div className="mb-4">
            <Label>Current files</Label>
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
          </div>
        )}
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="files">Files {files.length > 0 && "(uploading replaces all current files)"}</Label>
            <input
              id="files"
              name="files"
              type="file"
              multiple
              className="block w-full text-sm file:mr-4 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-2 file:text-sm"
            />
            <p className="text-xs text-muted-foreground">Max 50MB per file, 200MB total.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="submissionText">Note (optional)</Label>
            <textarea
              id="submissionText"
              name="submissionText"
              rows={4}
              maxLength={10000}
              defaultValue={submissionText ?? ""}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}
          {saved && !error && (
            <p className="rounded-md bg-green-600/10 px-3 py-2 text-sm text-green-700">Submission saved.</p>
          )}
          <Button type="submit" disabled={pending}>
            <Upload className="h-4 w-4" /> {pending ? "Submitting…" : submissionId ? "Update submission" : "Submit"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
