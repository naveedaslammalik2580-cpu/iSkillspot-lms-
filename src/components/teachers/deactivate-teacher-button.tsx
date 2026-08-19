"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deactivateTeacher } from "@/lib/actions/teachers";
import { Button } from "@/components/ui/button";
import { Power } from "lucide-react";

export function DeactivateTeacherButton({ teacherId, isActive }: { teacherId: string; isActive: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isActive) return null;

  async function onClick() {
    if (!window.confirm("Deactivate this teacher? They will no longer be able to log in.")) return;
    setBusy(true);
    setError(null);
    const res = await deactivateTeacher(teacherId);
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="destructive" size="sm" onClick={onClick} disabled={busy}>
        <Power className="h-4 w-4" /> {busy ? "Deactivating…" : "Deactivate"}
      </Button>
      {error && <p className="max-w-xs text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}
