import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getStudentForEdit } from "@/lib/data/students";
import { PageHeader } from "@/components/page-header";
import { StudentForm } from "@/components/students/student-form";

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("student.edit");
  const { id } = await params;
  const student = await getStudentForEdit(id);
  if (!student) notFound();

  return (
    <>
      <PageHeader title="Edit student" description={student.fullName} />
      <StudentForm student={student} />
    </>
  );
}
