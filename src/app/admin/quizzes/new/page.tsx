import { requirePermission } from "@/lib/auth/guards";
import { getCoursesForAdmin } from "@/lib/data/assignments";
import { PageHeader } from "@/components/page-header";
import { QuizForm } from "@/components/quizzes/quiz-form";

export default async function NewQuizPage() {
  await requirePermission("quiz.manage");
  const courses = await getCoursesForAdmin();
  return (
    <>
      <PageHeader title="New quiz" description="Create a quiz, then add its questions" />
      <QuizForm courses={courses} />
    </>
  );
}
