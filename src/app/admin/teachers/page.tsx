import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { getAllTeachers } from "@/lib/data/teachers";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { Plus } from "lucide-react";
import type { AccountStatus } from "@prisma/client";

export default async function AdminTeachersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("teacher.manage");
  const sp = await searchParams;

  const teachers = await getAllTeachers({
    status: sp.status as AccountStatus | undefined,
    search: sp.q,
  });

  return (
    <>
      <PageHeader
        title="Teachers"
        description={`${teachers.length} total`}
        action={
          <Button asChild>
            <Link href="/admin/teachers/new">
              <Plus className="h-4 w-4" /> New teacher
            </Link>
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-end gap-3" method="GET">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="q">Search</label>
            <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Name or email…" className="w-56" />
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
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </div>
          <Button type="submit" variant="outline">Filter</Button>
        </form>
      </Card>

      {teachers.length === 0 ? (
        <EmptyState
          title="No teachers found."
          hint="Try different filters, or add your first teacher."
          action={
            <Button asChild>
              <Link href="/admin/teachers/new">New teacher</Link>
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
                  <th className="px-4 py-3 font-medium">Specialization</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Batches</th>
                  <th className="px-4 py-3 font-medium">Students</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/admin/teachers/${t.id}`} className="font-medium text-primary hover:underline">
                        {t.fullName}
                      </Link>
                      <div className="text-xs text-muted-foreground">{t.email}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{t.specialization ?? "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-3">{t.batchCount}</td>
                    <td className="px-4 py-3">{t.studentCount}</td>
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
