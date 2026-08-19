"use client";

import { useRouter } from "next/navigation";
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

  function apply(next: Record<string, string | undefined>) {
    const merged = { ...current, ...next, page: "1" };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    router.push(`/admin/students?${params.toString()}`);
  }

  const selectedCourse = courses.find((c) => c.id === current.courseId);

  return (
    <Card className="p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Search name, ID, email, phone…"
          defaultValue={current.q ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply({ q: (e.target as HTMLInputElement).value });
          }}
        />
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={current.courseId ?? ""}
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
          onChange={(e) => apply({ batchId: e.target.value || undefined })}
          disabled={!selectedCourse}
        >
          <option value="">All batches</option>
          {selectedCourse?.batches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={current.status ?? ""}
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
