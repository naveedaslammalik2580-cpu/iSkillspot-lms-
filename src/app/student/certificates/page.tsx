import Link from "next/link";
import { requireStudentSelf } from "@/lib/auth/guards";
import { getCertificatesForStudent } from "@/lib/data/certificates";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";

export default async function StudentCertificatesPage() {
  const { student } = await requireStudentSelf();
  const certificates = await getCertificatesForStudent(student.id);

  return (
    <>
      <PageHeader title="Certificates" description="Certificates issued to you" />
      {certificates.length === 0 ? (
        <EmptyState title="No certificates yet." hint="Certificates appear here once issued by your institute." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
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
                      <Link href={`/student/certificates/${c.id}`} className="font-medium text-primary hover:underline">
                        {c.courseName}
                      </Link>
                    </td>
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
