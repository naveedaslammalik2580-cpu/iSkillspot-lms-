"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteBatch } from "@/lib/actions/batches";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function DeleteBatchButton({ batchId, batchName }: { batchId: string; batchName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (!window.confirm(`Delete "${batchName}"? This cannot be undone.`)) return;
    setPending(true);
    setError(null);
    const res = await deleteBatch(batchId);
    setPending(false);
    if (res.ok) {
      router.push("/admin/batches");
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="destructive" size="sm" onClick={onClick} disabled={pending}>
        <Trash2 className="h-4 w-4" /> {pending ? "Deleting…" : "Delete"}
      </Button>
      {error && <p className="max-w-xs text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}
