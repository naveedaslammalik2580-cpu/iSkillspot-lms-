import Link from "next/link";
import { requireTeacherSelf } from "@/lib/auth/guards";
import { getAllBatches } from "@/lib/data/batches";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";

export default async function TeacherBatchesPage() {
  const { teacher } = await requireTeacherSelf();
  const batches = await getAllBatches({ teacherId: teacher.id });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="My Batches" description="Batches assigned to you" />
      {batches.length === 0 ? (
        <EmptyState title="No batches assigned yet." hint="Contact an administrator if this seems wrong." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Batch</th>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Dates</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Enrolled</th>
                  <th className="px-4 py-3 font-medium">Links</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <p className="font-medium">{b.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{b.code}</p>
                    </td>
                    <td className="px-4 py-3">{b.courseTitle}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.startDate ? formatDate(b.startDate) : "—"} – {b.endDate ? formatDate(b.endDate) : "—"}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-3">{b.enrolledCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3 text-xs">
                        <Link
                          href={`/teacher/attendance?batchId=${b.id}&date=${today}`}
                          className="text-primary hover:underline"
                        >
                          Attendance
                        </Link>
                        <Link href={`/teacher/assignments?courseId=${b.courseId}`} className="text-primary hover:underline">
                          Assignments
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
