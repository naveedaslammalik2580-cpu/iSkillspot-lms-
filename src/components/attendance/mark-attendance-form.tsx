"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { markAttendance } from "@/lib/actions/attendance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

type BatchOption = { id: string; name: string; courseTitle: string };
type Status = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
type RosterEntry = {
  studentId: string;
  studentIdCode: string;
  fullName: string;
  status: Status | null;
  remarks: string | null;
};

const STATUSES: Status[] = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];

export function MarkAttendanceForm({
  basePath,
  batches,
  batchId,
  date,
  roster,
}: {
  basePath: string;
  batches: BatchOption[];
  batchId?: string;
  date?: string;
  roster: RosterEntry[] | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = new Date().toISOString().slice(0, 10);
  const selectedDate = date ?? today;

  // Preserves whatever's already in the URL — picking Date before Batch (or
  // vice versa) no longer drops the other param.
  const goTo = useCallback(
    (nextBatchId?: string, nextDate?: string) => {
      const params = new URLSearchParams(searchParams);
      if (nextBatchId) params.set("batchId", nextBatchId);
      else params.delete("batchId");
      if (nextDate) params.set("date", nextDate);
      else params.delete("date");
      router.push(`${basePath}?${params.toString()}`);
    },
    [router, basePath, searchParams]
  );

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="batchId">Batch</Label>
            <select
              id="batchId"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={batchId ?? ""}
              onChange={(e) => goTo(e.target.value || undefined, selectedDate)}
            >
              <option value="">Select batch</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.courseTitle} — {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              max={today}
              defaultValue={selectedDate}
              onChange={(e) => goTo(batchId, e.target.value || undefined)}
            />
          </div>
        </div>
      </Card>

      {!batchId ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Select a batch to see the roster.
        </p>
      ) : !roster ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Loading roster…
        </p>
      ) : roster.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No active students enrolled in this batch.
        </p>
      ) : (
        <RosterForm batchId={batchId} date={selectedDate} roster={roster} />
      )}
    </div>
  );
}

function RosterForm({
  batchId,
  date,
  roster,
}: {
  batchId: string;
  date: string;
  roster: RosterEntry[];
}) {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Record<string, Status>>(
    Object.fromEntries(roster.map((r) => [r.studentId, r.status ?? "PRESENT"]))
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    const entries = roster.map((r) => ({
      studentId: r.studentId,
      status: statuses[r.studentId],
    }));
    const res = await markAttendance({ batchId, date, entries });
    setPending(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  if (roster.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No active students enrolled in this batch.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Student ID</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.studentId} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{r.fullName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {r.studentIdCode}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={statuses[r.studentId]}
                      onChange={(e) =>
                        setStatuses((prev) => ({
                          ...prev,
                          [r.studentId]: e.target.value as Status,
                        }))
                      }
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.charAt(0) + s.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      {saved && !error && (
        <p className="rounded-md bg-green-600/10 px-3 py-2 text-sm text-green-700">
          Attendance saved.
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save attendance"}
      </Button>
    </form>
  );
}
