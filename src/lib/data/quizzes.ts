import { db } from "@/lib/db";

/**
 * Quizzes data layer (agency model — admin manages, students attempt).
 *
 * correctAnswer CONVENTION (v1, used consistently everywhere):
 * `QuizQuestion.correctAnswer` stores the TEXT of the correct option —
 * one of the strings in the JSON `options` array for MULTIPLE_CHOICE, or
 * "True" / "False" for TRUE_FALSE. A student's submitted answer is the
 * option text they selected; scoring is an exact string match.
 */

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in tests/quizzes.test.ts)
// ---------------------------------------------------------------------------

export function parseOptions(options: string | null | undefined): string[] {
  if (!options) return [];
  try {
    const arr = JSON.parse(options);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function parseAnswers(answers: string | null | undefined): Record<string, string> {
  if (!answers) return {};
  try {
    const obj = JSON.parse(answers);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export type ScorableQuestion = { id: string; correctAnswer: string | null; points: number };

export type ScoreResult = {
  score: number;
  totalPoints: number;
  percentage: number;
  passed: boolean;
};

/** Auto-score an attempt. Boundary rule: percentage == passingScore PASSES. */
export function scoreQuizAnswers(
  questions: ScorableQuestion[],
  answers: Record<string, string>,
  passingScore: number
): ScoreResult {
  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);
  let score = 0;
  for (const q of questions) {
    if (q.correctAnswer !== null && answers[q.id] === q.correctAnswer) {
      score += q.points;
    }
  }
  const percentage = totalPoints > 0 ? (score / totalPoints) * 100 : 0;
  return { score, totalPoints, percentage, passed: percentage >= passingScore };
}

export function canAttempt(attemptsUsed: number, attemptsAllowed: number): boolean {
  return attemptsUsed < attemptsAllowed;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export type AdminQuizListItem = {
  id: string;
  title: string;
  courseTitle: string;
  moduleTitle: string | null;
  status: string;
  passingScore: number;
  attemptsAllowed: number;
  questionCount: number;
  totalPoints: number;
  attemptCount: number;
};

export async function getQuizzesForAdmin(filter: { courseId?: string } = {}): Promise<AdminQuizListItem[]> {
  const quizzes = await db.quiz.findMany({
    where: filter.courseId ? { courseId: filter.courseId } : {},
    select: {
      id: true,
      title: true,
      status: true,
      passingScore: true,
      attemptsAllowed: true,
      course: { select: { title: true } },
      module: { select: { title: true } },
      questions: { select: { points: true } },
      _count: { select: { attempts: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return quizzes.map((q) => ({
    id: q.id,
    title: q.title,
    courseTitle: q.course.title,
    moduleTitle: q.module?.title ?? null,
    status: q.status,
    passingScore: q.passingScore,
    attemptsAllowed: q.attemptsAllowed,
    questionCount: q.questions.length,
    totalPoints: q.questions.reduce((s, x) => s + x.points, 0),
    attemptCount: q._count.attempts,
  }));
}

export type AdminQuizDetail = {
  id: string;
  title: string;
  description: string | null;
  courseId: string;
  courseTitle: string;
  moduleId: string | null;
  moduleTitle: string | null;
  passingScore: number;
  timeLimit: number | null;
  attemptsAllowed: number;
  status: string;
  totalPoints: number;
  questions: {
    id: string;
    question: string;
    type: string;
    options: string[];
    correctAnswer: string | null;
    points: number;
    order: number;
  }[];
  attempts: {
    id: string;
    studentName: string;
    studentCode: string;
    attemptNumber: number;
    score: number;
    percentage: number;
    passed: boolean;
    completedAt: Date | null;
  }[];
};

export async function getQuizForAdmin(id: string): Promise<AdminQuizDetail | null> {
  const quiz = await db.quiz.findUnique({
    where: { id },
    include: {
      course: { select: { title: true } },
      module: { select: { title: true } },
      questions: { orderBy: { order: "asc" } },
      attempts: {
        include: { student: { select: { fullName: true, studentId: true } } },
        orderBy: { completedAt: "desc" },
      },
    },
  });
  if (!quiz) return null;
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    courseId: quiz.courseId,
    courseTitle: quiz.course.title,
    moduleId: quiz.moduleId,
    moduleTitle: quiz.module?.title ?? null,
    passingScore: quiz.passingScore,
    timeLimit: quiz.timeLimit,
    attemptsAllowed: quiz.attemptsAllowed,
    status: quiz.status,
    totalPoints: quiz.questions.reduce((s, q) => s + q.points, 0),
    questions: quiz.questions.map((q) => ({
      id: q.id,
      question: q.question,
      type: q.type,
      options: parseOptions(q.options),
      correctAnswer: q.correctAnswer,
      points: q.points,
      order: q.order,
    })),
    attempts: quiz.attempts.map((a) => ({
      id: a.id,
      studentName: a.student.fullName,
      studentCode: a.student.studentId,
      attemptNumber: a.attemptNumber,
      score: a.score,
      percentage: a.percentage,
      passed: a.passed,
      completedAt: a.completedAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

export type StudentQuizListItem = {
  id: string;
  title: string;
  courseTitle: string;
  moduleTitle: string | null;
  passingScore: number;
  attemptsAllowed: number;
  questionCount: number;
  myAttemptCount: number;
  attemptsRemaining: number;
  bestPercentage: number | null;
  latestPassed: boolean | null;
};

export async function getQuizzesForStudent(studentId: string): Promise<StudentQuizListItem[]> {
  const enrollments = await db.enrollment.findMany({
    where: { studentId, status: "ACTIVE" },
    select: { courseId: true },
  });
  const courseIds = [...new Set(enrollments.map((e) => e.courseId))];
  if (courseIds.length === 0) return [];

  const quizzes = await db.quiz.findMany({
    where: { courseId: { in: courseIds }, status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      passingScore: true,
      attemptsAllowed: true,
      course: { select: { title: true } },
      module: { select: { title: true } },
      _count: { select: { questions: true } },
      attempts: {
        where: { studentId },
        select: { percentage: true, passed: true },
        orderBy: { attemptNumber: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return quizzes.map((q) => {
    const used = q.attempts.length;
    return {
      id: q.id,
      title: q.title,
      courseTitle: q.course.title,
      moduleTitle: q.module?.title ?? null,
      passingScore: q.passingScore,
      attemptsAllowed: q.attemptsAllowed,
      questionCount: q._count.questions,
      myAttemptCount: used,
      attemptsRemaining: Math.max(0, q.attemptsAllowed - used),
      bestPercentage: used > 0 ? Math.max(...q.attempts.map((a) => a.percentage)) : null,
      latestPassed: used > 0 ? q.attempts[used - 1].passed : null,
    };
  });
}

export type StudentQuizForAttempt = {
  id: string;
  title: string;
  description: string | null;
  courseTitle: string;
  moduleTitle: string | null;
  passingScore: number;
  timeLimit: number | null;
  attemptsAllowed: number;
  myAttemptCount: number;
  attemptsRemaining: number;
  // NOTE: no correctAnswer anywhere in this DTO — by construction.
  questions: { id: string; question: string; type: string; options: string[]; points: number }[];
};

/** Quiz for the attempt form. Returns null unless the quiz is PUBLISHED and
 *  the student is ACTIVE-enrolled in its course. Correct answers are never
 *  selected from the database here, so they cannot leak to the client. */
export async function getQuizForStudentAttempt(
  quizId: string,
  studentId: string
): Promise<StudentQuizForAttempt | null> {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      courseId: true,
      passingScore: true,
      timeLimit: true,
      attemptsAllowed: true,
      course: { select: { title: true } },
      module: { select: { title: true } },
      questions: {
        select: { id: true, question: true, type: true, options: true, points: true },
        orderBy: { order: "asc" },
      },
      attempts: { where: { studentId }, select: { id: true } },
    },
  });
  if (!quiz || quiz.status !== "PUBLISHED") return null;

  const enrollment = await db.enrollment.findFirst({
    where: { studentId, courseId: quiz.courseId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!enrollment) return null;

  const used = quiz.attempts.length;
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    courseTitle: quiz.course.title,
    moduleTitle: quiz.module?.title ?? null,
    passingScore: quiz.passingScore,
    timeLimit: quiz.timeLimit,
    attemptsAllowed: quiz.attemptsAllowed,
    myAttemptCount: used,
    attemptsRemaining: Math.max(0, quiz.attemptsAllowed - used),
    questions: quiz.questions.map((q) => ({
      id: q.id,
      question: q.question,
      type: q.type,
      options: parseOptions(q.options),
      points: q.points,
    })),
  };
}

export type StudentAttemptReview = {
  attemptId: string;
  attemptNumber: number;
  score: number;
  totalPoints: number;
  percentage: number;
  passed: boolean;
  passingScore: number;
  completedAt: Date | null;
  questions: {
    id: string;
    question: string;
    type: string;
    options: string[];
    points: number;
    yourAnswer: string | null;
    correctAnswer: string | null;
    isCorrect: boolean;
  }[];
};

/** Post-attempt review. Only reachable for the student's OWN completed
 *  attempt — this is the single place correct answers are shown to a
 *  student, and only after they have submitted. */
export async function getStudentAttemptReview(
  quizId: string,
  studentId: string,
  attemptId?: string
): Promise<StudentAttemptReview | null> {
  const attempt = attemptId
    ? await db.quizAttempt.findFirst({ where: { id: attemptId, quizId, studentId } })
    : await db.quizAttempt.findFirst({
        where: { quizId, studentId },
        orderBy: { attemptNumber: "desc" },
      });
  if (!attempt) return null;

  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: {
      passingScore: true,
      questions: { orderBy: { order: "asc" } },
    },
  });
  if (!quiz) return null;

  const answers = parseAnswers(attempt.answers);
  return {
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
    score: attempt.score,
    totalPoints: quiz.questions.reduce((s, q) => s + q.points, 0),
    percentage: attempt.percentage,
    passed: attempt.passed,
    passingScore: quiz.passingScore,
    completedAt: attempt.completedAt,
    questions: quiz.questions.map((q) => {
      const yourAnswer = answers[q.id] ?? null;
      return {
        id: q.id,
        question: q.question,
        type: q.type,
        options: parseOptions(q.options),
        points: q.points,
        yourAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect: q.correctAnswer !== null && yourAnswer === q.correctAnswer,
      };
    }),
  };
}

export async function getStudentAttemptHistory(studentId: string, quizId: string) {
  return db.quizAttempt.findMany({
    where: { studentId, quizId },
    orderBy: { attemptNumber: "asc" },
    select: {
      id: true,
      attemptNumber: true,
      score: true,
      percentage: true,
      passed: true,
      completedAt: true,
    },
  });
}
