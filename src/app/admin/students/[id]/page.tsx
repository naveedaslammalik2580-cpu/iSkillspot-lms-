import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/guards";
import { getStudent360 } from "@/lib/data/students";
import { getSetting } from "@/lib/settings";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { StudentActions } from "./actions";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Pencil } from "lucide-react";
import { ActionForm } from "@/components/admissions/forms";
import { setEnrollmentAccessAction } from "@/lib/actions/admissions";

export default async function StudentProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const data = await getStudent360(id);
  if (!data) notFound();

  const { student, summary } = data;
  const currency = await getSetting("currency", "PKR");
  const enr = student.enrollments[0];

  return (
    <>
      <PageHeader
        title={student.fullName}
        description={student.studentId}
        action={
          <Button variant="outline" asChild>
            <Link href={`/admin/students/${student.id}/edit`}>
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          </Button>
        }
      />

      {/* Header card */}
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
              {student.fullName.charAt(0)}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">{student.fullName}</span>
                <StatusBadge status={student.status} />
              </div>
              <div className="text-sm text-muted-foreground">
                {enr?.course.title ?? "No course"} · {enr?.batch.name ?? "No batch"} ·{" "}
                {enr?.batch.teacher?.fullName ?? "No instructor"}
              </div>
              <div className="font-mono text-xs text-muted-foreground">{student.studentId}</div>
            </div>
          </div>
          <StudentActions studentId={student.id} accountStatus={student.user.status} currentStatus={student.status} />
        </CardContent>
      </Card>

      {/* Summary tiles */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Overall progress" value={`${summary.overallProgress}%`} />
        <Tile label="Attendance" value={`${summary.attendance.pct}%`} />
        <Tile label="Avg assignment" value={`${summary.assignments.avgScore}%`} />
        <Tile label="Avg quiz" value={`${summary.quizzes.avg}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Personal information">
          <Row label="Father's name" value={student.fatherName} />
          <Row label="Email" value={student.email} />
          <Row label="Phone" value={student.phone} />
          <Row label="WhatsApp" value={student.whatsapp} />
          <Row label="City" value={student.city} />
          <Row label="Address" value={student.address} />
          <Row label="Date of birth" value={formatDate(student.dateOfBirth)} />
        </Section>

        <Section title="Admission & account">
          <Row label="Admission date" value={formatDate(student.admissionDate)} />
          <Row label="Username" value={student.user.username} />
          <Row label="Account status" value={student.user.status} />
          <Row label="Last login" value={student.user.lastLogin ? formatDate(student.user.lastLogin) : "Never"} />
        </Section>

        <Section title="Attendance">
          <Row label="Total classes" value={summary.attendance.total} />
          <Row label="Present" value={summary.attendance.present} />
          <Row label="Absent" value={summary.attendance.absent} />
          <Row label="Late" value={summary.attendance.late} />
          <Row label="Percentage" value={`${summary.attendance.pct}%`} />
        </Section>

        <Section title="Assignments & quizzes">
          <Row label="Assignments completed" value={summary.assignments.completed} />
          <Row label="Assignments pending" value={summary.assignments.pending} />
          <Row label="Avg assignment score" value={`${summary.assignments.avgScore}%`} />
          <Row label="Quiz attempts" value={summary.quizzes.attempts} />
          <Row label="Best quiz" value={`${summary.quizzes.best}%`} />
        </Section>

        <Section title="Courses">
          {student.enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No enrollments.</p>
          ) : (
            student.enrollments.map((e) => (
              <div key={e.id} className="space-y-3 border-b border-border py-3 last:border-0 text-sm">
                <p>{e.course.title} · {Math.round(e.progress)}% · {e.accessSuspended ? "Access suspended" : "Access enabled"}</p>
                <ActionForm action={setEnrollmentAccessAction} label={e.accessSuspended ? "Restore course access" : "Suspend course access"}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="suspended" value={String(!e.accessSuspended)} /></ActionForm>
              </div>
            ))
          )}
        </Section>

        <Section title="Fees">
          <Row label="Total" value={formatCurrency(summary.fees.total, currency)} />
          <Row label="Paid" value={formatCurrency(summary.fees.paid, currency)} />
          <Row label="Remaining" value={formatCurrency(summary.fees.remaining, currency)} />
        </Section>

        <Section title="Certificates">
          {student.certificates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No certificates issued.</p>
          ) : (
            student.certificates.map((c) => (
              <div key={c.id} className="flex items-center justify-between border-b border-border py-2 last:border-0 text-sm">
                <span>{c.course.title}</span>
                <span className="font-mono text-xs text-muted-foreground">{c.certificateNumber}</span>
              </div>
            ))
          )}
        </Section>
      </div>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1">{children}</CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}
