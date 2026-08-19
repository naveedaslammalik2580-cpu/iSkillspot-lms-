import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getStudent360 } from "@/lib/data/students";
import { PageHeader } from "@/components/page-header";
import { StudentForm } from "@/components/students/student-form";

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("student.edit");
  const { id } = await params;
  const data = await getStudent360(id);
  if (!data) notFound();

  const { student } = data;

  return (
    <>
      <PageHeader title="Edit student" description={student.fullName} />
      <StudentForm
        student={{
          id: student.id,
          fullName: student.fullName,
          fatherName: student.fatherName,
          phone: student.phone,
          whatsapp: student.whatsapp,
          address: student.address,
          city: student.city,
          status: student.status,
          notes: student.notes,
        }}
      />
    </>
  );
}
