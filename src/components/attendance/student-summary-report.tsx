"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { Download, Printer } from "lucide-react";

type StudentOption = { id: string; studentId: string; fullName: string };
type Status = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
type Summary = {
  student: { id: string; studentId: string; fullName: string };
  records: { id: string; date: string; status: Status; batchName: string; courseTitle: string }[];
  totals: {
    present: number;
    absent: number;
    late: number;
    excused: number;
    total: number;
    pctPresent: number;
  };
};

/** Report 2: one student's attendance totals + record list across a date range. */
export function StudentSummaryReport({
  basePath,
  students,
  studentId,
  from,
  to,
  summary,
}: {
  basePath: string;
  students: StudentOption[];
  studentId?: string;
  from?: string;
  to?: string;
  summary: Summary | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const selectedFrom = from ?? monthAgo;
  const selectedTo = to ?? today;

  // Preserve any other report's params already on this page (e.g. the
  // batch-sheet report's batchId/month) — only touch our own keys.
  function goTo(next: { studentId?: string; from?: string; to?: string }) {
    const merged = { studentId, from: selectedFrom, to: selectedTo, ...next };
    const params = new URLSearchParams(searchParams.toString());
    if (merged.studentId) params.set("studentId", merged.studentId);
    else params.delete("studentId");
    if (merged.from) params.set("from", merged.from);
    else params.delete("from");
    if (merged.to) params.set("to", merged.to);
    else params.delete("to");
    router.push(`${basePath}?${params.toString()}`);
  }

  function exportCsv() {
    if (!summary) return;
    const header = ["Date", "Course", "Batch", "Status"];
    const rows = summary.records.map((r) => [r.date, r.courseTitle, r.batchName, r.status]);
    downloadCsv(`attendance-summary-${summary.student.studentId}.csv`, [header, ...rows]);
  }

  return (
    <div className="space-y-4 print:space-y-2">
      <Card className="p-4 print:hidden">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="studentId">Student</Label>
            <select
              id="studentId"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={studentId ?? ""}
              onChange={(e) => goTo({ studentId: e.target.value || undefined })}
            >
              <option value="">Select student</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.studentId})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              max={selectedTo}
              defaultValue={selectedFrom}
              onChange={(e) => goTo({ from: e.target.value || undefined })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              max={today}
              defaultValue={selectedTo}
              onChange={(e) => goTo({ to: e.target.value || undefined })}
            />
          </div>
        </div>
      </Card>

      {summary && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <p className="text-sm text-muted-foreground">
              {summary.student.fullName} ({summary.student.studentId})
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

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard label="Present" value={summary.totals.present} icon="CheckCircle2" tone="success" />
            <StatCard label="Absent" value={summary.totals.absent} icon="XCircle" tone="danger" />
            <StatCard label="Late" value={summary.totals.late} icon="Clock" tone="warning" />
            <StatCard label="Excused" value={summary.totals.excused} icon="FileText" />
            <StatCard label="Attendance %" value={`${summary.totals.pctPresent}%`} icon="TrendingUp" />
          </div>

          {summary.records.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attendance records in this range.</p>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Course</th>
                      <th className="px-4 py-3 font-medium">Batch</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.records.map((r) => (
                      <tr key={r.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(r.date)}</td>
                        <td className="px-4 py-3">{r.courseTitle}</td>
                        <td className="px-4 py-3">{r.batchName}</td>
                        <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
