import { requirePermission } from "@/lib/auth/guards";
import { getCoursesForAdmin } from "@/lib/data/assignments";
import { PageHeader } from "@/components/page-header";
import { AssignmentForm } from "@/components/assignments/assignment-form";

export default async function NewAssignmentPage() {
  await requirePermission("assignment.manage");
  const courses = await getCoursesForAdmin();
  return (
    <>
      <PageHeader title="New assignment" description="Create an assignment for a course" />
      <AssignmentForm basePath="/admin/assignments" courses={courses} />
    </>
  );
}
