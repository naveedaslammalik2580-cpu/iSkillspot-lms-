"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  createModule,
  updateModule,
  deleteModule,
  createLesson,
  updateLesson,
  deleteLesson,
  createResource,
  deleteResource,
} from "@/lib/actions/course-content";
import type { CourseContent } from "@/lib/data/learning";

type RunResult = { ok: boolean; error?: string };

function useRunner() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(action: () => Promise<RunResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }
  return { run, isPending, error };
}

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const areaCls = "w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm";

function ModuleForm({
  courseId,
  module,
  onDone,
}: {
  courseId: string;
  module?: CourseContent["modules"][number];
  onDone?: () => void;
}) {
  const { run, isPending, error } = useRunner();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = {
      title: String(fd.get("title") ?? ""),
      description: String(fd.get("description") ?? "") || undefined,
      order: Number(fd.get("order") ?? 0),
    };
    run(async () => {
      const r = module ? await updateModule(module.id, input) : await createModule(courseId, input);
      if (r.ok) onDone?.();
      return r;
    });
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_90px]">
        <Field label="Module title">
          <Input name="title" required defaultValue={module?.title ?? ""} placeholder="e.g. Getting started" />
        </Field>
        <Field label="Order">
          <Input name="order" type="number" min={0} max={999} defaultValue={module?.order ?? 0} />
        </Field>
      </div>
      <Field label="Description (optional)">
        <textarea name="description" rows={2} className={areaCls} defaultValue={module?.description ?? ""} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {module ? "Save module" : "Add module"}
        </Button>
        <ErrorNote error={error} />
      </div>
    </form>
  );
}

function LessonForm({
  moduleId,
  lesson,
  onDone,
}: {
  moduleId: string;
  lesson?: CourseContent["modules"][number]["lessons"][number];
  onDone?: () => void;
}) {
  const { run, isPending, error } = useRunner();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = {
      title: String(fd.get("title") ?? ""),
      description: String(fd.get("description") ?? "") || undefined,
      content: String(fd.get("content") ?? "") || undefined,
      videoUrl: String(fd.get("videoUrl") ?? "") || undefined,
      duration: String(fd.get("duration") ?? "") || undefined,
      order: Number(fd.get("order") ?? 0),
      isPublished: fd.get("isPublished") === "on",
    };
    run(async () => {
      const r = lesson ? await updateLesson(lesson.id, input) : await createLesson(moduleId, input);
      if (r.ok) onDone?.();
      return r;
    });
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_90px]">
        <Field label="Lesson title">
          <Input name="title" required defaultValue={lesson?.title ?? ""} placeholder="e.g. Introduction" />
        </Field>
        <Field label="Order">
          <Input name="order" type="number" min={0} max={999} defaultValue={lesson?.order ?? 0} />
        </Field>
      </div>
      <Field label="Short description (optional)">
        <Input name="description" defaultValue={lesson?.description ?? ""} />
      </Field>
      <Field label="Lesson content — plain text (optional)">
        <textarea name="content" rows={6} className={areaCls} defaultValue={lesson?.content ?? ""} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Video URL — YouTube, Vimeo or direct file (optional)">
          <Input name="videoUrl" type="url" placeholder="https://…" defaultValue={lesson?.videoUrl ?? ""} />
        </Field>
        <Field label="Duration label (optional)">
          <Input name="duration" placeholder="e.g. 12 min" defaultValue={lesson?.duration ?? ""} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublished" defaultChecked={lesson?.isPublished ?? false} className="h-4 w-4" />
        Published (visible to enrolled students)
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {lesson ? "Save lesson" : "Add lesson"}
        </Button>
        <ErrorNote error={error} />
      </div>
    </form>
  );
}

function ResourceForm({ lessonId }: { lessonId: string }) {
  const { run, isPending, error } = useRunner();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const input = {
      title: String(fd.get("title") ?? ""),
      fileUrl: String(fd.get("fileUrl") ?? ""),
      fileType: String(fd.get("fileType") ?? "") || undefined,
    };
    run(async () => {
      const r = await createResource(lessonId, input);
      if (r.ok) form.reset();
      return r;
    });
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_1.6fr_90px_auto]">
        <Input name="title" required placeholder="Resource title" aria-label="Resource title" />
        <Input name="fileUrl" required placeholder="https://… or storage key" aria-label="File URL or storage key" />
        <Input name="fileType" placeholder="PDF" aria-label="File type" />
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
        </Button>
      </div>
      <ErrorNote error={error} />
    </form>
  );
}

function DeleteButton({
  label,
  disabledReason,
  confirmText,
  onDelete,
}: {
  label: string;
  disabledReason?: string;
  confirmText: string;
  onDelete: () => Promise<RunResult>;
}) {
  const { run, isPending, error } = useRunner();
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending || Boolean(disabledReason)}
        title={disabledReason ?? label}
        onClick={() => {
          if (window.confirm(confirmText)) run(onDelete);
        }}
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        {label}
      </Button>
      {disabledReason ? <span className="text-xs text-muted-foreground">{disabledReason}</span> : null}
      <ErrorNote error={error} />
    </span>
  );
}

export function ContentManager({ content }: { content: CourseContent }) {
  const { course } = content;
  return (
    <div className="space-y-4">
      {content.modules.map((m, mi) => {
        const moduleBlocked =
          m.lessonCount > 0 || m.assignmentCount > 0 || m.quizCount > 0
            ? `Contains ${m.lessonCount} lesson(s), ${m.assignmentCount} assignment(s), ${m.quizCount} quiz(zes)`
            : undefined;
        return (
          <Card key={m.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">
                    <span className="text-muted-foreground">Module {mi + 1}:</span> {m.title}
                  </CardTitle>
                  {m.description ? <p className="mt-1 text-sm text-muted-foreground">{m.description}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground">Order {m.order}</p>
                </div>
                <DeleteButton
                  label="Delete module"
                  disabledReason={moduleBlocked}
                  confirmText={`Delete module "${m.title}"? This cannot be undone.`}
                  onDelete={() => deleteModule(m.id)}
                />
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-primary">Edit module</summary>
                <div className="pt-3">
                  <ModuleForm courseId={course.id} module={m} />
                </div>
              </details>
            </CardHeader>
            <CardContent className="space-y-4">
              {m.lessons.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lessons in this module yet.</p>
              ) : (
                <ul className="space-y-3">
                  {m.lessons.map((l) => (
                    <li key={l.id} className="rounded-md border border-border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {l.title}{" "}
                            <Badge variant={l.isPublished ? "success" : "warning"} className="ml-1 align-middle">
                              {l.isPublished ? "Published" : "Draft"}
                            </Badge>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Order {l.order}
                            {l.duration ? ` · ${l.duration}` : ""}
                            {l.progressCount > 0 ? ` · ${l.progressCount} student progress record(s)` : ""}
                            {l.resources.length > 0 ? ` · ${l.resources.length} resource(s)` : ""}
                          </p>
                        </div>
                        <DeleteButton
                          label="Delete lesson"
                          disabledReason={
                            l.progressCount > 0
                              ? "Has student progress — unpublish instead"
                              : undefined
                          }
                          confirmText={`Delete lesson "${l.title}"? Its resources will also be removed. This cannot be undone.`}
                          onDelete={() => deleteLesson(l.id)}
                        />
                      </div>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm font-medium text-primary">Edit lesson</summary>
                        <div className="pt-3">
                          <LessonForm moduleId={m.id} lesson={l} />
                        </div>
                      </details>
                      <div className="mt-3 space-y-2 border-t border-border pt-3">
                        {l.resources.length > 0 ? (
                          <ul className="space-y-1.5">
                            {l.resources.map((r) => (
                              <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                                <span className="min-w-0 truncate">
                                  {r.title}{" "}
                                  <span className="text-xs text-muted-foreground">
                                    {r.fileType ? `${r.fileType} · ` : ""}
                                    {r.fileUrl}
                                  </span>
                                </span>
                                <DeleteButton
                                  label="Remove"
                                  confirmText={`Remove resource "${r.title}"? The file itself is not deleted.`}
                                  onDelete={() => deleteResource(r.id)}
                                />
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <ResourceForm lessonId={l.id} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <details>
                <summary className="cursor-pointer text-sm font-medium text-primary">Add a lesson</summary>
                <div className="pt-3">
                  <LessonForm moduleId={m.id} />
                </div>
              </details>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a module</CardTitle>
        </CardHeader>
        <CardContent>
          <ModuleForm courseId={course.id} />
        </CardContent>
      </Card>
    </div>
  );
}
