"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { downloadCsv } from "@/lib/csv";
import { Download, Printer } from "lucide-react";

type BatchOption = { id: string; name: string; courseTitle: string };
type Status = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
type SheetRow = {
  studentId: string;
  studentIdCode: string;
  fullName: string;
  cells: (Status | null)[];
  pctPresent: number;
};
type Sheet = {
  batch: BatchOption;
  dates: string[];
  rows: SheetRow[];
  dailyPresent: number[];
  rosterSize: number;
};

const LETTER: Record<Status, string> = { PRESENT: "P", ABSENT: "A", LATE: "L", EXCUSED: "E" };

/** Report 1: batch attendance sheet — students x dates, one month. */
export function BatchSheetReport({
  basePath,
  batches,
  batchId,
  month,
  sheet,
}: {
  basePath: string;
  batches: BatchOption[];
  batchId?: string;
  month?: string;
  sheet: Sheet | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const selectedMonth = month ?? currentMonth;

  // Preserve any other report's params already on this page (e.g. the
  // student-summary report's studentId/from/to) — only touch our own keys.
  function goTo(nextBatchId: string | undefined, nextMonth: string | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextBatchId) params.set("batchId", nextBatchId);
    else params.delete("batchId");
    if (nextMonth) params.set("month", nextMonth);
    else params.delete("month");
    router.push(`${basePath}?${params.toString()}`);
  }

  function exportCsv() {
    if (!sheet) return;
    const header = ["Student ID", "Name", ...sheet.dates, "% Present"];
    const rows = sheet.rows.map((r) => [
      r.studentIdCode,
      r.fullName,
      ...r.cells.map((c) => (c ? LETTER[c] : "")),
      r.pctPresent,
    ]);
    const totals = ["", "Daily present", ...sheet.dailyPresent, ""];
    downloadCsv(
      `attendance-sheet-${sheet.batch.name}-${selectedMonth}.csv`,
      [header, ...rows, totals]
    );
  }

  return (
    <div className="space-y-4 print:space-y-2">
      <Card className="p-4 print:hidden">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="batchId">Batch</Label>
            <select
              id="batchId"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={batchId ?? ""}
              onChange={(e) => goTo(e.target.value || undefined, selectedMonth)}
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
            <Label htmlFor="month">Month</Label>
            <input
              id="month"
              type="month"
              max={currentMonth}
              defaultValue={selectedMonth}
              onChange={(e) => goTo(batchId, e.target.value || undefined)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
        </div>
      </Card>

      {sheet && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <p className="text-sm text-muted-foreground">
              {sheet.batch.courseTitle} — {sheet.batch.name} · {sheet.rosterSize} students
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print
              </Button>
            </div>
          </div>

          {sheet.rows.length === 0 || sheet.dates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data for this batch/month yet.</p>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      <th className="sticky left-0 bg-muted/50 px-3 py-2 font-medium">Student</th>
                      {sheet.dates.map((d) => (
                        <th key={d} className="px-2 py-2 text-center font-medium">
                          {d.slice(8, 10)}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-center font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.rows.map((r) => (
                      <tr key={r.studentId} className="border-b border-border last:border-0">
                        <td className="sticky left-0 bg-card px-3 py-2 font-medium">
                          {r.fullName}
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {r.studentIdCode}
                          </div>
                        </td>
                        {r.cells.map((c, i) => (
                          <td key={i} className="px-2 py-2 text-center text-muted-foreground">
                            {c ? LETTER[c] : "—"}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-center font-semibold">{r.pctPresent}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/30 font-medium">
                      <td className="sticky left-0 bg-muted/30 px-3 py-2">Present / roster</td>
                      {sheet.dailyPresent.map((n, i) => (
                        <td key={i} className="px-2 py-2 text-center text-muted-foreground">
                          {n}/{sheet.rosterSize}
                        </td>
                      ))}
                      <td className="px-3 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
