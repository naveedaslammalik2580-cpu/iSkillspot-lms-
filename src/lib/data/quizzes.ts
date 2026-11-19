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
 *
 * TIMED attempts (v3): a quiz with `timeLimit` (minutes) is attempted
 * against a server-side deadline — see the timer helpers below. The
 * clock starts when the STUDENT starts the attempt (a QuizAttempt row
 * with completedAt = null), never when the quiz is created/published.
 * An attempt that is finalized because its deadline passed carries an
 * extra top-level "expired": true marker in the wrapped shape:
 *   { "answers": {...}, "awarded": {...}, "expired": true }
 * The parser exposes it as `expired`; serializers must preserve it.
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
  /** True when this attempt was finalized by the timer (deadline passed
   *  unsubmitted). Only ever set on the wrapped shape. */
  expired: boolean;
};

/** Parse a stored QuizAttempt.answers value. Accepts the v2 wrapped
 *  shape ({answers, awarded}) and the v1 flat shape ({questionId: text}).
 *  Anything unrecognised degrades to empty maps rather than throwing. */
export function parseAttemptAnswers(raw: string | null | undefined): ParsedAttemptAnswers {
  if (!raw) return { answers: {}, awarded: {}, expired: false };
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { answers: {}, awarded: {}, expired: false };

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
    return { answers, awarded, expired: wrapped && obj.expired === true };
  } catch {
    return { answers: {}, awarded: {}, expired: false };
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

/** Serialize an attempt's answers + awarded points in the v2 wrapped shape.
 *  Pass `expired: true` only when finalizing an attempt whose time ran
 *  out — and preserve the flag when re-serializing such an attempt. */
export function serializeAttemptAnswers(
  answers: Record<string, string>,
  awarded: Record<string, number>,
  opts?: { expired?: boolean }
): string {
  return JSON.stringify(
    opts?.expired ? { answers, awarded, expired: true } : { answers, awarded }
  );
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
// Timed attempts (v3) — pure helpers, unit-tested in tests/quizzes.test.ts
//
// The SERVER deadline is the authority: deadline = startedAt + timeLimit.
// The countdown a student sees in the browser is only a UX aid ticking
// toward that same deadline; it can never extend or restart it.
// Submissions arriving within deadline + GRACE are scored normally; an
// in-progress attempt found past deadline + GRACE is finalized EXPIRED.
// ---------------------------------------------------------------------------

/** Grace window after the deadline during which a submission is still
 *  accepted (absorbs network latency and clock skew). */
export const ATTEMPT_GRACE_MS = 60_000;

export function attemptDeadline(startedAt: Date, timeLimitMinutes: number): Date {
  return new Date(startedAt.getTime() + timeLimitMinutes * 60_000);
}

/** Whole seconds left until the deadline (0 once it has passed). */
export function attemptRemainingSeconds(
  startedAt: Date,
  timeLimitMinutes: number,
  now: Date
): number {
  const ms = attemptDeadline(startedAt, timeLimitMinutes).getTime() - now.getTime();
  return Math.max(0, Math.floor(ms / 1000));
}

/** True while a submission for this attempt is still accepted:
 *  now <= deadline + grace. */
export function isWithinSubmitWindow(
  startedAt: Date,
  timeLimitMinutes: number,
  now: Date,
  graceMs: number = ATTEMPT_GRACE_MS
): boolean {
  return now.getTime() <= attemptDeadline(startedAt, timeLimitMinutes).getTime() + graceMs;
}

/** True when an in-progress attempt is past deadline + grace and must be
 *  finalized as expired. */
export function isAttemptExpired(
  startedAt: Date,
  timeLimitMinutes: number,
  now: Date,
  graceMs: number = ATTEMPT_GRACE_MS
): boolean {
  return !isWithinSubmitWindow(startedAt, timeLimitMinutes, now, graceMs);
}

/**
 * Finalize one in-progress attempt as EXPIRED: completedAt is set to the
 * deadline itself, the answers are stored with the "expired" marker, and
 * the auto-scored part is evaluated (with no submitted answers it is 0).
 * If the quiz has SHORT_ANSWER questions the attempt stays in
 * pending-marking state with its (empty) answers, exactly like a normal
 * submission awaiting marking. Returns false when the attempt is not an
 * expired in-progress timed attempt.
 */
async function finalizeAttemptAsExpired(attemptId: string): Promise<boolean> {
  const attempt = await db.quizAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.completedAt !== null) return false;

  const quiz = await db.quiz.findUnique({
    where: { id: attempt.quizId },
    select: { timeLimit: true, passingScore: true, questions: { orderBy: { order: "asc" } } },
  });
  if (!quiz || quiz.timeLimit === null) return false;
  if (!isAttemptExpired(attempt.startedAt, quiz.timeLimit, new Date())) return false;

  const { answers, awarded } = parseAttemptAnswers(attempt.answers);
  const result = evaluateAttempt(quiz.questions, answers, awarded, quiz.passingScore);
  await db.quizAttempt.update({
    where: { id: attempt.id },
    data: {
      answers: serializeAttemptAnswers(answers, awarded, { expired: true }),
      score: result.score,
      percentage: result.percentage,
      passed: result.passed,
      completedAt: attemptDeadline(attempt.startedAt, quiz.timeLimit),
    },
  });
  return true;
}

/** Lazily finalize a student's in-progress timed attempt on a quiz if it
 *  has expired. Returns true when an attempt was finalized. */
export async function finalizeExpiredAttemptIfStale(
  quizId: string,
  studentId: string
): Promise<boolean> {
  const inProgress = await db.quizAttempt.findFirst({
    where: { quizId, studentId, completedAt: null },
    select: { id: true },
  });
  if (!inProgress) return false;
  return finalizeAttemptAsExpired(inProgress.id);
}

/** Lazily finalize ALL expired in-progress timed attempts on a quiz
 *  (used when an admin views the quiz's attempts). Returns how many were
 *  finalized. */
export async function finalizeExpiredAttemptsForQuiz(quizId: string): Promise<number> {
  const quiz = await db.quiz.findUnique({ where: { id: quizId }, select: { timeLimit: true } });
  if (!quiz || quiz.timeLimit === null) return 0;
  const inProgress = await db.quizAttempt.findMany({
    where: { quizId, completedAt: null },
    select: { id: true },
  });
  let finalized = 0;
  for (const a of inProgress) {
    if (await finalizeAttemptAsExpired(a.id)) finalized++;
  }
  return finalized;
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
    /** Finalized by the timer after the deadline passed unsubmitted. */
    expired: boolean;
    /** Timed attempt started but not yet submitted or expired. */
    inProgress: boolean;
    completedAt: Date | null;
  }[];
};

export async function getQuizForAdmin(id: string): Promise<AdminQuizDetail | null> {
  // Lazy expiry: viewing the quiz finalizes any timed attempts whose
  // deadline + grace has passed, so the table below is never stale.
  await finalizeExpiredAttemptsForQuiz(id);
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
        expired: parsed.expired,
        inProgress: a.completedAt === null,
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
  /** Finalized by the timer after the deadline passed unsubmitted. */
  expired: boolean;
  /** Timed attempt started but not yet submitted or expired. */
  inProgress: boolean;
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
  // Lazy expiry, same as the quiz detail view.
  await finalizeExpiredAttemptsForQuiz(quizId);
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

  const { answers, awarded, expired } = parseAttemptAnswers(attempt.answers);
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
    expired,
    inProgress: attempt.completedAt === null,
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
  /** Pass/fail of the latest COMPLETED attempt; null while it is
   *  pending marking (or when no attempt has completed yet). */
  latestPassed: boolean | null;
  latestPendingMarking: boolean;
  /** A timed attempt has been started and is still running. */
  latestInProgress: boolean;
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
        select: { percentage: true, passed: true, answers: true, completedAt: true },
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
    // In-progress timed attempts (completedAt = null) are not results:
    // they never count toward best % or the latest pass/fail.
    const completedIdx = q.attempts
      .map((a, i) => (a.completedAt !== null ? i : -1))
      .filter((i) => i >= 0);
    const finalPercentages = completedIdx
      .filter((i) => !evaluations[i].pendingMarking)
      .map((i) => q.attempts[i].percentage);
    const latestCompletedIdx = completedIdx.length > 0 ? completedIdx[completedIdx.length - 1] : -1;
    const latestPending = latestCompletedIdx >= 0 ? evaluations[latestCompletedIdx].pendingMarking : false;
    const latestInProgress = used > 0 && q.attempts[used - 1].completedAt === null;
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
      latestPassed:
        latestCompletedIdx >= 0 && !latestPending ? q.attempts[latestCompletedIdx].passed : null,
      latestPendingMarking: latestPending,
      latestInProgress,
    };
  });
}

export type StudentInProgressAttempt = {
  attemptId: string;
  attemptNumber: number;
  startedAt: Date;
  /** Server-computed deadline (startedAt + timeLimit) — the authority
   *  the client countdown ticks toward. */
  deadline: Date;
  /** Seconds left at the moment this DTO was built. */
  remainingSeconds: number;
};

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
  /** The student's running timed attempt, if any. Only ever set on
   *  quizzes with a timeLimit — untimed quizzes have no start step. */
  inProgressAttempt: StudentInProgressAttempt | null;
  // NOTE: no correctAnswer anywhere in this DTO — by construction.
  questions: { id: string; question: string; type: string; options: string[]; points: number }[];
};

/** Quiz for the attempt form. Returns null unless the quiz is PUBLISHED and
 *  the student is ACTIVE-enrolled in its course. Correct answers are never
 *  selected from the database here, so they cannot leak to the client.
 *  Opening the quiz lazily finalizes the student's timed attempt if its
 *  deadline + grace has passed (see finalizeExpiredAttemptIfStale). */
export async function getQuizForStudentAttempt(
  quizId: string,
  studentId: string
): Promise<StudentQuizForAttempt | null> {
  await finalizeExpiredAttemptIfStale(quizId, studentId);

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
      attempts: {
        where: { studentId },
        select: { id: true, attemptNumber: true, startedAt: true, completedAt: true },
        orderBy: { attemptNumber: "asc" },
      },
    },
  });
  if (!quiz || quiz.status !== "PUBLISHED") return null;

  const enrollment = await db.enrollment.findFirst({
    where: { studentId, courseId: quiz.courseId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!enrollment) return null;

  const used = quiz.attempts.length;
  const running = quiz.attempts.find((a) => a.completedAt === null) ?? null;
  const now = new Date();
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
    inProgressAttempt:
      running && quiz.timeLimit !== null
        ? {
            attemptId: running.id,
            attemptNumber: running.attemptNumber,
            startedAt: running.startedAt,
            deadline: attemptDeadline(running.startedAt, quiz.timeLimit),
            remainingSeconds: attemptRemainingSeconds(running.startedAt, quiz.timeLimit, now),
          }
        : null,
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
  /** True when the timer closed this attempt (deadline passed
   *  unsubmitted). The student sees an explanatory banner. */
  expired: boolean;
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

  const { answers, awarded, expired } = parseAttemptAnswers(attempt.answers);
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
    expired,
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
