import { db } from "@/lib/db";

/**
 * Quizzes data layer (agency model — admin manages, students attempt).
 *
 * correctAnswer CONVENTION (used consistently everywhere):
 * `QuizQuestion.correctAnswer` stores the TEXT of the correct option —
 * one of the strings in the JSON `options` array for MULTIPLE_CHOICE, or
 * "True" / "False" for TRUE_FALSE. A student's submitted answer is the
 * option text they selected; scoring is an exact string match.
 *
 * SHORT_ANSWER questions (v2) have no options. For them, `correctAnswer`
 * stores an optional MODEL ANSWER — a marking reference for the admin
 * only. It is never sent to students (not in the attempt DTO, not in the
 * post-attempt review). Written answers are marked by an admin, who
 * awards points per question.
 *
 * QuizAttempt.answers FORMAT (v2): a JSON string of the wrapped shape
 *   { "answers": { [questionId]: answerText },
 *     "awarded": { [questionId]: pointsAwarded } }
 * `awarded` only ever holds entries for SHORT_ANSWER questions, written
 * by the marking action. v1 attempts stored a FLAT map
 * { [questionId]: answerText } with no wrapper — the parsers below
 * accept BOTH shapes so old attempts keep rendering.
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

export type ParsedAttemptAnswers = {
  answers: Record<string, string>;
  awarded: Record<string, number>;
};

/** Parse a stored QuizAttempt.answers value. Accepts the v2 wrapped
 *  shape ({answers, awarded}) and the v1 flat shape ({questionId: text}).
 *  Anything unrecognised degrades to empty maps rather than throwing. */
export function parseAttemptAnswers(raw: string | null | undefined): ParsedAttemptAnswers {
  if (!raw) return { answers: {}, awarded: {} };
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { answers: {}, awarded: {} };

    const wrapped =
      obj.answers !== null && typeof obj.answers === "object" && !Array.isArray(obj.answers);
    const answersRaw: Record<string, unknown> = wrapped ? obj.answers : obj;
    const answers: Record<string, string> = {};
    for (const [k, v] of Object.entries(answersRaw)) {
      if (typeof v === "string") answers[k] = v;
    }

    const awarded: Record<string, number> = {};
    if (wrapped && obj.awarded !== null && typeof obj.awarded === "object" && !Array.isArray(obj.awarded)) {
      for (const [k, v] of Object.entries(obj.awarded)) {
        if (typeof v === "number" && Number.isFinite(v)) awarded[k] = v;
      }
    }
    return { answers, awarded };
  } catch {
    return { answers: {}, awarded: {} };
  }
}

/** Just the student's answer texts, from either stored shape. */
export function parseAnswers(answers: string | null | undefined): Record<string, string> {
  return parseAttemptAnswers(answers).answers;
}

/** Just the admin-awarded points (SHORT_ANSWER questions only). */
export function parseAwarded(answers: string | null | undefined): Record<string, number> {
  return parseAttemptAnswers(answers).awarded;
}

/** Serialize an attempt's answers + awarded points in the v2 wrapped shape. */
export function serializeAttemptAnswers(
  answers: Record<string, string>,
  awarded: Record<string, number>
): string {
  return JSON.stringify({ answers, awarded });
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

export type MarkableQuestion = ScorableQuestion & { type: string };

export function isShortAnswer(q: { type: string }): boolean {
  return q.type === "SHORT_ANSWER";
}

export type AttemptEvaluation = {
  /** Points from auto-scored questions (everything except SHORT_ANSWER). */
  autoScore: number;
  /** Total points available on auto-scored questions. */
  autoTotalPoints: number;
  /** Sum of admin-awarded points across SHORT_ANSWER questions. */
  awardedScore: number;
  /** True while any SHORT_ANSWER question lacks an awarded value. */
  pendingMarking: boolean;
  /** While pending: auto part only. Once final: auto + awarded. */
  score: number;
  totalPoints: number;
  percentage: number;
  passed: boolean;
};

/**
 * Evaluate an attempt across auto-scored and manually marked questions.
 *
 * While marking is pending, score/percentage/passed reflect ONLY the
 * auto-scored part (callers must not present them as final). Once every
 * SHORT_ANSWER question has an awarded value, totals are recomputed
 * across ALL questions. Boundary rule matches scoreQuizAnswers:
 * percentage == passingScore PASSES.
 */
export function evaluateAttempt(
  questions: MarkableQuestion[],
  answers: Record<string, string>,
  awarded: Record<string, number>,
  passingScore: number
): AttemptEvaluation {
  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);
  const autoQuestions = questions.filter((q) => !isShortAnswer(q));
  const shortQuestions = questions.filter((q) => isShortAnswer(q));

  const auto = scoreQuizAnswers(autoQuestions, answers, passingScore);
  const pendingMarking = shortQuestions.some((q) => typeof awarded[q.id] !== "number");
  const awardedScore = shortQuestions.reduce(
    (sum, q) => sum + (typeof awarded[q.id] === "number" ? awarded[q.id] : 0),
    0
  );

  if (pendingMarking) {
    return {
      autoScore: auto.score,
      autoTotalPoints: auto.totalPoints,
      awardedScore,
      pendingMarking: true,
      score: auto.score,
      totalPoints,
      percentage: totalPoints > 0 ? (auto.score / totalPoints) * 100 : 0,
      passed: totalPoints > 0 ? (auto.score / totalPoints) * 100 >= passingScore : false,
    };
  }

  const score = auto.score + awardedScore;
  const percentage = totalPoints > 0 ? (score / totalPoints) * 100 : 0;
  return {
    autoScore: auto.score,
    autoTotalPoints: auto.totalPoints,
    awardedScore,
    pendingMarking: false,
    score,
    totalPoints,
    percentage,
    passed: percentage >= passingScore,
  };
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
    pendingMarking: boolean;
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
    attempts: quiz.attempts.map((a) => {
      const parsed = parseAttemptAnswers(a.answers);
      const evaluation = evaluateAttempt(quiz.questions, parsed.answers, parsed.awarded, quiz.passingScore);
      return {
        id: a.id,
        studentName: a.student.fullName,
        studentCode: a.student.studentId,
        attemptNumber: a.attemptNumber,
        score: a.score,
        percentage: a.percentage,
        passed: a.passed,
        pendingMarking: evaluation.pendingMarking,
        completedAt: a.completedAt,
      };
    }),
  };
}

export type AdminAttemptDetail = {
  quizId: string;
  quizTitle: string;
  passingScore: number;
  attemptId: string;
  attemptNumber: number;
  studentName: string;
  studentCode: string;
  completedAt: Date | null;
  evaluation: AttemptEvaluation;
  questions: {
    id: string;
    question: string;
    type: string;
    options: string[];
    points: number;
    /** Correct option text (auto) or model answer (SHORT_ANSWER). Admin only. */
    correctAnswer: string | null;
    yourAnswer: string | null;
    isAuto: boolean;
    isCorrect: boolean | null;
    earnedPoints: number | null;
    awardedPoints: number | null;
  }[];
};

/** One attempt in full, for the admin marking page. Admin-only data:
 *  includes correct answers and model answers. */
export async function getQuizAttemptForAdmin(
  quizId: string,
  attemptId: string
): Promise<AdminAttemptDetail | null> {
  const attempt = await db.quizAttempt.findFirst({
    where: { id: attemptId, quizId },
    include: { student: { select: { fullName: true, studentId: true } } },
  });
  if (!attempt) return null;

  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: { title: true, passingScore: true, questions: { orderBy: { order: "asc" } } },
  });
  if (!quiz) return null;

  const { answers, awarded } = parseAttemptAnswers(attempt.answers);
  const evaluation = evaluateAttempt(quiz.questions, answers, awarded, quiz.passingScore);

  return {
    quizId,
    quizTitle: quiz.title,
    passingScore: quiz.passingScore,
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
    studentName: attempt.student.fullName,
    studentCode: attempt.student.studentId,
    completedAt: attempt.completedAt,
    evaluation,
    questions: quiz.questions.map((q) => {
      const yourAnswer = answers[q.id] ?? null;
      const auto = !isShortAnswer(q);
      return {
        id: q.id,
        question: q.question,
        type: q.type,
        options: parseOptions(q.options),
        points: q.points,
        correctAnswer: q.correctAnswer,
        yourAnswer,
        isAuto: auto,
        isCorrect: auto ? q.correctAnswer !== null && yourAnswer === q.correctAnswer : null,
        earnedPoints: auto ? (q.correctAnswer !== null && yourAnswer === q.correctAnswer ? q.points : 0) : null,
        awardedPoints: auto ? null : typeof awarded[q.id] === "number" ? awarded[q.id] : null,
      };
    }),
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
  /** Best percentage across FINAL (fully marked) attempts only. */
  bestPercentage: number | null;
  /** Pass/fail of the latest attempt; null while it is pending marking. */
  latestPassed: boolean | null;
  latestPendingMarking: boolean;
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
      questions: { select: { id: true, type: true, correctAnswer: true, points: true } },
      attempts: {
        where: { studentId },
        select: { percentage: true, passed: true, answers: true },
        orderBy: { attemptNumber: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return quizzes.map((q) => {
    const used = q.attempts.length;
    const evaluations = q.attempts.map((a) => {
      const parsed = parseAttemptAnswers(a.answers);
      return evaluateAttempt(q.questions, parsed.answers, parsed.awarded, q.passingScore);
    });
    const finalPercentages = q.attempts
      .filter((_, i) => !evaluations[i].pendingMarking)
      .map((a) => a.percentage);
    const latestPending = used > 0 ? evaluations[used - 1].pendingMarking : false;
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
      bestPercentage: finalPercentages.length > 0 ? Math.max(...finalPercentages) : null,
      latestPassed: used > 0 && !latestPending ? q.attempts[used - 1].passed : null,
      latestPendingMarking: latestPending,
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
  /** True while written answers await admin marking. While pending,
   *  score/percentage/passed cover ONLY the auto-scored part and must
   *  not be presented as the final result. */
  pendingMarking: boolean;
  autoScore: number;
  autoTotalPoints: number;
  questions: {
    id: string;
    question: string;
    type: string;
    options: string[];
    points: number;
    yourAnswer: string | null;
    /** Correct option text for auto-scored questions. ALWAYS null for
     *  SHORT_ANSWER — the model answer is a marking reference and is
     *  never shown to students. */
    correctAnswer: string | null;
    isCorrect: boolean;
    isAuto: boolean;
    /** Points awarded by the admin for a SHORT_ANSWER question;
     *  null while unmarked (and for auto-scored questions). */
    awardedPoints: number | null;
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

  const { answers, awarded } = parseAttemptAnswers(attempt.answers);
  const evaluation = evaluateAttempt(quiz.questions, answers, awarded, quiz.passingScore);
  return {
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
    score: attempt.score,
    totalPoints: quiz.questions.reduce((s, q) => s + q.points, 0),
    percentage: attempt.percentage,
    passed: attempt.passed,
    passingScore: quiz.passingScore,
    completedAt: attempt.completedAt,
    pendingMarking: evaluation.pendingMarking,
    autoScore: evaluation.autoScore,
    autoTotalPoints: evaluation.autoTotalPoints,
    questions: quiz.questions.map((q) => {
      const yourAnswer = answers[q.id] ?? null;
      const auto = !isShortAnswer(q);
      const awardedPoints = auto ? null : typeof awarded[q.id] === "number" ? awarded[q.id] : null;
      return {
        id: q.id,
        question: q.question,
        type: q.type,
        options: parseOptions(q.options),
        points: q.points,
        yourAnswer,
        correctAnswer: auto ? q.correctAnswer : null,
        isCorrect: auto
          ? q.correctAnswer !== null && yourAnswer === q.correctAnswer
          : awardedPoints !== null && awardedPoints >= q.points,
        isAuto: auto,
        awardedPoints,
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
