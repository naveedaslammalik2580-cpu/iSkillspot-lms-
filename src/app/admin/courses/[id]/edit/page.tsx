import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getCourseById } from "@/lib/data/courses";
import { PageHeader } from "@/components/page-header";
import { CourseForm } from "@/components/courses/course-form";

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("course.manage");
  const { id } = await params;
  const course = await getCourseById(id);
  if (!course) notFound();

  return (
    <>
      <PageHeader title="Edit course" description={course.name} />
      <CourseForm
        course={{
          id: course.id,
          code: course.code,
          name: course.name,
          description: course.description,
          duration: course.duration,
          level: course.level,
          status: course.status,
        }}
      />
    </>
  );
}
