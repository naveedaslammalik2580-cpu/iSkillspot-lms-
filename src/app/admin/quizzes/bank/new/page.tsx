import { requirePermission } from "@/lib/auth/guards";
import { getCoursesForAdmin } from "@/lib/data/assignments";
import { PageHeader } from "@/components/page-header";
import { BankItemForm } from "@/components/quizzes/bank-item-form";

export default async function NewBankItemPage() {
  await requirePermission("quiz.manage");
  const courses = await getCoursesForAdmin();

  return (
    <>
      <PageHeader title="New bank question" description="Save a reusable question for this course's quizzes" />
      <BankItemForm courses={courses} />
    </>
  );
}
