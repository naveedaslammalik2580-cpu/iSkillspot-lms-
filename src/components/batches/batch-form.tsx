"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBatch, updateBatch } from "@/lib/actions/batches";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CourseOption = { id: string; code: string; name: string };
type TeacherOption = { id: string; fullName: string; specialization: string | null };

export function BatchForm({
  courses,
  teachers,
  batch,
}: {
  courses: CourseOption[];
  teachers: TeacherOption[];
  batch?: {
    id: string;
    code: string;
    name: string;
    courseId: string;
    teacherId: string | null;
    startDate: string; // "" or "YYYY-MM-DD"
    endDate: string;
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
      courseId: String(fd.get("courseId") || ""),
      teacherId: String(fd.get("teacherId") || "") || undefined,
      startDate: String(fd.get("startDate") || "") || undefined,
      endDate: String(fd.get("endDate") || "") || undefined,
      status: fd.get("status") as "UPCOMING" | "ONGOING" | "COMPLETED" | "CANCELLED",
    };

    const res = batch
      ? await updateBatch({ id: batch.id, ...payload })
      : await createBatch(payload);

    setPending(false);
    if (res.ok) {
      router.push(`/admin/batches/${res.batchId}`);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Batch details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="code">Code *</Label>
            <Input
              id="code"
              name="code"
              required
              maxLength={30}
              defaultValue={batch?.code}
              className="font-mono uppercase"
              placeholder="GD-01-2026"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" name="name" required maxLength={200} defaultValue={batch?.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="courseId">Course *</Label>
            <select
              id="courseId"
              name="courseId"
              required
              defaultValue={batch?.courseId ?? ""}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="teacherId">Teacher</Label>
            <select
              id="teacherId"
              name="teacherId"
              defaultValue={batch?.teacherId ?? ""}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Unassigned</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}{t.specialization ? ` — ${t.specialization}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="startDate">Start date</Label>
            <Input id="startDate" name="startDate" type="date" defaultValue={batch?.startDate ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate">End date</Label>
            <Input id="endDate" name="endDate" type="date" defaultValue={batch?.endDate ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status *</Label>
            <select
              id="status"
              name="status"
              required
              defaultValue={batch?.status ?? "UPCOMING"}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="UPCOMING">Upcoming</option>
              <option value="ONGOING">Ongoing</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : batch ? "Save changes" : "Create batch"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href={batch ? `/admin/batches/${batch.id}` : "/admin/batches"}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
