import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { getAllCertificates } from "@/lib/data/certificates";
import { getCoursePicker } from "@/lib/data/courses";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { CertificateStatus } from "@prisma/client";

export default async function AdminCertificatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("certificate.manage");
  const sp = await searchParams;

  const [certificates, courses] = await Promise.all([
    getAllCertificates({
      status: sp.status as CertificateStatus | undefined,
      courseId: sp.courseId,
      search: sp.q,
    }),
    getCoursePicker(),
  ]);

  return (
    <>
      <PageHeader
        title="Certificates"
        description={`${certificates.length} total`}
        action={
          <Button asChild>
            <Link href="/admin/certificates/new">
              <Plus className="h-4 w-4" /> Issue certificate
            </Link>
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-end gap-3" method="GET">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="q">Search</label>
            <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Student, ID, or cert #…" className="w-56" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="status">Status</label>
            <select
              id="status" name="status" defaultValue={sp.status ?? ""}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All statuses</option>
              <option value="ISSUED">Issued</option>
              <option value="REVOKED">Revoked</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="courseId">Course</label>
            <select
              id="courseId" name="courseId" defaultValue={sp.courseId ?? ""}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline">Filter</Button>
        </form>
      </Card>

      {certificates.length === 0 ? (
        <EmptyState
          title="No certificates found."
          hint="Try different filters, or issue the first certificate."
          action={
            <Button asChild>
              <Link href="/admin/certificates/new">Issue certificate</Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Certificate #</th>
                  <th className="px-4 py-3 font-medium">Issued</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {certificates.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/admin/certificates/${c.id}`} className="font-medium text-primary hover:underline">
                        {c.studentName}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">{c.studentCode}</div>
                    </td>
                    <td className="px-4 py-3">{c.courseName}</td>
                    <td className="px-4 py-3 font-mono text-xs">{c.certificateNumber}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(c.issueDate)}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
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
