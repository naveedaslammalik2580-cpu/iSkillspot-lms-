import { requirePermission } from "@/lib/auth/guards";
import { PageHeader } from "@/components/page-header";
import { TeacherForm } from "@/components/teachers/teacher-form";

export default async function NewTeacherPage() {
  await requirePermission("teacher.manage");
  return (
    <>
      <PageHeader title="New teacher" description="Create a teacher account" />
      <TeacherForm />
    </>
  );
}
