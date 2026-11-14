import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, Clock, FileText, PlayCircle } from "lucide-react";
import { requireStudentSelf } from "@/lib/auth/guards";
import { getStudentCourse } from "@/lib/data/learning";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/learning/progress-bar";

export default async function StudentCourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const { student } = await requireStudentSelf();
  // Scoped by the session student's id — null (404) when not enrolled,
  // so another student's course is indistinguishable from a missing one.
  const detail = await getStudentCourse(student.id, courseId);
  if (!detail) notFound();

  const { course, batch } = detail;

  return (
    <>
      <div className="mb-4">
        <Link
          href="/student/courses"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> My Courses
        </Link>
      </div>
      <PageHeader
        title={course.title}
        description={course.description ?? undefined}
      />

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              Batch <span className="font-medium text-foreground">{batch.name}</span> ({batch.code})
              {batch.teacherName ? (
                <>
                  {" "}· Teacher <span className="font-medium text-foreground">{batch.teacherName}</span>
                </>
              ) : null}
            </p>
            <p className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral" className="capitalize">{course.level.toLowerCase()}</Badge>
              {course.duration ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {course.duration}
                </span>
              ) : null}
              <span className="capitalize">{detail.enrollmentStatus.toLowerCase()} enrollment</span>
            </p>
          </div>
          <div className="w-full sm:w-64">
            <ProgressBar
              percent={detail.progress.percent}
              completed={detail.progress.completedLessons}
              total={detail.progress.totalLessons}
            />
          </div>
        </CardContent>
      </Card>

      {detail.modules.length === 0 || detail.progress.totalLessons === 0 ? (
        <EmptyState
          title="No lessons published yet."
          hint="Modules and lessons for this course will appear here once your institute publishes them."
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
                  <p className="text-sm text-muted-foreground">No published lessons in this module yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {m.lessons.map((l) => (
                      <li key={l.id}>
                        <Link
                          href={`/student/courses/${course.id}/lessons/${l.id}`}
                          className="flex items-center gap-3 py-3 hover:bg-accent/40 -mx-2 px-2 rounded-md"
                        >
                          {l.completed ? (
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-label="Completed" />
                          ) : (
                            <Circle className="h-5 w-5 shrink-0 text-muted-foreground" aria-label="Not completed" />
                          )}
                          <span className="flex-1">
                            <span className="block font-medium">{l.title}</span>
                            {l.description ? (
                              <span className="block line-clamp-1 text-sm text-muted-foreground">{l.description}</span>
                            ) : null}
                          </span>
                          <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                            {l.hasVideo ? (
                              <span className="inline-flex items-center gap-1">
                                <PlayCircle className="h-4 w-4" /> Video
                              </span>
                            ) : null}
                            {l.resourceCount > 0 ? (
                              <span className="inline-flex items-center gap-1">
                                <FileText className="h-4 w-4" /> {l.resourceCount}
                              </span>
                            ) : null}
                            {l.duration ? <span>{l.duration}</span> : null}
                          </span>
                        </Link>
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
