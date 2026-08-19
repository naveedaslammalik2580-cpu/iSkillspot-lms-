import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getCertificateById } from "@/lib/data/certificates";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { RevokeCertificateButton } from "@/components/certificates/revoke-certificate-button";
import { formatDate } from "@/lib/utils";
import { Printer } from "lucide-react";

export default async function CertificateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission("certificate.manage");
  const { id } = await params;

  const cert = await getCertificateById(id, { role: session.role, userId: session.userId });
  if (!cert) notFound();

  return (
    <>
      <PageHeader
        title={cert.studentName}
        description={`${cert.courseName} · ${cert.certificateNumber}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/certificates/${id}/print`} target="_blank" rel="noopener noreferrer">
                <Printer className="h-4 w-4" /> Print
              </Link>
            </Button>
            {cert.status === "ISSUED" && <RevokeCertificateButton certificateId={id} />}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <p className="mt-1"><StatusBadge status={cert.status} /></p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Issue date</p>
          <p className="mt-1 font-medium">{formatDate(cert.issueDate)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Certificate #</p>
          <p className="mt-1 font-mono text-xs font-medium">{cert.certificateNumber}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Issued by</p>
          <p className="mt-1 font-medium">{cert.issuedByName ?? "—"}</p>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>Verification</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Verification code</span>
            <span className="font-mono font-medium">{cert.verificationCode}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Public verification URL</span>
            <Link href={`/verify/${cert.verificationCode}`} target="_blank" className="font-mono text-xs text-primary hover:underline">
              /verify/{cert.verificationCode}
            </Link>
          </div>
          {cert.notes && (
            <div className="border-t border-border pt-3 text-sm">
              <p className="text-muted-foreground">Notes</p>
              <p className="mt-1">{cert.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {cert.status === "REVOKED" && (
        <Card>
          <CardHeader><CardTitle>Revocation</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">Revoked {cert.revokedAt ? formatDate(cert.revokedAt) : "—"}</p>
            <p>{cert.revokeReason}</p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
