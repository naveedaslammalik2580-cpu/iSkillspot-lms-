import Link from "next/link";
import { requireStaff } from "@/lib/auth/guards";
import { getAllAnnouncements } from "@/lib/data/announcements";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { AnnouncementAudience, PublishStatus } from "@prisma/client";

export default async function AdminAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff();
  const sp = await searchParams;

  const announcements = await getAllAnnouncements({
    status: sp.status as PublishStatus | undefined,
    audience: sp.audience as AnnouncementAudience | undefined,
    search: sp.q,
  });

  return (
    <>
      <PageHeader
        title="Announcements"
        description={`${announcements.length} total`}
        action={
          <Button asChild>
            <Link href="/admin/announcements/new">
              <Plus className="h-4 w-4" /> New announcement
            </Link>
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-end gap-3" method="GET">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="q">Search</label>
            <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Title…" className="w-56" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="status">Status</label>
            <select
              id="status" name="status" defaultValue={sp.status ?? ""}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="audience">Audience</label>
            <select
              id="audience" name="audience" defaultValue={sp.audience ?? ""}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All audiences</option>
              <option value="ALL">Everyone</option>
              <option value="STUDENTS">All students</option>
              <option value="TEACHERS">All teachers</option>
              <option value="BATCH">One batch</option>
              <option value="COURSE">One course</option>
            </select>
          </div>
          <Button type="submit" variant="outline">Filter</Button>
        </form>
      </Card>

      {announcements.length === 0 ? (
        <EmptyState
          title="No announcements found."
          hint="Try different filters, or create your first announcement."
          action={
            <Button asChild>
              <Link href="/admin/announcements/new">New announcement</Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Audience</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Published</th>
                </tr>
              </thead>
              <tbody>
                {announcements.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/admin/announcements/${a.id}`} className="font-medium text-primary hover:underline">
                        {a.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{a.audienceLabel}</td>
                    <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {a.publishedAt ? formatDate(a.publishedAt) : "—"}
                    </td>
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
