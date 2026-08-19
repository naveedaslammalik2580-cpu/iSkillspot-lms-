import { notFound } from "next/navigation";
import { requireTeacherSelf } from "@/lib/auth/guards";
import { getAssignmentDetail, getCoursesForTeacher } from "@/lib/data/assignments";
import { PageHeader } from "@/components/page-header";
import { AssignmentForm } from "@/components/assignments/assignment-form";

export default async function EditTeacherAssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session, teacher } = await requireTeacherSelf();
  const { id } = await params;
  const [assignment, courses] = await Promise.all([
    getAssignmentDetail(id, session),
    getCoursesForTeacher(teacher.id),
  ]);
  if (!assignment) notFound();

  return (
    <>
      <PageHeader title="Edit assignment" description={assignment.title} />
      <AssignmentForm
        basePath="/teacher/assignments"
        courses={courses}
        assignment={{
          id: assignment.id,
          courseTitle: assignment.courseTitle,
          moduleTitle: assignment.moduleTitle,
          title: assignment.title,
          description: assignment.description,
          instructions: assignment.instructions,
          dueDate: assignment.dueDate ? assignment.dueDate.toISOString().slice(0, 10) : "",
          maxScore: assignment.maxScore,
        }}
      />
    </>
  );
}
