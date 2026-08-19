"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { voidPayment } from "@/lib/actions/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ban } from "lucide-react";

export function VoidPaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    if (reason.trim().length < 10) {
      setError("Reason must be at least 10 characters.");
      return;
    }
    setPending(true);
    setError(null);
    const res = await voidPayment({ id: paymentId, reason: reason.trim() });
    setPending(false);
    if (res.ok) {
      router.refresh();
      setOpen(false);
    } else {
      setError(res.error);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Ban className="h-4 w-4" /> Void
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2 rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">Reason for voiding this payment (min 10 characters):</p>
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Duplicate entry, recorded in error"
        className="w-72"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button variant="destructive" size="sm" onClick={onConfirm} disabled={pending}>
          {pending ? "Voiding…" : "Confirm void"}
        </Button>
      </div>
    </div>
  );
}
