import { requirePermission } from "@/lib/auth/guards";
import { getCoursesAndBatches } from "@/lib/data/students";
import { PageHeader } from "@/components/page-header";
import { AddStudentForm } from "./form";

export default async function NewStudentPage() {
  await requirePermission("student.create");
  const courses = await getCoursesAndBatches();
  return (
    <>
      <PageHeader title="Add Student" description="Create a new student account and enrollment" />
      <AddStudentForm
        courses={courses.map((c) => ({
          id: c.id,
          title: c.title,
          batches: c.batches.map((b) => ({ id: b.id, name: b.name })),
        }))}
      />
    </>
  );
}
