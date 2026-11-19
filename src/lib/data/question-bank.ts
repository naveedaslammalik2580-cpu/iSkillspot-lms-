import { db } from "@/lib/db";
import { parseOptions } from "@/lib/data/quizzes";

/**
 * Question bank data layer.
 *
 * A bank item is a reusable question scoped to a course (optionally to
 * one of its modules). Adding an item to a quiz COPIES it into a
 * QuizQuestion row — the copy is fully independent: later edits or
 * deletion of the bank item never change existing quizzes. Field
 * conventions mirror QuizQuestion exactly (see src/lib/data/quizzes.ts):
 * `options` is the same JSON shape and `correctAnswer` stores the
 * correct option TEXT, or the optional model answer for SHORT_ANSWER.
 */

export type BankItem = {
  id: string;
  courseId: string;
  courseTitle: string;
  moduleId: string | null;
  moduleTitle: string | null;
  type: string;
  question: string;
  options: string[];
  correctAnswer: string | null;
  points: number;
  createdAt: Date;
  updatedAt: Date;
};

type BankRow = {
  id: string;
  courseId: string;
  course: { title: string };
  moduleId: string | null;
  module: { title: string } | null;
  type: string;
  question: string;
  options: string | null;
  correctAnswer: string | null;
  points: number;
  createdAt: Date;
  updatedAt: Date;
};

function toBankItem(row: BankRow): BankItem {
  return {
    id: row.id,
    courseId: row.courseId,
    courseTitle: row.course.title,
    moduleId: row.moduleId,
    moduleTitle: row.module?.title ?? null,
    type: row.type,
    question: row.question,
    options: parseOptions(row.options),
    correctAnswer: row.correctAnswer,
    points: row.points,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const bankSelect = {
  id: true,
  courseId: true,
  course: { select: { title: true } },
  moduleId: true,
  module: { select: { title: true } },
  type: true,
  question: true,
  options: true,
  correctAnswer: true,
  points: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function getBankItems(
  filter: { courseId?: string; moduleId?: string } = {}
): Promise<BankItem[]> {
  const rows = await db.questionBankItem.findMany({
    where: {
      ...(filter.courseId ? { courseId: filter.courseId } : {}),
      ...(filter.moduleId ? { moduleId: filter.moduleId } : {}),
    },
    select: bankSelect,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toBankItem);
}

/** Bank items for one course — what the quiz builder's "Add from
 *  Question Bank" panel offers. */
export async function getBankItemsForCourse(courseId: string): Promise<BankItem[]> {
  return getBankItems({ courseId });
}

export async function getBankItem(id: string): Promise<BankItem | null> {
  const row = await db.questionBankItem.findUnique({ where: { id }, select: bankSelect });
  return row ? toBankItem(row) : null;
}

export type CopyResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Copy a bank item into a quiz as a new QuizQuestion (next order value).
 * The item MUST belong to the quiz's course — cross-course copies are
 * rejected here, at the data level, not just hidden in the UI.
 */
export async function copyBankItemToQuiz(quizId: string, bankItemId: string): Promise<CopyResult> {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: { id: true, courseId: true, _count: { select: { questions: true } } },
  });
  if (!quiz) return { ok: false, error: "Quiz not found." };

  const item = await db.questionBankItem.findUnique({ where: { id: bankItemId } });
  if (!item) return { ok: false, error: "Bank question not found." };
  if (item.courseId !== quiz.courseId) {
    return { ok: false, error: "That question belongs to a different course and cannot be added to this quiz." };
  }

  const created = await db.quizQuestion.create({
    data: {
      quizId,
      question: item.question,
      type: item.type,
      options: item.options,
      correctAnswer: item.correctAnswer,
      points: item.points,
      order: quiz._count.questions,
    },
  });
  return { ok: true, id: created.id };
}

/** Copy a quiz question into the bank, scoped to the quiz's course and
 *  module. The bank copy is independent of the quiz question. */
export async function copyQuizQuestionToBank(questionId: string): Promise<CopyResult> {
  const question = await db.quizQuestion.findUnique({
    where: { id: questionId },
    include: { quiz: { select: { courseId: true, moduleId: true } } },
  });
  if (!question) return { ok: false, error: "Question not found." };

  const created = await db.questionBankItem.create({
    data: {
      courseId: question.quiz.courseId,
      moduleId: question.quiz.moduleId,
      type: question.type,
      question: question.question,
      options: question.options,
      correctAnswer: question.correctAnswer,
      points: question.points,
    },
  });
  return { ok: true, id: created.id };
}
