import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, PenLine, Users } from "lucide-react";
import { requireTeacherSelf } from "@/lib/auth/guards";
import { getTeacherCourse } from "@/lib/data/learning";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function TeacherCourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const { teacher } = await requireTeacherSelf();
  // Scoped by the session teacher: a course with no batch assigned to
  // this teacher returns null -> 404.
  const detail = await getTeacherCourse(teacher.id, courseId);
  if (!detail) notFound();

  const { course } = detail;
  const totalStudents = detail.batches.reduce((s, b) => s + b.studentCount, 0);

  return (
    <>
      <div className="mb-4">
        <Link
          href="/teacher/courses"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> My Courses
        </Link>
      </div>
      <PageHeader
        title={course.title}
        description={course.description ?? undefined}
        action={
          <Button asChild variant="outline">
            <Link href={`/teacher/courses/${course.id}/content`}>
              <PenLine className="h-4 w-4" /> Manage content
            </Link>
          </Button>
        }
      />

      <Card className="mb-6">
        <CardContent className="space-y-2 pt-6 text-sm">
          <p className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" /> {totalStudents} active students across {detail.batches.length}{" "}
            {detail.batches.length === 1 ? "batch" : "batches"}
          </p>
          <ul className="flex flex-wrap gap-2">
            {detail.batches.map((b) => (
              <li key={b.id}>
                <Badge variant="neutral">
                  {b.name} ({b.code}) · {b.studentCount} students
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {detail.modules.length === 0 ? (
        <EmptyState
          title="No modules yet."
          hint="Use Manage content to add modules and lessons to this course."
        />
      ) : (
        <div className="space-y-4">
          {detail.modules.map((m, mi) => (
            <Card key={m.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  <span className="text-muted-foreground">Module {mi + 1}:</span> {m.title}
                </CardTitle>
                {m.description ? <p className="text-sm text-muted-foreground">{m.description}</p> : null}
              </CardHeader>
              <CardContent>
                {m.lessons.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No lessons in this module yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {m.lessons.map((l) => (
                      <li key={l.id} className="flex items-center gap-3 py-2.5">
                        <span className="flex-1 font-medium">{l.title}</span>
                        {l.resourceCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <FileText className="h-3.5 w-3.5" /> {l.resourceCount}
                          </span>
                        ) : null}
                        <Badge variant={l.isPublished ? "success" : "warning"}>
                          {l.isPublished ? "Published" : "Draft"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
