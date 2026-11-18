"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, requireStudentSelf } from "@/lib/auth/guards";
import { logAction } from "@/lib/audit";
import { notifyUsers } from "@/lib/notifications";
import { canAttempt, parseOptions, scoreQuizAnswers } from "@/lib/data/quizzes";

/**
 * Quizzes (agency model). Admin (quiz.manage) builds and publishes;
 * students attempt published quizzes for courses they are ACTIVE-enrolled
 * in. Scoring convention: QuizQuestion.correctAnswer stores the TEXT of
 * the correct option (see src/lib/data/quizzes.ts). Student answers are
 * the selected option texts.
 */

export type QuizResult = { ok: true; quizId: string } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Quiz CRUD
// ---------------------------------------------------------------------------

const quizSchema = z.object({
  courseId: z.string().min(1, "Select a course"),
  moduleId: z.string().optional(),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(10_000).optional(),
  passingScore: z.coerce.number().int().min(0, "Passing score must be 0–100").max(100, "Passing score must be 0–100"),
  attemptsAllowed: z.coerce.number().int().min(1, "At least 1 attempt must be allowed").max(20),
  timeLimit: z.coerce.number().int().min(1).max(600).optional(),
});

async function assertModuleInCourse(courseId: string, moduleId?: string): Promise<string | null> {
  if (!moduleId) return null;
  const mod = await db.module.findUnique({ where: { id: moduleId }, select: { courseId: true } });
  if (!mod || mod.courseId !== courseId) return "Selected module does not belong to the chosen course.";
  return null;
}

export async function createQuiz(input: z.infer<typeof quizSchema>): Promise<QuizResult> {
  const session = await requirePermission("quiz.manage");
  const parsed = quizSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const course = await db.course.findUnique({ where: { id: d.courseId }, select: { id: true } });
  if (!course) return { ok: false, error: "Course not found." };
  const moduleError = await assertModuleInCourse(d.courseId, d.moduleId);
  if (moduleError) return { ok: false, error: moduleError };

  const quiz = await db.quiz.create({
    data: {
      courseId: d.courseId,
      moduleId: d.moduleId || null,
      title: d.title,
      description: d.description || null,
      passingScore: d.passingScore,
      attemptsAllowed: d.attemptsAllowed,
      timeLimit: d.timeLimit ?? null,
    },
  });

  await logAction({
    userId: session.userId,
    action: "Created quiz",
    entity: "Quiz",
    entityId: quiz.id,
    metadata: { title: d.title, courseId: d.courseId },
  });

  revalidatePath("/admin/quizzes");
  return { ok: true, quizId: quiz.id };
}

const updateQuizSchema = quizSchema.omit({ courseId: true, moduleId: true }).extend({
  id: z.string().min(1),
});

export async function updateQuiz(input: z.infer<typeof updateQuizSchema>): Promise<QuizResult> {
  const session = await requirePermission("quiz.manage");
  const parsed = updateQuizSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const quiz = await db.quiz.findUnique({ where: { id: d.id }, select: { id: true } });
  if (!quiz) return { ok: false, error: "Quiz not found." };

  await db.quiz.update({
    where: { id: d.id },
    data: {
      title: d.title,
      description: d.description || null,
      passingScore: d.passingScore,
      attemptsAllowed: d.attemptsAllowed,
      timeLimit: d.timeLimit ?? null,
    },
  });

  await logAction({
    userId: session.userId,
    action: "Updated quiz",
    entity: "Quiz",
    entityId: d.id,
    metadata: { title: d.title },
  });

  revalidatePath("/admin/quizzes");
  revalidatePath(`/admin/quizzes/${d.id}`);
  revalidatePath("/student/quizzes");
  return { ok: true, quizId: d.id };
}

/**
 * Publish/unpublish. On the FIRST publish (draft -> published transition),
 * notify all ACTIVE-enrolled students of the course. The stable dedupeKey
 * (`quiz-published:<quizId>`) makes any repeat a no-op, mirroring the
 * lesson-published flow.
 */
export async function setQuizStatus(id: string, status: "DRAFT" | "PUBLISHED"): Promise<QuizResult> {
  const session = await requirePermission("quiz.manage");
  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, courseId: true, _count: { select: { questions: true } } },
  });
  if (!quiz) return { ok: false, error: "Quiz not found." };

  const firstPublish = status === "PUBLISHED" && quiz.status !== "PUBLISHED";
  if (firstPublish && quiz._count.questions === 0) {
    return { ok: false, error: "Add at least one question before publishing." };
  }

  await db.quiz.update({ where: { id }, data: { status } });

  await logAction({
    userId: session.userId,
    action: status === "PUBLISHED" ? "Published quiz" : "Unpublished quiz",
    entity: "Quiz",
    entityId: id,
    metadata: { title: quiz.title },
  });

  if (firstPublish) {
    const [course, enrollments] = await Promise.all([
      db.course.findUnique({ where: { id: quiz.courseId }, select: { title: true } }),
      db.enrollment.findMany({
        where: { courseId: quiz.courseId, status: "ACTIVE" },
        select: { student: { select: { userId: true } } },
      }),
    ]);
    const userIds = [...new Set(enrollments.map((e) => e.student.userId))];
    if (course && userIds.length > 0) {
      await notifyUsers(userIds, {
        type: "QUIZ",
        title: `New quiz in ${course.title}`,
        message: `"${quiz.title}" is now available. Go to Quizzes to attempt it.`,
        linkUrl: `/student/quizzes/${quiz.id}`,
        dedupeKey: `quiz-published:${quiz.id}`,
      });
    }
  }

  revalidatePath("/admin/quizzes");
  revalidatePath(`/admin/quizzes/${id}`);
  revalidatePath("/student/quizzes");
  return { ok: true, quizId: id };
}

/** Delete a quiz. QuizQuestion and QuizAttempt rows are onDelete:Cascade
 *  in the schema, so deleting a quiz also removes its questions and all
 *  recorded attempts. */
export async function deleteQuiz(id: string): Promise<QuizResult> {
  const session = await requirePermission("quiz.manage");
  const quiz = await db.quiz.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!quiz) return { ok: false, error: "Quiz not found." };

  await db.quiz.delete({ where: { id } });
  await logAction({
    userId: session.userId,
    action: "Deleted quiz",
    entity: "Quiz",
    entityId: id,
    metadata: { title: quiz.title },
  });

  revalidatePath("/admin/quizzes");
  revalidatePath("/student/quizzes");
  return { ok: true, quizId: id };
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

const questionSchema = z.object({
  quizId: z.string().min(1),
  question: z.string().min(1, "Question text is required").max(2000),
  type: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE"]),
  options: z.array(z.string().max(500)).optional(),
  correctAnswer: z.string().min(1, "Select the correct answer").max(500),
  points: z.coerce.number().int().min(1, "Points must be at least 1").max(100),
});

function validateQuestion(d: z.infer<typeof questionSchema>): { options: string[] } | { error: string } {
  if (d.type === "TRUE_FALSE") {
    if (d.correctAnswer !== "True" && d.correctAnswer !== "False") {
      return { error: "Correct answer must be True or False." };
    }
    return { options: ["True", "False"] };
  }
  const options = (d.options ?? []).map((o) => o.trim());
  if (options.length !== 4 || options.some((o) => o.length === 0)) {
    return { error: "Multiple choice questions need exactly 4 non-empty options." };
  }
  if (new Set(options).size !== options.length) {
    return { error: "Options must all be different." };
  }
  if (!options.includes(d.correctAnswer)) {
    return { error: "The correct answer must be one of the options." };
  }
  return { options };
}

export async function addQuestion(input: z.infer<typeof questionSchema>): Promise<QuizResult> {
  const session = await requirePermission("quiz.manage");
  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const v = validateQuestion(d);
  if ("error" in v) return { ok: false, error: v.error };

  const quiz = await db.quiz.findUnique({
    where: { id: d.quizId },
    select: { id: true, _count: { select: { questions: true } } },
  });
  if (!quiz) return { ok: false, error: "Quiz not found." };

  const created = await db.quizQuestion.create({
    data: {
      quizId: d.quizId,
      question: d.question,
      type: d.type,
      options: JSON.stringify(v.options),
      correctAnswer: d.correctAnswer,
      points: d.points,
      order: quiz._count.questions,
    },
  });

  await logAction({
    userId: session.userId,
    action: "Added quiz question",
    entity: "QuizQuestion",
    entityId: created.id,
    metadata: { quizId: d.quizId },
  });

  revalidatePath(`/admin/quizzes/${d.quizId}`);
  revalidatePath(`/admin/quizzes/${d.quizId}/edit`);
  return { ok: true, quizId: d.quizId };
}

const updateQuestionSchema = questionSchema.extend({ id: z.string().min(1) });

export async function updateQuestion(input: z.infer<typeof updateQuestionSchema>): Promise<QuizResult> {
  const session = await requirePermission("quiz.manage");
  const parsed = updateQuestionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const v = validateQuestion(d);
  if ("error" in v) return { ok: false, error: v.error };

  const existing = await db.quizQuestion.findUnique({ where: { id: d.id }, select: { id: true, quizId: true } });
  if (!existing || existing.quizId !== d.quizId) return { ok: false, error: "Question not found." };

  await db.quizQuestion.update({
    where: { id: d.id },
    data: {
      question: d.question,
      type: d.type,
      options: JSON.stringify(v.options),
      correctAnswer: d.correctAnswer,
      points: d.points,
    },
  });

  await logAction({
    userId: session.userId,
    action: "Updated quiz question",
    entity: "QuizQuestion",
    entityId: d.id,
    metadata: { quizId: d.quizId },
  });

  revalidatePath(`/admin/quizzes/${d.quizId}`);
  revalidatePath(`/admin/quizzes/${d.quizId}/edit`);
  return { ok: true, quizId: d.quizId };
}

export async function deleteQuestion(id: string, quizId: string): Promise<QuizResult> {
  const session = await requirePermission("quiz.manage");
  const existing = await db.quizQuestion.findUnique({ where: { id }, select: { id: true, quizId: true } });
  if (!existing || existing.quizId !== quizId) return { ok: false, error: "Question not found." };

  await db.quizQuestion.delete({ where: { id } });
  // Keep order dense after removal.
  const remaining = await db.quizQuestion.findMany({
    where: { quizId },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  await Promise.all(
    remaining.map((q, i) => db.quizQuestion.update({ where: { id: q.id }, data: { order: i } }))
  );

  await logAction({
    userId: session.userId,
    action: "Deleted quiz question",
    entity: "QuizQuestion",
    entityId: id,
    metadata: { quizId },
  });

  revalidatePath(`/admin/quizzes/${quizId}`);
  revalidatePath(`/admin/quizzes/${quizId}/edit`);
  return { ok: true, quizId };
}

export async function moveQuestion(id: string, quizId: string, direction: "up" | "down"): Promise<QuizResult> {
  await requirePermission("quiz.manage");
  const questions = await db.quizQuestion.findMany({
    where: { quizId },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });
  const idx = questions.findIndex((q) => q.id === id);
  if (idx === -1) return { ok: false, error: "Question not found." };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= questions.length) return { ok: true, quizId };

  const a = questions[idx];
  const b = questions[swapIdx];
  await db.$transaction([
    db.quizQuestion.update({ where: { id: a.id }, data: { order: b.order } }),
    db.quizQuestion.update({ where: { id: b.id }, data: { order: a.order } }),
  ]);

  revalidatePath(`/admin/quizzes/${quizId}/edit`);
  revalidatePath(`/admin/quizzes/${quizId}`);
  return { ok: true, quizId };
}

// Re-exported for tests / debugging of stored shapes.
export { parseOptions };

// ---------------------------------------------------------------------------
// Student: submit attempt
// ---------------------------------------------------------------------------

export type SubmitAttemptResult =
  | { ok: true; attemptId: string; score: number; totalPoints: number; percentage: number; passed: boolean }
  | { ok: false; error: string };

const submitSchema = z.object({
  quizId: z.string().min(1),
  answers: z.record(z.string(), z.string().max(500)),
});

export async function submitQuizAttempt(input: z.infer<typeof submitSchema>): Promise<SubmitAttemptResult> {
  const { student } = await requireStudentSelf();
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid submission." };
  const { quizId, answers } = parsed.data;

  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!quiz || quiz.status !== "PUBLISHED") {
    return { ok: false, error: "This quiz is not available." };
  }

  const enrollment = await db.enrollment.findFirst({
    where: { studentId: student.id, courseId: quiz.courseId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!enrollment) return { ok: false, error: "You are not enrolled in this course." };

  const used = await db.quizAttempt.count({ where: { quizId, studentId: student.id } });
  if (!canAttempt(used, quiz.attemptsAllowed)) {
    return { ok: false, error: "You have used all attempts for this quiz." };
  }

  // Only accept answers for this quiz's own questions.
  const questionIds = new Set(quiz.questions.map((q) => q.id));
  const cleanAnswers: Record<string, string> = {};
  for (const [qid, value] of Object.entries(answers)) {
    if (questionIds.has(qid)) cleanAnswers[qid] = value;
  }

  const result = scoreQuizAnswers(quiz.questions, cleanAnswers, quiz.passingScore);

  const attempt = await db.quizAttempt.create({
    data: {
      quizId,
      studentId: student.id,
      answers: JSON.stringify(cleanAnswers),
      score: result.score,
      percentage: result.percentage,
      passed: result.passed,
      attemptNumber: used + 1,
      completedAt: new Date(),
    },
  });

  revalidatePath("/student/quizzes");
  revalidatePath(`/student/quizzes/${quizId}`);
  revalidatePath(`/admin/quizzes/${quizId}`);
  return {
    ok: true,
    attemptId: attempt.id,
    score: result.score,
    totalPoints: result.totalPoints,
    percentage: result.percentage,
    passed: result.passed,
  };
}
