import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getPaymentById } from "@/lib/data/payments";
import { getSetting } from "@/lib/settings";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PrintReceiptButton } from "@/components/payments/print-receipt-button";
import { formatCurrency, formatDate } from "@/lib/utils";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  CARD: "Card",
  ONLINE: "Online",
  OTHER: "Other",
};

export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("payment.manage");
  const { id } = await params;

  const payment = await getPaymentById(id);
  if (!payment) notFound();

  const [instituteName, currency] = await Promise.all([
    getSetting("instituteName", "iSkillSpot"),
    getSetting("currency", "PKR"),
  ]);

  return (
    <>
      <PageHeader
        title="Payment receipt"
        description={payment.voidedAt ? "This payment has been voided." : "Official receipt"}
        action={<PrintReceiptButton />}
      />

      <Card className="mx-auto max-w-xl">
        <CardContent className="space-y-6 p-8">
          <div className="border-b border-border pb-4 text-center">
            <p className="text-lg font-bold">{instituteName}</p>
            <p className="text-sm text-muted-foreground">Payment Receipt</p>
          </div>

          {payment.voidedAt && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
              VOIDED — {payment.voidReason}
            </p>
          )}

          <div className="space-y-3 text-sm">
            <Row label="Receipt ID" value={payment.id} mono />
            <Row label="Student" value={payment.studentName} />
            <Row label="Course / fee" value={payment.feeDescription ?? payment.courseName} />
            <Row label="Amount" value={formatCurrency(payment.amount, currency)} strong />
            <Row label="Method" value={payment.paymentMethod ? METHOD_LABELS[payment.paymentMethod] : "—"} />
            <Row label="Date" value={formatDate(payment.paymentDate)} />
            <Row label="Reference" value={payment.transactionReference ?? "—"} />
            <Row label="Received by" value={payment.recordedByName ?? "—"} />
          </div>

          <p className="border-t border-border pt-4 text-center text-xs text-muted-foreground">
            This is a system-generated receipt from {instituteName}.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function Row({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${mono ? "font-mono text-xs" : ""} ${strong ? "text-base font-bold" : "font-medium"}`}>
        {value}
      </span>
    </div>
  );
}
