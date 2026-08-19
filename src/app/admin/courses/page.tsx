import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { listCourses } from "@/lib/data/courses";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { FilterForm, FilterSubmitButton } from "@/components/filter-form";
import { Plus } from "lucide-react";
import type { PublishStatus } from "@prisma/client";

export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("course.manage");
  const sp = await searchParams;
  const page = Number(sp.page ?? "1");

  const result = await listCourses({
    status: sp.status as PublishStatus | undefined,
    search: sp.q,
    page,
  });

  return (
    <>
      <PageHeader
        title="Courses"
        description={`${result.total} total`}
        action={
          <Button asChild>
            <Link href="/admin/courses/new">
              <Plus className="h-4 w-4" /> New course
            </Link>
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <FilterForm action="/admin/courses" className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="q">Search</label>
            <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Name or code…" className="w-56" />
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
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
          <FilterSubmitButton />
        </FilterForm>
      </Card>

      {result.rows.length === 0 ? (
        <EmptyState
          title="No courses found."
          hint="Try different filters, or create your first course."
          action={
            <Button asChild>
              <Link href="/admin/courses/new">New course</Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Level</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Batches</th>
                  <th className="px-4 py-3 font-medium">Students</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/admin/courses/${c.id}`} className="font-medium text-primary hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{c.code}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.level.charAt(0) + c.level.slice(1).toLowerCase()}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3">{c.batchCount}</td>
                    <td className="px-4 py-3">{c.studentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {result.pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {Array.from({ length: result.pages }, (_, i) => i + 1).map((p) => {
            const params = new URLSearchParams(sp as Record<string, string>);
            params.set("page", String(p));
            return (
              <Button key={p} asChild variant={p === page ? "default" : "outline"} size="sm">
                <Link href={`/admin/courses?${params.toString()}`}>{p}</Link>
              </Button>
            );
          })}
        </div>
      )}
    </>
  );
}
