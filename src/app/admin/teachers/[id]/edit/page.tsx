import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getTeacherById } from "@/lib/data/teachers";
import { PageHeader } from "@/components/page-header";
import { TeacherForm } from "@/components/teachers/teacher-form";

export default async function EditTeacherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("teacher.manage");
  const { id } = await params;
  const teacher = await getTeacherById(id);
  if (!teacher) notFound();

  return (
    <>
      <PageHeader title="Edit teacher" description={teacher.fullName} />
      <TeacherForm
        teacher={{
          id: teacher.id,
          fullName: teacher.fullName,
          phone: teacher.phone,
          specialization: teacher.specialization,
        }}
      />
    </>
  );
}
