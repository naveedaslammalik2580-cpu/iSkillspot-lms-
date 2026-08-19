import { requirePermission } from "@/lib/auth/guards";
import { getCoursePicker } from "@/lib/data/courses";
import { getTeacherPicker } from "@/lib/data/teachers";
import { PageHeader } from "@/components/page-header";
import { BatchForm } from "@/components/batches/batch-form";

export default async function NewBatchPage() {
  await requirePermission("batch.manage");
  const [courses, teachers] = await Promise.all([getCoursePicker(), getTeacherPicker()]);
  return (
    <>
      <PageHeader title="New batch" description="Create a batch under a course" />
      <BatchForm courses={courses} teachers={teachers} />
    </>
  );
}
