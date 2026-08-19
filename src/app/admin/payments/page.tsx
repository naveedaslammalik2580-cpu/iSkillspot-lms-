import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { getAllPayments } from "@/lib/data/payments";
import { getSetting } from "@/lib/settings";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PaymentMethod } from "@prisma/client";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  CARD: "Card",
  ONLINE: "Online",
  OTHER: "Other",
};

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("payment.manage");
  const sp = await searchParams;

  const [payments, currency] = await Promise.all([
    getAllPayments({
      from: sp.from,
      to: sp.to,
      method: sp.method as PaymentMethod | undefined,
      search: sp.q,
    }),
    getSetting("currency", "PKR"),
  ]);

  const total = payments.reduce((sum, p) => sum + (p.voidedAt ? 0 : p.amount), 0);

  return (
    <>
      <PageHeader title="Payments" description={`${payments.length} total · ${formatCurrency(total, currency)} collected (active)`} />

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-end gap-3" method="GET">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="q">Search</label>
            <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Student name or ID…" className="w-56" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="from">From</label>
            <Input id="from" name="from" type="date" defaultValue={sp.from ?? ""} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="to">To</label>
            <Input id="to" name="to" type="date" defaultValue={sp.to ?? ""} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="method">Method</label>
            <select
              id="method" name="method" defaultValue={sp.method ?? ""}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All methods</option>
              {Object.entries(METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline">Filter</Button>
        </form>
      </Card>

      {payments.length === 0 ? (
        <EmptyState title="No payments found." hint="Try different filters, or record a payment from a fee's detail page." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-b border-border last:border-0 hover:bg-muted/40 ${p.voidedAt ? "text-muted-foreground line-through" : ""}`}
                  >
                    <td className="px-4 py-3">{formatDate(p.paymentDate)}</td>
                    <td className="px-4 py-3">
                      {p.studentName}
                      <div className="font-mono text-xs text-muted-foreground">{p.studentCode}</div>
                    </td>
                    <td className="px-4 py-3">{p.courseName}</td>
                    <td className="px-4 py-3 font-medium">{formatCurrency(p.amount, currency)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.paymentMethod ? METHOD_LABELS[p.paymentMethod] : "—"}</td>
                    <td className="px-4 py-3">{p.voidedAt ? "Voided" : "Active"}</td>
                    <td className="px-4 py-3 no-underline">
                      <Link href={`/admin/payments/${p.id}/receipt`} className="text-primary hover:underline">
                        View
                      </Link>
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
