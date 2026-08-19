import { requirePermission } from "@/lib/auth/guards";
import { PageHeader } from "@/components/page-header";
import { CourseForm } from "@/components/courses/course-form";

export default async function NewCoursePage() {
  await requirePermission("course.manage");
  return (
    <>
      <PageHeader title="New course" description="Create a course" />
      <CourseForm />
    </>
  );
}
