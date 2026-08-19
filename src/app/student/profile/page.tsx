import Link from "next/link";
import { requireStudentSelf } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";

export default async function StudentProfilePage() {
  const { student } = await requireStudentSelf();
  const full = await db.student.findUnique({
    where: { id: student.id },
    include: { user: { select: { username: true, email: true } } },
  });
  if (!full) return null;

  return (
    <>
      <PageHeader
        title="My Profile"
        description={full.studentId}
        action={<Button asChild variant="outline"><Link href="/student/change-password">Change password</Link></Button>}
      />
      <Card>
        <CardHeader><CardTitle>{full.fullName}</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Row label="Student ID" value={full.studentId} />
          <Row label="Status" value={<StatusBadge status={full.status} />} />
          <Row label="Username" value={full.user.username} />
          <Row label="Email" value={full.email} />
          <Row label="Phone" value={full.phone} />
          <Row label="WhatsApp" value={full.whatsapp} />
          <Row label="City" value={full.city} />
          <Row label="Admission date" value={formatDate(full.admissionDate)} />
        </CardContent>
      </Card>
    </>
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
