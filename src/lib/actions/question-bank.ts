"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { logAction } from "@/lib/audit";
import { questionFieldsSchema, validateQuestionFields } from "@/lib/quiz-questions";
import { copyBankItemToQuiz, copyQuizQuestionToBank } from "@/lib/data/question-bank";

/**
 * Question bank actions (quiz.manage — the same guard as the quiz
 * actions). Field validation is the SHARED quiz-question validation
 * (src/lib/quiz-questions.ts): a bank question obeys exactly the rules
 * of a quiz question, so anything in the bank can always be copied
 * into a quiz.
 */

export type BankResult = { ok: true; id: string } | { ok: false; error: string };

const bankItemSchema = questionFieldsSchema.extend({
  courseId: z.string().min(1, "Select a course"),
  moduleId: z.string().optional(),
});

async function assertModuleInCourse(courseId: string, moduleId?: string): Promise<string | null> {
  if (!moduleId) return null;
  const mod = await db.module.findUnique({ where: { id: moduleId }, select: { courseId: true } });
  if (!mod || mod.courseId !== courseId) return "Selected module does not belong to the chosen course.";
  return null;
}

export async function createBankItem(input: z.infer<typeof bankItemSchema>): Promise<BankResult> {
  const session = await requirePermission("quiz.manage");
  const parsed = bankItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const v = validateQuestionFields(d);
  if ("error" in v) return { ok: false, error: v.error };

  const course = await db.course.findUnique({ where: { id: d.courseId }, select: { id: true } });
  if (!course) return { ok: false, error: "Course not found." };
  const moduleError = await assertModuleInCourse(d.courseId, d.moduleId);
  if (moduleError) return { ok: false, error: moduleError };

  const item = await db.questionBankItem.create({
    data: {
      courseId: d.courseId,
      moduleId: d.moduleId || null,
      type: d.type,
      question: d.question,
      options: v.options === null ? null : JSON.stringify(v.options),
      correctAnswer: v.correctAnswer,
      points: d.points,
    },
  });

  await logAction({
    userId: session.userId,
    action: "Added question bank item",
    entity: "QuestionBankItem",
    entityId: item.id,
    metadata: { courseId: d.courseId, type: d.type },
  });

  revalidatePath("/admin/quizzes/bank");
  return { ok: true, id: item.id };
}

const updateBankItemSchema = bankItemSchema.extend({ id: z.string().min(1) });

export async function updateBankItem(input: z.infer<typeof updateBankItemSchema>): Promise<BankResult> {
  const session = await requirePermission("quiz.manage");
  const parsed = updateBankItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const v = validateQuestionFields(d);
  if ("error" in v) return { ok: false, error: v.error };

  const existing = await db.questionBankItem.findUnique({ where: { id: d.id }, select: { id: true } });
  if (!existing) return { ok: false, error: "Bank question not found." };
  const course = await db.course.findUnique({ where: { id: d.courseId }, select: { id: true } });
  if (!course) return { ok: false, error: "Course not found." };
  const moduleError = await assertModuleInCourse(d.courseId, d.moduleId);
  if (moduleError) return { ok: false, error: moduleError };

  await db.questionBankItem.update({
    where: { id: d.id },
    data: {
      courseId: d.courseId,
      moduleId: d.moduleId || null,
      type: d.type,
      question: d.question,
      options: v.options === null ? null : JSON.stringify(v.options),
      correctAnswer: v.correctAnswer,
      points: d.points,
    },
  });

  await logAction({
    userId: session.userId,
    action: "Updated question bank item",
    entity: "QuestionBankItem",
    entityId: d.id,
    metadata: { courseId: d.courseId, type: d.type },
  });

  revalidatePath("/admin/quizzes/bank");
  return { ok: true, id: d.id };
}

export async function deleteBankItem(id: string): Promise<BankResult> {
  const session = await requirePermission("quiz.manage");
  const existing = await db.questionBankItem.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: "Bank question not found." };

  // Deleting a bank item never touches quizzes — questions already
  // copied into quizzes are independent rows.
  await db.questionBankItem.delete({ where: { id } });

  await logAction({
    userId: session.userId,
    action: "Deleted question bank item",
    entity: "QuestionBankItem",
    entityId: id,
  });

  revalidatePath("/admin/quizzes/bank");
  return { ok: true, id };
}

/** Add a COPY of a bank item to a quiz (the copy logic and the
 *  same-course rule live in the data layer). */
export async function addBankItemToQuiz(quizId: string, bankItemId: string): Promise<BankResult> {
  const session = await requirePermission("quiz.manage");
  const res = await copyBankItemToQuiz(quizId, bankItemId);
  if (!res.ok) return res;

  await logAction({
    userId: session.userId,
    action: "Added bank question to quiz",
    entity: "QuizQuestion",
    entityId: res.id,
    metadata: { quizId, bankItemId },
  });

  revalidatePath(`/admin/quizzes/${quizId}`);
  revalidatePath(`/admin/quizzes/${quizId}/edit`);
  return res;
}

/** Save a copy of a quiz question into the bank (for the quiz's course). */
export async function saveQuizQuestionToBank(questionId: string, quizId: string): Promise<BankResult> {
  const session = await requirePermission("quiz.manage");
  const res = await copyQuizQuestionToBank(questionId);
  if (!res.ok) return res;

  await logAction({
    userId: session.userId,
    action: "Saved quiz question to bank",
    entity: "QuestionBankItem",
    entityId: res.id,
    metadata: { quizId, questionId },
  });

  revalidatePath("/admin/quizzes/bank");
  revalidatePath(`/admin/quizzes/${quizId}/edit`);
  return res;
}
