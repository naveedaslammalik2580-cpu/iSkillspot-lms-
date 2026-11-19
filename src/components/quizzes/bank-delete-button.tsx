"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteBankItem } from "@/lib/actions/question-bank";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function BankDeleteButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (!confirm("Delete this bank question? Quizzes that already copied it keep their copy.")) return;
    setPending(true);
    setError(null);
    const res = await deleteBankItem(itemId);
    setPending(false);
    if (res.ok) router.refresh();
    else setError(res.error ?? "Something went wrong.");
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={onDelete}>
        <Trash2 className="h-4 w-4" /> Delete
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </span>
  );
}
