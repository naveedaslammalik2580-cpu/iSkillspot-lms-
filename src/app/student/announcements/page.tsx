import Link from "next/link";
import { requireStudentSelf } from "@/lib/auth/guards";
import { getAnnouncementsForStudent } from "@/lib/data/announcements";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export default async function StudentAnnouncementsPage() {
  const { student } = await requireStudentSelf();
  const announcements = await getAnnouncementsForStudent(student.id);

  return (
    <>
      <PageHeader title="Announcements" description="Messages from your teachers and the institute" />
      {announcements.length === 0 ? (
        <EmptyState title="No announcements yet." hint="Check back later — this is where course and institute updates show up." />
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <Link key={a.id} href={`/student/announcements/${a.id}`}>
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
