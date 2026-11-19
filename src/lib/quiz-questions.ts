import { z } from "zod";

/**
 * Shared quiz-question field schema + validation.
 *
 * Used by BOTH the quiz actions (src/lib/actions/quizzes.ts) and the
 * question-bank actions (src/lib/actions/question-bank.ts) so a question
 * is validated by exactly the same rules wherever it is created. This
 * module is deliberately NOT a "use server" file — server-action modules
 * may only export async functions, and these helpers are synchronous.
 *
 * Conventions (see src/lib/data/quizzes.ts): for MULTIPLE_CHOICE /
 * TRUE_FALSE, correctAnswer is the TEXT of the correct option; for
 * SHORT_ANSWER it is the optional model answer (marking reference only,
 * never shown to students). MULTIPLE_ANSWER is intentionally not offered
 * (skipped by product decision).
 */
export const questionFieldsSchema = z.object({
  question: z.string().min(1, "Question text is required").max(2000),
  type: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"]),
  options: z.array(z.string().max(500)).optional(),
  // For MULTIPLE_CHOICE / TRUE_FALSE this is the correct option text and
  // is required (enforced in validateQuestionFields). For SHORT_ANSWER
  // it is the optional model answer used as a marking reference.
  correctAnswer: z.string().max(5000).optional(),
  points: z.coerce.number().int().min(1, "Points must be at least 1").max(100),
});

export type QuestionFields = z.infer<typeof questionFieldsSchema>;

export type ValidatedQuestion =
  | { options: string[] | null; correctAnswer: string | null }
  | { error: string };

/** Normalize + validate raw question fields into the stored shape:
 *  `options` as a string array (null for SHORT_ANSWER) and the stored
 *  correctAnswer (option text, or model answer / null for SHORT_ANSWER). */
export function validateQuestionFields(d: QuestionFields): ValidatedQuestion {
  if (d.type === "SHORT_ANSWER") {
    const modelAnswer = d.correctAnswer?.trim() ?? "";
    return { options: null, correctAnswer: modelAnswer || null };
  }
  if (!d.correctAnswer) return { error: "Select the correct answer." };
  if (d.type === "TRUE_FALSE") {
    if (d.correctAnswer !== "True" && d.correctAnswer !== "False") {
      return { error: "Correct answer must be True or False." };
    }
    return { options: ["True", "False"], correctAnswer: d.correctAnswer };
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
  return { options, correctAnswer: d.correctAnswer };
}
