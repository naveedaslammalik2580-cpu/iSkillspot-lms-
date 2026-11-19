import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getBankItem } from "@/lib/data/question-bank";
import { getCoursesForAdmin } from "@/lib/data/assignments";
import { PageHeader } from "@/components/page-header";
import { BankItemForm } from "@/components/quizzes/bank-item-form";

export default async function EditBankItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("quiz.manage");
  const { id } = await params;
  const [item, courses] = await Promise.all([getBankItem(id), getCoursesForAdmin()]);
  if (!item) notFound();

  return (
    <>
      <PageHeader
        title="Edit bank question"
        description="Editing the bank item does not change copies already added to quizzes"
      />
      <BankItemForm
        courses={courses}
        item={{
          id: item.id,
          courseId: item.courseId,
          moduleId: item.moduleId,
          type: item.type,
          question: item.question,
          options: item.options,
          correctAnswer: item.correctAnswer,
          points: item.points,
        }}
      />
    </>
  );
}
