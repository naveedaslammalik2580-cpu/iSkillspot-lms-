"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { recordPayment } from "@/lib/actions/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  CARD: "Card",
  ONLINE: "Online",
  OTHER: "Other",
};

export function PaymentForm({ feeId, remainingBalance }: { feeId: string; remainingBalance: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountExceedsBalance = Number(amount) > remainingBalance;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (amountExceedsBalance) {
      setError(`Amount cannot exceed the remaining balance of ${remainingBalance}.`);
      return;
    }
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await recordPayment({
      feeId,
      amount: Number(fd.get("amount") || 0),
      paidAt: String(fd.get("paidAt") || ""),
      method: fd.get("method") as never,
      reference: String(fd.get("reference") || "") || undefined,
      notes: String(fd.get("notes") || "") || undefined,
    });
    setPending(false);
    if (res.ok) {
      router.push(`/admin/fees/${feeId}`);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Payment details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount *</Label>
            <Input
              id="amount" name="amount" type="number" min="0.01" step="0.01" required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Balance remaining: {remainingBalance}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="paidAt">Payment date *</Label>
            <Input id="paidAt" name="paidAt" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="method">Method *</Label>
            <select
              id="method" name="method" required
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {Object.entries(METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reference">Reference</Label>
            <Input id="reference" name="reference" maxLength={200} placeholder="Transaction / cheque #" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" name="notes" maxLength={1000} />
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending || amountExceedsBalance}>
          {pending ? "Recording…" : "Record payment"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href={`/admin/fees/${feeId}`}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
