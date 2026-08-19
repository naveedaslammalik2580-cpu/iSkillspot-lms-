import Link from "next/link";
import { requireStaff } from "@/lib/auth/guards";
import { getBatchPicker } from "@/lib/data/batches";
import { getCoursePicker } from "@/lib/data/courses";
import { getAllAnnouncements } from "@/lib/data/announcements";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnnouncementForm } from "@/components/announcements/announcement-form";

export default async function NewAnnouncementPage() {
  await requireStaff();

  const [batches, courses, drafts] = await Promise.all([
    getBatchPicker(),
    getCoursePicker(),
    getAllAnnouncements({ status: "DRAFT" }),
  ]);

  return (
    <>
      <PageHeader title="New announcement" description="Compose a message for students, teachers, or everyone" />

      <Card className="mb-6">
        <CardHeader><CardTitle>How audience targeting works</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p><strong>Everyone</strong> reaches all staff, teachers, and students. <strong>All students</strong> / <strong>all teachers</strong> reach every account with that role.</p>
          <p><strong>One batch</strong> or <strong>one course</strong> narrows it to students (and, for teachers, their own assigned batches/courses) tied to that specific batch or course.</p>
          <p>
            You can save as a draft to review later, or check &quot;Publish immediately&quot; to send it right away.
            Once published, the title and audience are locked — only the message body can still be edited.
          </p>
        </CardContent>
      </Card>

      {drafts.length > 0 && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Unfinished drafts ({drafts.length})</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {drafts.map((d) => (
              <Link
                key={d.id}
                href={`/admin/announcements/${d.id}/edit`}
                className="block text-sm text-primary hover:underline"
              >
                {d.title}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <AnnouncementForm batches={batches} courses={courses} />
    </>
  );
}
