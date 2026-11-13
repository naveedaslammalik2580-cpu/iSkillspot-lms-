import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { listFees, getFeeSummary } from "@/lib/data/fees";
import { getCoursePicker } from "@/lib/data/courses";
import { getSetting } from "@/lib/settings";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { FeeStatus } from "@prisma/client";

export default async function AdminFeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("fee.manage");
  const sp = await searchParams;
  const page = Number(sp.page ?? "1");

  const [result, summary, courses, currency] = await Promise.all([
    listFees({
      status: sp.status as FeeStatus | undefined,
      courseId: sp.courseId,
      search: sp.q,
      page,
    }),
    getFeeSummary(),
    getCoursePicker(),
    getSetting("currency", "PKR"),
  ]);

  return (
    <>
      <PageHeader
        title="Fees"
        description={`${result.total} total`}
        action={
          <Button asChild>
            <Link href="/admin/fees/new">
              <Plus className="h-4 w-4" /> New fee
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total outstanding</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(summary.totalOutstanding, currency)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Paid this month</p>
          <p className="mt-1 text-2xl font-bold text-green-700">{formatCurrency(summary.paidThisMonth, currency)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Overdue fees</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{summary.overdueCount}</p>
        </Card>
      </div>

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-end gap-3" method="GET">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="q">Search</label>
            <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Student name or ID…" className="w-56" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="status">Status</label>
            <select
              id="status" name="status" defaultValue={sp.status ?? ""}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All statuses</option>
              <option value="UNPAID">Unpaid</option>
              <option value="PARTIAL">Partial</option>
              <option value="PAID">Paid</option>
              <option value="OVERDUE">Overdue</option>
              <option value="WAIVED">Waived</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="courseId">Course</label>
            <select
              id="courseId" name="courseId" defaultValue={sp.courseId ?? ""}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline">Filter</Button>
        </form>
      </Card>

      {result.rows.length === 0 ? (
        <EmptyState title="No fees found." hint="Try different filters, or create the first fee record." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Paid</th>
                  <th className="px-4 py-3 font-medium">Balance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Due date</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((f) => (
                  <tr key={f.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/admin/fees/${f.id}`} className="font-medium text-primary hover:underline">
                        {f.studentName}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">{f.studentCode}</div>
                    </td>
                    <td className="px-4 py-3">{f.courseName}</td>
                    <td className="px-4 py-3">{formatCurrency(f.finalFee, currency)}</td>
                    <td className="px-4 py-3">{formatCurrency(f.amountPaid, currency)}</td>
                    <td className="px-4 py-3 font-medium">{formatCurrency(f.remainingBalance, currency)}</td>
                    <td className="px-4 py-3"><StatusBadge status={f.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{f.dueDate ? formatDate(f.dueDate) : "—"}</td>
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
                <Link href={`/admin/fees?${params.toString()}`}>{p}</Link>
              </Button>
            );
          })}
        </div>
      )}
    </>
  );
}
