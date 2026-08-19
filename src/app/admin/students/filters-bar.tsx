"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type CourseWithBatches = {
  id: string;
  title: string;
  batches: { id: string; name: string }[];
};

export function StudentFiltersBar({
  courses,
  current,
}: {
  courses: CourseWithBatches[];
  current: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function apply(next: Record<string, string | undefined>) {
    const merged = { ...current, ...next, page: "1" };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    startTransition(() => {
      router.push(`/admin/students?${params.toString()}`);
    });
  }

  const selectedCourse = courses.find((c) => c.id === current.courseId);

  return (
    <Card className="relative p-4">
      {isPending && (
        <div className="absolute right-4 top-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Filtering…
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Search name, ID, email, phone…"
          defaultValue={current.q ?? ""}
          disabled={isPending}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply({ q: (e.target as HTMLInputElement).value });
          }}
        />
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={current.courseId ?? ""}
          disabled={isPending}
          onChange={(e) => apply({ courseId: e.target.value || undefined, batchId: undefined })}
        >
          <option value="">All courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={current.batchId ?? ""}
          disabled={isPending || !selectedCourse}
          onChange={(e) => apply({ batchId: e.target.value || undefined })}
        >
          <option value="">All batches</option>
          {selectedCourse?.batches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={current.status ?? ""}
          disabled={isPending}
          onChange={(e) => apply({ status: e.target.value || undefined })}
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="COMPLETED">Completed</option>
          <option value="ON_HOLD">On hold</option>
          <option value="DROPPED">Dropped</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </div>
    </Card>
  );
}
