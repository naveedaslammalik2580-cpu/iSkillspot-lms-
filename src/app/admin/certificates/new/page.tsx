import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { getStudentsWithEligibleCourses, getAllCertificates } from "@/lib/data/certificates";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CertificateForm } from "@/components/certificates/certificate-form";
import { formatDate } from "@/lib/utils";

export default async function NewCertificatePage() {
  await requirePermission("certificate.manage");

  const [students, recent] = await Promise.all([
    getStudentsWithEligibleCourses(),
    getAllCertificates({ status: "ISSUED" }),
  ]);

  return (
    <>
      <PageHeader title="Issue certificate" description="Award a course-completion certificate to a student" />

      <Card className="mb-6">
        <CardHeader><CardTitle>Eligibility</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>
            A student is eligible for any course they have an enrollment in — active, completed, or otherwise.
            The course list updates once you pick a student, and only shows courses that don&apos;t already
            have a certificate issued.
          </p>
          <p>A verification code and certificate number are generated automatically and can&apos;t be edited.</p>
        </CardContent>
      </Card>

      {recent.length > 0 && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Most recently issued</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {recent.slice(0, 5).map((c) => (
              <Link key={c.id} href={`/admin/certificates/${c.id}`} className="flex items-center justify-between text-sm text-primary hover:underline">
                <span>{c.studentName} — {c.courseName}</span>
                <span className="text-xs text-muted-foreground">{formatDate(c.issueDate)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <CertificateForm students={students} />
    </>
  );
}
