import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getFeeById } from "@/lib/data/fees";
import { getSetting } from "@/lib/settings";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PaymentForm } from "@/components/payments/payment-form";
import { formatCurrency } from "@/lib/utils";

export default async function NewPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("payment.manage");
  const { id } = await params;

  const fee = await getFeeById(id);
  if (!fee) notFound();

  // Nothing left to collect — send the admin back to the fee instead of
  // showing a form that would always fail validation.
  if (fee.status === "PAID" || fee.status === "WAIVED") {
    redirect(`/admin/fees/${id}`);
  }

  const currency = await getSetting("currency", "PKR");

  return (
    <>
      <PageHeader title="Record payment" description={`${fee.studentName} · ${fee.courseName}`} />
      <Link href={`/admin/fees/${id}`} className="mb-4 inline-block text-sm text-primary hover:underline">
        ← Back to fee
      </Link>

      <Card className="mb-6">
        <CardContent className="grid grid-cols-2 gap-4 p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Total fee</p>
            <p className="font-medium">{formatCurrency(fee.finalFee, currency)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Already paid</p>
            <p className="font-medium">{formatCurrency(fee.amountPaid, currency)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Balance remaining</p>
            <p className="font-medium">{formatCurrency(fee.remainingBalance, currency)}</p>
          </div>
        </CardContent>
      </Card>

      <PaymentForm feeId={id} remainingBalance={fee.remainingBalance} />
    </>
  );
}
