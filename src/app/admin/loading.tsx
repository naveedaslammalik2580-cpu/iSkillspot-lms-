import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Default fallback for admin routes that don't have a more specific
 * loading.tsx (courses, students, teachers, batches, fees, etc.) — these are
 * almost all "PageHeader + filter bar + table" pages, so this shape covers
 * the majority case. Routes shaped differently (the dashboard) get their own
 * loading.tsx, which Next.js prefers over this one.
 */
export default function AdminSectionLoading() {
  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-2 h-4 w-28" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-24" />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border bg-muted/50 px-4 py-3">
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-4 py-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="ml-auto h-4 w-20" />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
