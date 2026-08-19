import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { getAllBatches } from "@/lib/data/batches";
import { getCoursePicker } from "@/lib/data/courses";
import { getTeacherPicker } from "@/lib/data/teachers";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { BatchStatus } from "@prisma/client";

export default async function AdminBatchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("batch.manage");
  const sp = await searchParams;

  const [batches, courses, teachers] = await Promise.all([
    getAllBatches({
      status: sp.status as BatchStatus | undefined,
      courseId: sp.courseId,
      teacherId: sp.teacherId,
      search: sp.q,
    }),
    getCoursePicker(),
    getTeacherPicker(),
  ]);

  return (
    <>
      <PageHeader
        title="Batches"
        description={`${batches.length} total`}
        action={
          <Button asChild>
            <Link href="/admin/batches/new">
              <Plus className="h-4 w-4" /> New batch
            </Link>
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-end gap-3" method="GET">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="q">Search</label>
            <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Name or code…" className="w-48" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="courseId">Course</label>
            <select
              id="courseId"
              name="courseId"
              defaultValue={sp.courseId ?? ""}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="teacherId">Teacher</label>
            <select
              id="teacherId"
              name="teacherId"
              defaultValue={sp.teacherId ?? ""}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All teachers</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.fullName}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="status">Status</label>
            <select
              id="status"
              name="status"
              defaultValue={sp.status ?? ""}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All statuses</option>
              <option value="UPCOMING">Upcoming</option>
              <option value="ONGOING">Ongoing</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <Button type="submit" variant="outline">Filter</Button>
        </form>
      </Card>

      {batches.length === 0 ? (
        <EmptyState
          title="No batches found."
          hint="Try different filters, or create your first batch."
          action={
            <Button asChild>
              <Link href="/admin/batches/new">New batch</Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Batch</th>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Teacher</th>
                  <th className="px-4 py-3 font-medium">Dates</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Enrolled</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/admin/batches/${b.id}`} className="font-medium text-primary hover:underline">
                        {b.name}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">{b.code}</div>
                    </td>
                    <td className="px-4 py-3">{b.courseTitle}</td>
                    <td className="px-4 py-3">{b.teacherName ?? "Unassigned"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.startDate ? formatDate(b.startDate) : "—"} – {b.endDate ? formatDate(b.endDate) : "—"}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-3">{b.enrolledCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
