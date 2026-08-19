import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getFeeById } from "@/lib/data/fees";
import { getPaymentsForFee, getVoidedPaymentsForFee } from "@/lib/data/payments";
import { getSetting } from "@/lib/settings";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { WaiveFeeButton } from "@/components/fees/waive-fee-button";
import { DeleteFeeButton } from "@/components/fees/delete-fee-button";
import { VoidPaymentButton } from "@/components/payments/void-payment-button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CreditCard } from "lucide-react";

export default async function FeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("fee.manage");
  const { id } = await params;

  const fee = await getFeeById(id);
  if (!fee) notFound();

  const [activePayments, voidedPayments, currency] = await Promise.all([
    getPaymentsForFee(id),
    getVoidedPaymentsForFee(id),
    getSetting("currency", "PKR"),
  ]);

  const canDelete = activePayments.length === 0 && voidedPayments.length === 0;

  return (
    <>
      <PageHeader
        title={fee.studentName}
        description={`${fee.courseName} · ${fee.studentCode}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {fee.status !== "PAID" && fee.status !== "WAIVED" && (
              <Button asChild>
                <Link href={`/admin/fees/${id}/payments/new`}>
                  <CreditCard className="h-4 w-4" /> Record payment
                </Link>
              </Button>
            )}
            {fee.status !== "WAIVED" && fee.status !== "PAID" && <WaiveFeeButton feeId={id} />}
            {canDelete && <DeleteFeeButton feeId={id} />}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total fee</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(fee.finalFee, currency)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Paid</p>
          <p className="mt-1 text-xl font-bold text-green-700">{formatCurrency(fee.amountPaid, currency)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Balance</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(fee.remainingBalance, currency)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <p className="mt-1"><StatusBadge status={fee.status} /></p>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>Fee details</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Row label="Total fee (before discount)" value={formatCurrency(fee.totalFee, currency)} />
          <Row label="Discount" value={formatCurrency(fee.discount, currency)} />
          <Row label="Due date" value={fee.dueDate ? formatDate(fee.dueDate) : "—"} />
          <Row label="Description" value={fee.description ?? "—"} />
          <Row label="Created" value={formatDate(fee.createdAt)} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Payment history</CardTitle></CardHeader>
        <CardContent className="p-0">
          {activePayments.length === 0 && voidedPayments.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Method</th>
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium">Receipt</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {activePayments.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">{formatDate(p.paymentDate)}</td>
                      <td className="px-4 py-3 font-medium">{formatCurrency(p.amount, currency)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.paymentMethod ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs">{p.transactionReference ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/payments/${p.id}/receipt`} className="text-primary hover:underline">
                          View
                        </Link>
                      </td>
                      <td className="px-4 py-3"><VoidPaymentButton paymentId={p.id} /></td>
                    </tr>
                  ))}
                  {voidedPayments.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0 text-muted-foreground line-through">
                      <td className="px-4 py-3">{formatDate(p.paymentDate)}</td>
                      <td className="px-4 py-3">{formatCurrency(p.amount, currency)}</td>
                      <td className="px-4 py-3">{p.paymentMethod ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs">{p.transactionReference ?? "—"}</td>
                      <td className="px-4 py-3 no-underline text-xs">Voided</td>
                      <td className="px-4 py-3 no-underline text-xs">{p.voidReason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}
