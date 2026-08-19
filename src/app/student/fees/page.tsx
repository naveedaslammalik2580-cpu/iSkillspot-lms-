import { requireStudentSelf } from "@/lib/auth/guards";
import { getFeesForStudent } from "@/lib/data/fees";
import { getSetting } from "@/lib/settings";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function StudentFeesPage() {
  const { student } = await requireStudentSelf();

  const [fees, currency] = await Promise.all([
    getFeesForStudent(student.id),
    getSetting("currency", "PKR"),
  ]);

  const totalOutstanding = fees.reduce((sum, f) => sum + f.remainingBalance, 0);
  const totalPaid = fees.reduce((sum, f) => sum + f.amountPaid, 0);

  return (
    <>
      <PageHeader title="Fees" description="Your fees — this shows only your own data, enforced server-side." />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total paid</p>
          <p className="mt-1 text-2xl font-bold text-green-700">{formatCurrency(totalPaid, currency)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Outstanding balance</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(totalOutstanding, currency)}</p>
        </Card>
      </div>

      {fees.length === 0 ? (
        <EmptyState title="No fees on record." hint="You have no fee entries yet." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Paid</th>
                  <th className="px-4 py-3 font-medium">Balance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Due date</th>
                </tr>
              </thead>
              <tbody>
                {fees.map((f) => (
                  <tr key={f.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{f.courseName}</td>
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
    </>
  );
}
