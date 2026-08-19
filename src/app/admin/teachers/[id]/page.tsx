import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getTeacherById } from "@/lib/data/teachers";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { ResetPasswordButton } from "@/components/teachers/reset-password-button";
import { DeactivateTeacherButton } from "@/components/teachers/deactivate-teacher-button";
import { formatDate } from "@/lib/utils";
import { Pencil } from "lucide-react";

export default async function AdminTeacherDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("teacher.manage");
  const { id } = await params;
  const teacher = await getTeacherById(id);
  if (!teacher) notFound();

  return (
    <>
      <PageHeader
        title={teacher.fullName}
        description={teacher.specialization ?? "No specialization set"}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/admin/teachers/${teacher.id}/edit`}>
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            </Button>
            <ResetPasswordButton teacherId={teacher.id} />
            <DeactivateTeacherButton teacherId={teacher.id} isActive={teacher.status === "ACTIVE"} />
          </div>
        }
      />

      <Card className="mb-6">
        <CardContent className="grid gap-4 p-6 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="mt-1"><StatusBadge status={teacher.status} /></p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Username</p>
            <p className="font-mono text-sm font-medium">{teacher.username}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="font-medium">{teacher.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Phone</p>
            <p className="font-medium">{teacher.phone ?? "—"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Joined</p>
            <p className="font-medium">{formatDate(teacher.joiningDate)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Batches</p>
            <p className="font-medium">{teacher.batches.length}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Batches taught</CardTitle></CardHeader>
        <CardContent className="p-0">
          {teacher.batches.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No batches assigned yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Batch</th>
                    <th className="px-4 py-3 font-medium">Course</th>
                    <th className="px-4 py-3 font-medium">Dates</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {teacher.batches.map((b) => (
                    <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link href={`/admin/batches/${b.id}`} className="font-medium text-primary hover:underline">
                          {b.name}
                        </Link>
                        <div className="font-mono text-xs text-muted-foreground">{b.code}</div>
                      </td>
                      <td className="px-4 py-3">{b.courseTitle}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {b.startDate ? formatDate(b.startDate) : "—"} – {b.endDate ? formatDate(b.endDate) : "—"}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
