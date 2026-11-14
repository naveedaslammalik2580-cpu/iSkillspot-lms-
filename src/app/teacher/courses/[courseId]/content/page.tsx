import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireTeacherSelf } from "@/lib/auth/guards";
import { getCourseContent, getTeacherCourse } from "@/lib/data/learning";
import { PageHeader } from "@/components/page-header";
import { ContentManager } from "@/components/learning/content-manager";

export default async function TeacherCourseContentPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const { teacher } = await requireTeacherSelf();
  // Page-level scope check (the actions re-check on every mutation):
  // teachers manage content only for courses they are assigned to.
  const mine = await getTeacherCourse(teacher.id, courseId);
  if (!mine) notFound();
  const content = await getCourseContent(courseId);
  if (!content) notFound();

  return (
    <>
      <div className="mb-4">
        <Link
          href={`/teacher/courses/${courseId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to course
        </Link>
      </div>
      <PageHeader
        title={`Content — ${content.course.title}`}
        description="Modules, lessons and resources for your assigned course. Published lessons are visible to enrolled students."
      />
      <ContentManager content={content} />
    </>
  );
}
