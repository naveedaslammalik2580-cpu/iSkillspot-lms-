import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/guards";
import { getCertificateById } from "@/lib/data/certificates";
import { getSetting } from "@/lib/settings";
import { PrintCertificateButton } from "@/components/certificates/print-certificate-button";
import { formatDate } from "@/lib/utils";

// Deliberately NOT under /admin — middleware hard-blocks non-staff roles from
// the whole /admin/* prefix, and students need to reach this same route to
// print their own certificate. Real authorization still happens below via
// getCertificateById's scope check (staff: any; student: their own only).
export default async function PrintCertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const cert = await getCertificateById(id, { role: session.role, userId: session.userId });
  if (!cert) notFound();

  const instituteName = await getSetting("instituteName", "iSkillSpot");
  const verifyUrl = `/verify/${cert.verificationCode}`;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintCertificateButton />
      </div>

      <div className="mx-auto max-w-2xl rounded-lg border-4 border-double border-primary/40 bg-card p-12 text-center shadow-sm">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">Certificate of Completion</p>
        <p className="mt-2 text-2xl font-bold">{instituteName}</p>

        <p className="mt-10 text-sm text-muted-foreground">This certifies that</p>
        <p className="mt-2 text-3xl font-bold">{cert.studentName}</p>

        <p className="mt-6 text-sm text-muted-foreground">has successfully completed</p>
        <p className="mt-2 text-xl font-semibold">{cert.courseName}</p>

        {cert.status === "REVOKED" && (
          <p className="mt-6 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
            This certificate has been revoked and is no longer valid.
          </p>
        )}

        <div className="mt-10 grid grid-cols-2 gap-4 border-t border-border pt-6 text-left text-xs text-muted-foreground">
          <div>
            <p>Certificate number</p>
            <p className="font-mono font-medium text-foreground">{cert.certificateNumber}</p>
          </div>
          <div>
            <p>Issue date</p>
            <p className="font-medium text-foreground">{formatDate(cert.issueDate)}</p>
          </div>
          <div className="col-span-2">
            <p>Verify this certificate at</p>
            <p className="font-mono font-medium text-foreground">{verifyUrl}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
