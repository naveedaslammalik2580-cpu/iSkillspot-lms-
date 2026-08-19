import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { formatDate } from "@/lib/utils";
import { BadgeCheck, XCircle } from "lucide-react";

// Public certificate verification (Section 15). No auth, no private data exposed.
export default async function VerifyPage({
  params,
}: { params: Promise<{ verificationCode: string }> }) {
  const { verificationCode } = await params;
  const cert = await db.certificate.findUnique({
    where: { verificationCode },
    include: { student: { select: { fullName: true } }, course: { select: { title: true } } },
  });
  const institute = await getSetting("instituteName", "iSkillSpot");

  const valid = cert && cert.status === "ISSUED";
  const revoked = cert && cert.status === "REVOKED";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        {valid ? (
          <>
            <BadgeCheck className="mx-auto h-14 w-14 text-green-600" />
            <h1 className="mt-4 text-xl font-bold">Verified certificate</h1>
            <p className="mt-1 text-sm text-muted-foreground">Issued by {institute}</p>
            <div className="mt-6 space-y-2 text-left text-sm">
              <Row label="Name" value={cert!.student.fullName} />
              <Row label="Course" value={cert!.course.title} />
              <Row label="Certificate #" value={cert!.certificateNumber} />
              <Row label="Issued" value={formatDate(cert!.issueDate)} />
            </div>
          </>
        ) : revoked ? (
          <>
            <XCircle className="mx-auto h-14 w-14 text-destructive" />
            <h1 className="mt-4 text-xl font-bold">This certificate has been revoked</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              It was issued by {institute} but is no longer valid.
            </p>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-14 w-14 text-destructive" />
            <h1 className="mt-4 text-xl font-bold">Certificate not found</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This verification code is invalid.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
