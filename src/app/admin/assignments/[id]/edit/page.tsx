import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getAssignmentDetail, getCoursesForAdmin } from "@/lib/data/assignments";
import { PageHeader } from "@/components/page-header";
import { AssignmentForm } from "@/components/assignments/assignment-form";

export default async function EditAssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission("assignment.manage");
  const { id } = await params;
  const [assignment, courses] = await Promise.all([
    getAssignmentDetail(id, session),
    getCoursesForAdmin(),
  ]);
  if (!assignment) notFound();

  return (
    <>
      <PageHeader title="Edit assignment" description={assignment.title} />
      <AssignmentForm
        basePath="/admin/assignments"
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
