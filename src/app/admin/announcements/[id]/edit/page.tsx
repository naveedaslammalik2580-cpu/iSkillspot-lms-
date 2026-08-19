import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/guards";
import { getAnnouncementById } from "@/lib/data/announcements";
import { getBatchPicker } from "@/lib/data/batches";
import { getCoursePicker } from "@/lib/data/courses";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AnnouncementForm } from "@/components/announcements/announcement-form";

export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireStaff();
  const { id } = await params;

  const announcement = await getAnnouncementById(id, { role: session.role, userId: session.userId });
  if (!announcement) notFound();

  // Archived announcements are done — nothing left to edit.
  if (announcement.status === "ARCHIVED") {
    redirect(`/admin/announcements/${id}`);
  }

  const [batches, courses] = await Promise.all([getBatchPicker(), getCoursePicker()]);

  return (
    <>
      <PageHeader
        title="Edit announcement"
        description={
          announcement.status === "PUBLISHED"
            ? "Already published — only the message body can be changed"
            : "Draft — everything is still editable"
        }
      />

      {announcement.status === "PUBLISHED" && (
        <Card className="mb-6">
          <CardContent className="p-4 text-sm text-muted-foreground">
            This announcement already went out to its audience, so the title and audience are locked
            to keep the record accurate. Only the message body below can still be changed.
          </CardContent>
        </Card>
      )}

      <AnnouncementForm batches={batches} courses={courses} announcement={announcement} />
    </>
  );
}
