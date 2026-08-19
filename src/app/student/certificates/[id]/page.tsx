import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStudentSelf } from "@/lib/auth/guards";
import { getCertificateById } from "@/lib/data/certificates";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import { Printer } from "lucide-react";

export default async function StudentCertificateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session } = await requireStudentSelf();
  const { id } = await params;

  const cert = await getCertificateById(id, { role: session.role, userId: session.userId });
  if (!cert) notFound();

  return (
    <>
      <PageHeader
        title={cert.courseName}
        description={cert.certificateNumber}
        action={
          <Button variant="outline" asChild>
            <Link href={`/certificates/${id}/print`} target="_blank" rel="noopener noreferrer">
              <Printer className="h-4 w-4" /> Print
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-3 p-6 text-sm">
          <Row label="Status" value={<StatusBadge status={cert.status} />} />
          <Row label="Issue date" value={formatDate(cert.issueDate)} />
          <Row label="Certificate number" value={<span className="font-mono text-xs">{cert.certificateNumber}</span>} />
          <Row label="Verification URL" value={<span className="font-mono text-xs">/verify/{cert.verificationCode}</span>} />
          {cert.status === "REVOKED" && (
            <Row label="Revoked" value={cert.revokedAt ? formatDate(cert.revokedAt) : "—"} />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
