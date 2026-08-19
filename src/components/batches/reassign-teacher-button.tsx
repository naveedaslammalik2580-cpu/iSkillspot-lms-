"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { assignTeacherToBatch } from "@/lib/actions/batches";
import { Button } from "@/components/ui/button";

type TeacherOption = { id: string; fullName: string; specialization: string | null };

export function ReassignTeacherButton({
  batchId,
  currentTeacherId,
  teachers,
}: {
  batchId: string;
  currentTeacherId: string | null;
  teachers: TeacherOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [teacherId, setTeacherId] = useState(currentTeacherId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setPending(true);
    setError(null);
    const res = await assignTeacherToBatch(batchId, teacherId || null);
    setPending(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  function onCancel() {
    setEditing(false);
    setTeacherId(currentTeacherId ?? "");
    setError(null);
  }

  if (!editing) {
    return (
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        Reassign
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <select
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Unassigned</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{t.fullName}</option>
          ))}
        </select>
        <Button size="sm" onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
