import Link from "next/link";
import { requireTeacherSelf } from "@/lib/auth/guards";
import { getAnnouncementsForTeacher } from "@/lib/data/announcements";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export default async function TeacherAnnouncementsPage() {
  const { teacher } = await requireTeacherSelf();
  const announcements = await getAnnouncementsForTeacher(teacher.id);

  return (
    <>
      <PageHeader title="Announcements" description="Scoped to your assigned batches and courses" />
      {announcements.length === 0 ? (
        <EmptyState title="No announcements yet." hint="Institute and course updates for your batches will show up here." />
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <Link key={a.id} href={`/teacher/announcements/${a.id}`}>
              <Card className="p-4 transition-colors hover:bg-muted/40">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{a.title}</p>
                  <span className="text-xs text-muted-foreground">
                    {a.publishedAt ? formatDate(a.publishedAt) : "—"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{a.audienceLabel}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
