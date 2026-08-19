import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/guards";
import { getAnnouncementById } from "@/lib/data/announcements";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { PublishAnnouncementButton } from "@/components/announcements/publish-announcement-button";
import { ArchiveAnnouncementButton } from "@/components/announcements/archive-announcement-button";
import { formatDate } from "@/lib/utils";
import { Pencil } from "lucide-react";

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireStaff();
  const { id } = await params;

  const announcement = await getAnnouncementById(id, { role: session.role, userId: session.userId });
  if (!announcement) notFound();

  return (
    <>
      <PageHeader
        title={announcement.title}
        description={`By ${announcement.authorName} · ${formatDate(announcement.createdAt)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {announcement.status === "DRAFT" && (
              <Button variant="outline" asChild>
                <Link href={`/admin/announcements/${id}/edit`}>
                  <Pencil className="h-4 w-4" /> Edit
                </Link>
              </Button>
            )}
            {announcement.status === "PUBLISHED" && (
              <Button variant="outline" asChild>
                <Link href={`/admin/announcements/${id}/edit`}>
                  <Pencil className="h-4 w-4" /> Edit body
                </Link>
              </Button>
            )}
            {announcement.status === "DRAFT" && <PublishAnnouncementButton announcementId={id} />}
            {announcement.status === "PUBLISHED" && <ArchiveAnnouncementButton announcementId={id} />}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <p className="mt-1"><StatusBadge status={announcement.status} /></p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Audience</p>
          <p className="mt-1 font-medium">{announcement.audienceLabel}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Target batch</p>
          <p className="mt-1 font-medium">{announcement.targetBatchName ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Target course</p>
          <p className="mt-1 font-medium">{announcement.targetCourseName ?? "—"}</p>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Message</CardTitle></CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{announcement.body}</p>
        </CardContent>
      </Card>

      {announcement.publishedAt && (
        <p className="mt-4 text-sm text-muted-foreground">
          Published {formatDate(announcement.publishedAt)}
        </p>
      )}
    </>
  );
}
