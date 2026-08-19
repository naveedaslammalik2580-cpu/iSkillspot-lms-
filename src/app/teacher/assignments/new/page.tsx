import { requireTeacherSelf } from "@/lib/auth/guards";
import { getCoursesForTeacher } from "@/lib/data/assignments";
import { PageHeader } from "@/components/page-header";
import { AssignmentForm } from "@/components/assignments/assignment-form";

export default async function NewTeacherAssignmentPage() {
  // Every TEACHER role already has "assignment.manage" (see permissions.ts),
  // so requireTeacherSelf() alone is the right guard here — matches every
  // other teacher page's single-guard pattern.
  const { teacher } = await requireTeacherSelf();
  const courses = await getCoursesForTeacher(teacher.id);
  return (
    <>
      <PageHeader title="New assignment" description="Create an assignment for one of your courses" />
      <AssignmentForm basePath="/teacher/assignments" courses={courses} />
    </>
  );
}
