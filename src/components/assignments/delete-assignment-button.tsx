"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAssignment } from "@/lib/actions/assignments";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function DeleteAssignmentButton({
  assignmentId,
  basePath,
}: {
  assignmentId: string;
  basePath: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    const res = await deleteAssignment(assignmentId);
    setPending(false);
    if (res.ok) {
      router.push(basePath);
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
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
