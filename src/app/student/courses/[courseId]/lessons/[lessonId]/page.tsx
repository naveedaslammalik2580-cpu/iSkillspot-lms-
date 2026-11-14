import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Download } from "lucide-react";
import { requireStudentSelf } from "@/lib/auth/guards";
import { getStudentLesson } from "@/lib/data/learning";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { VideoEmbed } from "@/components/learning/video-embed";
import { MarkCompleteButton } from "@/components/learning/mark-complete-button";

export default async function StudentLessonPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  const { student } = await requireStudentSelf();
  // Scoped by the session student: unpublished lessons and lessons from
  // courses the student is not enrolled in return null -> 404.
  const detail = await getStudentLesson(student.id, lessonId);
  if (!detail || detail.course.id !== courseId) notFound();

  const { lesson, course, module } = detail;

  return (
    <>
      <div className="mb-4">
        <Link
          href={`/student/courses/${course.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to {course.title}
        </Link>
      </div>

      <PageHeader
        title={lesson.title}
        description={`${course.title} · ${module.title} · Lesson ${detail.position} of ${detail.totalLessons}`}
      />

      <div className="space-y-6">
        {lesson.videoUrl ? <VideoEmbed videoUrl={lesson.videoUrl} title={lesson.title} /> : null}

        <Card>
          <CardContent className="space-y-4 pt-6">
            {lesson.description ? (
              <p className="text-base font-medium leading-relaxed">{lesson.description}</p>
            ) : null}
            {lesson.content ? (
              // Lesson content is stored as plain text in the schema. It is
              // rendered as text (never as HTML), so stored markup cannot
              // execute — line breaks are preserved via whitespace-pre-wrap.
              <div className="whitespace-pre-wrap leading-relaxed text-foreground/90">{lesson.content}</div>
            ) : !lesson.description && !lesson.videoUrl ? (
              <p className="text-muted-foreground">
                This lesson has no written content yet. Please check the resources below or ask your teacher.
              </p>
            ) : null}
            <div className="border-t border-border pt-4">
              <MarkCompleteButton lessonId={lesson.id} completed={detail.completed} />
            </div>
          </CardContent>
        </Card>

        {detail.resources.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resources</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {detail.resources.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.title}</span>
                      {r.fileType ? (
                        <span className="block text-xs uppercase text-muted-foreground">{r.fileType}</span>
                      ) : null}
                    </span>
                    {/* Access goes through the authorized route, which checks
                        enrollment before redirecting to the file. */}
                    <a
                      href={`/api/lessons/resources?resourceId=${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
                    >
                      <Download className="h-4 w-4" /> Open
                    </a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <nav aria-label="Lesson navigation" className="flex items-center justify-between gap-3">
          {detail.prev ? (
            <Button asChild variant="outline">
              <Link href={`/student/courses/${course.id}/lessons/${detail.prev.id}`}>
                <ArrowLeft className="h-4 w-4" /> Previous: {detail.prev.title}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {detail.next ? (
            <Button asChild>
              <Link href={`/student/courses/${course.id}/lessons/${detail.next.id}`}>
                Next: {detail.next.title} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      </div>
    </>
  );
}
