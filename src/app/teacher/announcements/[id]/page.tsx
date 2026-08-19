import { notFound } from "next/navigation";
import { requireTeacherSelf } from "@/lib/auth/guards";
import { getAnnouncementById } from "@/lib/data/announcements";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export default async function TeacherAnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session } = await requireTeacherSelf();
  const { id } = await params;

  const announcement = await getAnnouncementById(id, { role: session.role, userId: session.userId });
  if (!announcement) notFound();

  return (
    <>
      <PageHeader
        title={announcement.title}
        description={announcement.publishedAt ? formatDate(announcement.publishedAt) : "—"}
      />
      <Card>
        <CardContent className="p-6">
          <p className="whitespace-pre-wrap text-sm">{announcement.body}</p>
        </CardContent>
      </Card>
    </>
  );
}
