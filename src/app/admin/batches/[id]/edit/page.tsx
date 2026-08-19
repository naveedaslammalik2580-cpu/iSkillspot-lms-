import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getBatchById } from "@/lib/data/batches";
import { getCoursePicker } from "@/lib/data/courses";
import { getTeacherPicker } from "@/lib/data/teachers";
import { PageHeader } from "@/components/page-header";
import { BatchForm } from "@/components/batches/batch-form";

export default async function EditBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("batch.manage");
  const { id } = await params;
  const [batch, courses, teachers] = await Promise.all([
    getBatchById(id),
    getCoursePicker(),
    getTeacherPicker(),
  ]);
  if (!batch) notFound();

  return (
    <>
      <PageHeader title="Edit batch" description={batch.name} />
      <BatchForm
        courses={courses}
        teachers={teachers}
        batch={{
          id: batch.id,
          code: batch.code,
          name: batch.name,
          courseId: batch.courseId,
          teacherId: batch.teacherId,
          startDate: batch.startDate ? batch.startDate.toISOString().slice(0, 10) : "",
          endDate: batch.endDate ? batch.endDate.toISOString().slice(0, 10) : "",
          status: batch.status,
        }}
      />
    </>
  );
}
