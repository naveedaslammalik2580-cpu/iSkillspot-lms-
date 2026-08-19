import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 50;

// Audit logs are SUPER_ADMIN only (Section 3 permission matrix).
export default async function AuditLogsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole("SUPER_ADMIN");
  const sp = await searchParams;

  const where = sp.q
    ? { action: { contains: sp.q, mode: "insensitive" as const } }
    : undefined;

  const rawPage = Number.parseInt(sp.page ?? "1", 10);
  let page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const [total, logs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { username: true } } },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // A hand-edited ?page= beyond the last page — clamp and refetch instead of
  // showing an empty page.
  let displayLogs = logs;
  if (page > pages) {
    page = pages;
    displayLogs = await db.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { username: true } } },
    });
  }

  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  function pageHref(p: number) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") params.set(k, v);
    params.set("page", String(p));
    return `/admin/audit-logs?${params.toString()}`;
  }

  return (
    <>
      <PageHeader title="Audit Logs" description="Recent administrative actions" />
      {displayLogs.length === 0 ? (
        <EmptyState title="No audit logs yet." />
      ) : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Entity</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {displayLogs.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(l.timestamp)}</td>
                    <td className="px-4 py-3">{l.user?.username ?? "system"}</td>
                    <td className="px-4 py-3 font-medium">{l.action}</td>
                    <td className="px-4 py-3 text-muted-foreground">{l.entity ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{l.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              Showing {start}–{end} of {total}
            </p>
            <div className="flex items-center gap-3">
              {page <= 1 ? (
                <Button variant="outline" size="sm" disabled>Previous</Button>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link href={pageHref(page - 1)}>Previous</Link>
                </Button>
              )}
              <span className="text-sm text-muted-foreground">
                Page {page} of {pages}
              </span>
              {page >= pages ? (
                <Button variant="outline" size="sm" disabled>Next</Button>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link href={pageHref(page + 1)}>Next</Link>
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
