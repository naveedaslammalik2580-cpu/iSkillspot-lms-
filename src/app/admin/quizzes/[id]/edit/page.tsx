import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getQuizForAdmin } from "@/lib/data/quizzes";
import { getBankItemsForCourse } from "@/lib/data/question-bank";
import { getCoursesForAdmin } from "@/lib/data/assignments";
import { PageHeader } from "@/components/page-header";
import { QuizForm } from "@/components/quizzes/quiz-form";
import { QuestionEditor } from "@/components/quizzes/question-editor";
import { BankPicker } from "@/components/quizzes/bank-picker";

export default async function EditQuizPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("quiz.manage");
  const { id } = await params;
  const [quiz, courses] = await Promise.all([getQuizForAdmin(id), getCoursesForAdmin()]);
  if (!quiz) notFound();
  const bankItems = await getBankItemsForCourse(quiz.courseId);

  return (
    <>
      <PageHeader title={`Edit quiz — ${quiz.title}`} description="Update the quiz settings and manage its questions" />
      <div className="space-y-8">
        <QuizForm
          courses={courses}
          quiz={{
            id: quiz.id,
            courseTitle: quiz.courseTitle,
            moduleTitle: quiz.moduleTitle,
            title: quiz.title,
            description: quiz.description,
            passingScore: quiz.passingScore,
            attemptsAllowed: quiz.attemptsAllowed,
            timeLimit: quiz.timeLimit,
          }}
        />
        <div>
          <h2 className="mb-4 text-lg font-semibold">
            Questions ({quiz.questions.length}) · {quiz.totalPoints} points total
          </h2>
          <QuestionEditor quizId={quiz.id} questions={quiz.questions} />
        </div>
        <BankPicker
          quizId={quiz.id}
          items={bankItems.map((item) => ({
            id: item.id,
            question: item.question,
            type: item.type,
            points: item.points,
            moduleTitle: item.moduleTitle,
          }))}
        />
      </div>
    </>
  );
}
