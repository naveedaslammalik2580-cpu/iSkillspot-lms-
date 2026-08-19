"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createCourse, updateCourse } from "@/lib/actions/courses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CourseForm({
  course,
}: {
  course?: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    duration: string | null;
    level: string;
    status: string;
  };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      code: String(fd.get("code") || "").toUpperCase(),
      name: String(fd.get("name") || ""),
      description: String(fd.get("description") || "") || undefined,
      duration: String(fd.get("duration") || "") || undefined,
      level: fd.get("level") as "BEGINNER" | "INTERMEDIATE" | "ADVANCED",
      status: fd.get("status") as "DRAFT" | "PUBLISHED" | "ARCHIVED",
    };

    const res = course
      ? await updateCourse({ id: course.id, ...payload })
      : await createCourse(payload);

    setPending(false);
    if (res.ok) {
      router.push(`/admin/courses/${res.courseId}`);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Course details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="code">Code *</Label>
            <Input
              id="code"
              name="code"
              required
              maxLength={20}
              defaultValue={course?.code}
              className="font-mono uppercase"
              placeholder="WD-101"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" name="name" required maxLength={200} defaultValue={course?.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="duration">Duration</Label>
            <Input
              id="duration"
              name="duration"
              maxLength={100}
              defaultValue={course?.duration ?? ""}
              placeholder="12 weeks"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="level">Level</Label>
            <select
              id="level"
              name="level"
              defaultValue={course?.level ?? "BEGINNER"}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="BEGINNER">Beginner</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="ADVANCED">Advanced</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status *</Label>
            <select
              id="status"
              name="status"
              required
              defaultValue={course?.status ?? "DRAFT"}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              rows={4}
              maxLength={5000}
              defaultValue={course?.description ?? ""}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : course ? "Save changes" : "Create course"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href={course ? `/admin/courses/${course.id}` : "/admin/courses"}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
