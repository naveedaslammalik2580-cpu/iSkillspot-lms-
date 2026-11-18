"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createAssignment, updateAssignment } from "@/lib/actions/assignments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Trash2 } from "lucide-react";

type CourseOption = { id: string; title: string; modules: { id: string; title: string }[] };

export function AssignmentForm({
  basePath,
  courses,
  assignment,
}: {
  basePath: string; // "/admin/assignments"
  courses: CourseOption[];
  /** Present only in edit mode. Course/module are fixed at creation and shown read-only here. */
  assignment?: {
    id: string;
    courseTitle: string;
    moduleTitle: string | null;
    title: string;
    description: string | null;
    instructions: string | null;
    dueDate: string; // "" or "YYYY-MM-DD"
    maxScore: number;
    taskAttachment?: { kind: "upload" | "url"; name: string; url?: string } | null;
  };
}) {
  const router = useRouter();
  const mode = assignment ? "edit" : "create";
  const [courseId, setCourseId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskFileName, setTaskFileName] = useState<string | null>(null);
  const [removeTaskFile, setRemoveTaskFile] = useState(false);

  const modules = courses.find((c) => c.id === courseId)?.modules ?? [];
  const existingTask = assignment?.taskAttachment ?? null;
  const showExistingTask = existingTask !== null && !removeTaskFile && taskFileName === null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") || "");
    const description = String(fd.get("description") || "") || undefined;
    const instructions = String(fd.get("instructions") || "") || undefined;
    const dueDate = String(fd.get("dueDate") || "") || undefined;
    const maxScore = Number(fd.get("maxScore") || 100);
    const taskFileRaw = fd.get("taskFile");
    const taskFile = taskFileRaw instanceof File && taskFileRaw.size > 0 ? taskFileRaw : undefined;
    const taskPdfUrl = String(fd.get("taskPdfUrl") || "");

    const res = assignment
      ? await updateAssignment({
          id: assignment.id,
          title,
          description,
          instructions,
          dueDate,
          maxScore,
          taskPdfUrl,
          taskFile,
          removeTaskFile,
        })
      : await createAssignment({
          courseId: String(fd.get("courseId") || ""),
          moduleId: String(fd.get("moduleId") || "") || undefined,
          title,
          description,
          instructions,
          dueDate,
          maxScore,
          taskPdfUrl: taskPdfUrl || undefined,
          taskFile,
        });

    setPending(false);
    if (res.ok) {
      router.push(`${basePath}/${res.assignmentId}`);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Assignment details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" name="title" required defaultValue={assignment?.title} maxLength={200} />
          </div>

          {!assignment ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="courseId">Course *</Label>
                <select
                  id="courseId"
                  name="courseId"
                  required
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="moduleId">Module (optional)</Label>
                <select
                  id="moduleId"
                  name="moduleId"
                  disabled={!courseId}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">No module</option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Course</Label>
                <p className="flex h-10 items-center text-sm text-muted-foreground">{assignment.courseTitle}</p>
              </div>
              <div className="space-y-2">
                <Label>Module</Label>
                <p className="flex h-10 items-center text-sm text-muted-foreground">
                  {assignment.moduleTitle ?? "No module"}
                </p>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="dueDate">Due date</Label>
            <Input id="dueDate" name="dueDate" type="date" defaultValue={assignment?.dueDate ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxScore">Max score *</Label>
            <Input
              id="maxScore"
              name="maxScore"
              type="number"
              min={1}
              max={1000}
              required
              defaultValue={assignment?.maxScore ?? 100}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              rows={3}
              maxLength={10000}
              defaultValue={assignment?.description ?? ""}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="instructions">Instructions</Label>
            <textarea
              id="instructions"
              name="instructions"
              rows={5}
              maxLength={10000}
              defaultValue={assignment?.instructions ?? ""}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Practical task PDF</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Attach the PDF that contains the practical task. Students see it on the assignment
            page and open it before submitting their work. Upload a file, or paste a link to a
            PDF hosted elsewhere — if both are given, the uploaded file is used.
          </p>

          {showExistingTask && existingTask && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
              <FileText className="h-5 w-5 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{existingTask.name}</p>
                <p className="text-xs text-muted-foreground">
                  {existingTask.kind === "upload" ? "Uploaded file" : "Linked PDF"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRemoveTaskFile(true)}
              >
                <Trash2 className="h-4 w-4" /> Remove / replace
              </Button>
            </div>
          )}
          {removeTaskFile && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              The current task file will be removed when you save — unless you upload or link a
              replacement below.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="taskFile">Upload a PDF file</Label>
            <Input
              id="taskFile"
              name="taskFile"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setTaskFileName(e.target.files?.[0]?.name ?? null)}
            />
            {taskFileName && <p className="text-xs text-muted-foreground">Selected: {taskFileName}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="taskPdfUrl">Or paste a PDF link</Label>
            <Input
              id="taskPdfUrl"
              name="taskPdfUrl"
              type="url"
              placeholder="https://example.com/task.pdf"
              maxLength={2000}
              defaultValue={existingTask?.kind === "url" ? (existingTask.url ?? "") : ""}
            />
          </div>
          <p className="text-xs text-muted-foreground">PDF only, max 50MB for uploads.</p>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Create assignment" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href={assignment ? `${basePath}/${assignment.id}` : basePath}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
