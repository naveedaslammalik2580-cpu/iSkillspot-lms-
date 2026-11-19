/**
 * Quizzes integration tests — node:test via tsx.
 *
 * Run against a DISPOSABLE database only (refuses to run unless the
 * database name contains "test"). Fixtures are created here and deleted
 * afterwards via cascade.
 *
 * Session-bound server actions (submitQuizAttempt, quiz CRUD) are covered
 * by browser E2E; this suite covers the pure scoring helpers and the data
 * layer those actions/pages rely on — including the guarantee that the
 * student attempt DTO never carries correct answers.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import {
  attemptDeadline,
  attemptRemainingSeconds,
  canAttempt,
  evaluateAttempt,
  finalizeExpiredAttemptIfStale,
  getQuizForAdmin,
  getQuizAttemptForAdmin,
  getQuizForStudentAttempt,
  getQuizzesForStudent,
  getStudentAttemptReview,
  isAttemptExpired,
  isWithinSubmitWindow,
  parseAttemptAnswers,
  scoreQuizAnswers,
  serializeAttemptAnswers,
  type MarkableQuestion,
  type ScorableQuestion,
} from "@/lib/data/quizzes";

const userIds: string[] = [];
const courseIds: string[] = [];

let student1: string, student2: string;
let courseA: string, courseB: string;
let quizPublished: string, quizDraft: string, quizOtherCourse: string;
let q1: string, q2: string, q3: string;

const QUESTIONS: ScorableQuestion[] = [];

async function makeStudentUser() {
  const suffix = Math.random().toString(36).slice(2, 10);
  const user = await db.user.create({
    data: { username: `qz_${suffix}`, email: `qz_${suffix}@test.local`, passwordHash: "x", role: "STUDENT", status: "ACTIVE" },
  });
  userIds.push(user.id);
  const student = await db.student.create({
    data: { userId: user.id, studentId: `QZ-${suffix}`, fullName: `Quizzer ${suffix}` },
  });
  return { user, student };
}

before(async () => {
  const row = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  assert.match(row[0].current_database, /test/, "refusing to run tests against a non-test database");

  const s1 = await makeStudentUser();
  const s2 = await makeStudentUser();
  student1 = s1.student.id;
  student2 = s2.student.id;

  const cA = await db.course.create({ data: { title: "Quiz Course A", slug: `qz-a-${Date.now()}`, status: "PUBLISHED" } });
  const cB = await db.course.create({ data: { title: "Quiz Course B", slug: `qz-b-${Date.now()}`, status: "PUBLISHED" } });
  courseA = cA.id; courseB = cB.id;
  courseIds.push(courseA, courseB);

  const batchA = await db.batch.create({ data: { name: "QZ Batch A", code: `QZA-${Date.now()}`, courseId: courseA, status: "ONGOING" } });
  const batchB = await db.batch.create({ data: { name: "QZ Batch B", code: `QZB-${Date.now()}`, courseId: courseB, status: "ONGOING" } });
  // student1 is enrolled in course A only.
  await db.enrollment.create({ data: { studentId: student1, courseId: courseA, batchId: batchA.id, status: "ACTIVE" } });
  await db.enrollment.create({ data: { studentId: student2, courseId: courseB, batchId: batchB.id, status: "ACTIVE" } });

  const quiz = await db.quiz.create({
    data: { courseId: courseA, title: "Published Quiz", passingScore: 70, attemptsAllowed: 1, status: "PUBLISHED" },
  });
  quizPublished = quiz.id;
  const draft = await db.quiz.create({
    data: { courseId: courseA, title: "Draft Quiz", passingScore: 70, attemptsAllowed: 1, status: "DRAFT" },
  });
  quizDraft = draft.id;
  const other = await db.quiz.create({
    data: { courseId: courseB, title: "Other Course Quiz", passingScore: 70, attemptsAllowed: 1, status: "PUBLISHED" },
  });
  quizOtherCourse = other.id;

  const mk = async (question: string, type: "MULTIPLE_CHOICE" | "TRUE_FALSE", options: string[], correctAnswer: string, points: number, order: number) =>
    db.quizQuestion.create({
      data: { quizId: quizPublished, question, type, options: JSON.stringify(options), correctAnswer, points, order },
    });

  const a = await mk("Capital of France?", "MULTIPLE_CHOICE", ["Paris", "London", "Rome", "Berlin"], "Paris", 2, 0);
  const b = await mk("The sky is blue.", "TRUE_FALSE", ["True", "False"], "True", 3, 1);
  const c = await mk("Pick the colour of the sky.", "MULTIPLE_CHOICE", ["Green", "Blue", "Red", "Black"], "Blue", 5, 2);
  q1 = a.id; q2 = b.id; q3 = c.id;
  QUESTIONS.push(
    { id: q1, correctAnswer: "Paris", points: 2 },
    { id: q2, correctAnswer: "True", points: 3 },
    { id: q3, correctAnswer: "Blue", points: 5 }
  );
});

after(async () => {
  await db.course.deleteMany({ where: { id: { in: courseIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("scoring helpers", () => {
  it("scores by points, not by question count", () => {
    const all = scoreQuizAnswers(QUESTIONS, { [q1]: "Paris", [q2]: "True", [q3]: "Blue" }, 70);
    assert.equal(all.score, 10);
    assert.equal(all.totalPoints, 10);
    assert.equal(all.percentage, 100);
    assert.equal(all.passed, true);

    // Only the 5-point question correct -> 50%, not 33%.
    const heavy = scoreQuizAnswers(QUESTIONS, { [q3]: "Blue" }, 70);
    assert.equal(heavy.score, 5);
    assert.equal(heavy.percentage, 50);
    assert.equal(heavy.passed, false);

    // Wrong and missing answers score 0.
    const none = scoreQuizAnswers(QUESTIONS, { [q1]: "London" }, 70);
    assert.equal(none.score, 0);
    assert.equal(none.percentage, 0);
  });

  it("passes exactly on the passing-score boundary", () => {
    const answers = { [q1]: "Paris", [q2]: "True" }; // 5 of 10 = 50%
    assert.equal(scoreQuizAnswers(QUESTIONS, answers, 50).passed, true);
    assert.equal(scoreQuizAnswers(QUESTIONS, answers, 51).passed, false);
    assert.equal(scoreQuizAnswers(QUESTIONS, answers, 70).passed, false);
  });

  it("enforces attemptsAllowed via canAttempt", () => {
    assert.equal(canAttempt(0, 1), true);
    assert.equal(canAttempt(1, 1), false);
    assert.equal(canAttempt(1, 2), true);
    assert.equal(canAttempt(2, 2), false);
  });
});

describe("student visibility", () => {
  it("lists only published quizzes of ACTIVE-enrolled courses", async () => {
    const list = await getQuizzesForStudent(student1);
    const ids = list.map((q) => q.id);
    assert.ok(ids.includes(quizPublished), "published quiz of enrolled course is listed");
    assert.ok(!ids.includes(quizDraft), "draft quiz is not listed");
    assert.ok(!ids.includes(quizOtherCourse), "quiz of a non-enrolled course is not listed");
    const item = list.find((q) => q.id === quizPublished)!;
    assert.equal(item.myAttemptCount, 0);
    assert.equal(item.attemptsRemaining, 1);
    assert.equal(item.bestPercentage, null);
  });

  it("attempt DTO never contains correct answers", async () => {
    const dto = await getQuizForStudentAttempt(quizPublished, student1);
    assert.ok(dto);
    assert.equal(dto.questions.length, 3);
    for (const q of dto.questions) {
      assert.ok(!("correctAnswer" in q), "question DTO must not have a correctAnswer key");
    }
    assert.ok(!JSON.stringify(dto).includes('"correctAnswer"'));
    // Options ARE present (the student needs them to answer).
    assert.deepEqual(dto.questions[0].options, ["Paris", "London", "Rome", "Berlin"]);
  });

  it("draft quizzes and non-enrolled courses are not attemptable", async () => {
    assert.equal(await getQuizForStudentAttempt(quizDraft, student1), null);
    assert.equal(await getQuizForStudentAttempt(quizOtherCourse, student1), null);
    assert.equal(await getQuizForStudentAttempt(quizPublished, student2), null);
  });
});

describe("attempt recording + review", () => {
  it("reflects a stored attempt in the list and exposes the review only to its owner", async () => {
    const answers = { [q1]: "Paris", [q2]: "False", [q3]: "Blue" }; // 2 + 0 + 5 = 7 -> 70% -> pass on boundary
    const result = scoreQuizAnswers(QUESTIONS, answers, 70);
    assert.equal(result.percentage, 70);
    assert.equal(result.passed, true);

    const attempt = await db.quizAttempt.create({
      data: {
        quizId: quizPublished,
        studentId: student1,
        answers: JSON.stringify(answers),
        score: result.score,
        percentage: result.percentage,
        passed: result.passed,
        attemptNumber: 1,
        completedAt: new Date(),
      },
    });

    const list = await getQuizzesForStudent(student1);
    const item = list.find((q) => q.id === quizPublished)!;
    assert.equal(item.myAttemptCount, 1);
    assert.equal(item.attemptsRemaining, 0);
    assert.equal(item.bestPercentage, 70);
    assert.equal(item.latestPassed, true);
    assert.equal(canAttempt(item.myAttemptCount, item.attemptsAllowed), false);

    const review = await getStudentAttemptReview(quizPublished, student1, attempt.id);
    assert.ok(review);
    assert.equal(review.score, 7);
    assert.equal(review.questions.find((q) => q.id === q1)?.isCorrect, true);
    assert.equal(review.questions.find((q) => q.id === q2)?.isCorrect, false);
    assert.equal(review.questions.find((q) => q.id === q2)?.correctAnswer, "True");

    // Another student cannot read this attempt's review.
    assert.equal(await getStudentAttemptReview(quizPublished, student2, attempt.id), null);
    assert.equal(await getStudentAttemptReview(quizPublished, student2), null);
  });
});

// ---------------------------------------------------------------------------
// v2: SHORT_ANSWER questions + admin marking
// ---------------------------------------------------------------------------

const MIXED: MarkableQuestion[] = [
  { id: "mx-mcq", type: "MULTIPLE_CHOICE", correctAnswer: "Paris", points: 2 },
  { id: "mx-sa", type: "SHORT_ANSWER", correctAnswer: "MODEL-ANSWER-TEXT", points: 3 },
];

describe("attempt answers format (wrapped + legacy)", () => {
  it("parses the v2 wrapped shape", () => {
    const raw = serializeAttemptAnswers({ a: "one", b: "two" }, { b: 1.5 });
    const parsed = parseAttemptAnswers(raw);
    assert.deepEqual(parsed.answers, { a: "one", b: "two" });
    assert.deepEqual(parsed.awarded, { b: 1.5 });
  });

  it("parses the v1 flat shape (awarded empty)", () => {
    const parsed = parseAttemptAnswers(JSON.stringify({ a: "one", b: "two" }));
    assert.deepEqual(parsed.answers, { a: "one", b: "two" });
    assert.deepEqual(parsed.awarded, {});
  });

  it("degrades invalid values to empty maps", () => {
    // The parsed shape gained an `expired` flag with timed attempts (v3).
    assert.deepEqual(parseAttemptAnswers(null), { answers: {}, awarded: {}, expired: false });
    assert.deepEqual(parseAttemptAnswers("not json"), { answers: {}, awarded: {}, expired: false });
    assert.deepEqual(parseAttemptAnswers(JSON.stringify(["x"])), { answers: {}, awarded: {}, expired: false });
    // Non-string answers / non-number awarded entries are dropped.
    const parsed = parseAttemptAnswers(
      JSON.stringify({ answers: { a: 5, b: "ok" }, awarded: { a: "3", b: 2 } })
    );
    assert.deepEqual(parsed.answers, { b: "ok" });
    assert.deepEqual(parsed.awarded, { b: 2 });
  });
});

describe("evaluateAttempt (mixed auto + written)", () => {
  const answers = { "mx-mcq": "Paris", "mx-sa": "my written answer" };

  it("is pending while a written answer is unmarked; totals cover the auto part only", () => {
    const ev = evaluateAttempt(MIXED, answers, {}, 70);
    assert.equal(ev.pendingMarking, true);
    assert.equal(ev.autoScore, 2);
    assert.equal(ev.autoTotalPoints, 2);
    assert.equal(ev.score, 2);
    assert.equal(ev.totalPoints, 5);
    assert.equal(ev.percentage, 40);
  });

  it("recomputes across all questions once marked — pass/fail can flip either way", () => {
    const full = evaluateAttempt(MIXED, answers, { "mx-sa": 3 }, 70);
    assert.equal(full.pendingMarking, false);
    assert.equal(full.score, 5);
    assert.equal(full.percentage, 100);
    assert.equal(full.passed, true);

    const weak = evaluateAttempt(MIXED, answers, { "mx-sa": 1 }, 70);
    assert.equal(weak.pendingMarking, false);
    assert.equal(weak.score, 3);
    assert.equal(weak.percentage, 60);
    assert.equal(weak.passed, false);

    // Decimal awards allowed; landing exactly on the pass mark passes.
    const boundary = evaluateAttempt(MIXED, answers, { "mx-sa": 1.5 }, 70);
    assert.equal(boundary.percentage, 70);
    assert.equal(boundary.passed, true);
  });

  it("a quiz without written questions is never pending", () => {
    const ev = evaluateAttempt(
      [{ id: "a", type: "MULTIPLE_CHOICE", correctAnswer: "X", points: 4 }],
      { a: "X" },
      {},
      70
    );
    assert.equal(ev.pendingMarking, false);
    assert.equal(ev.score, 4);
  });
});

describe("mixed quiz (DB): pending → marked lifecycle", () => {
  const MODEL = "Because the Bastille fell in 1789.";
  let quizMixed: string;
  let mMcq: string, mSa: string;
  let attemptId: string;

  before(async () => {
    const quiz = await db.quiz.create({
      data: { courseId: courseA, title: "Mixed Quiz", passingScore: 70, attemptsAllowed: 3, status: "PUBLISHED" },
    });
    quizMixed = quiz.id;
    const mcq = await db.quizQuestion.create({
      data: {
        quizId: quizMixed, question: "Capital of France?", type: "MULTIPLE_CHOICE",
        options: JSON.stringify(["Paris", "London", "Rome", "Berlin"]), correctAnswer: "Paris", points: 2, order: 0,
      },
    });
    const sa = await db.quizQuestion.create({
      data: {
        quizId: quizMixed, question: "Why did the French Revolution start?", type: "SHORT_ANSWER",
        options: null, correctAnswer: MODEL, points: 3, order: 1,
      },
    });
    mMcq = mcq.id; mSa = sa.id;

    // Exactly what submitQuizAttempt stores: wrapped shape, auto part
    // scored (MCQ correct = 2), written answer unmarked.
    const attempt = await db.quizAttempt.create({
      data: {
        quizId: quizMixed,
        studentId: student1,
        answers: serializeAttemptAnswers({ [mMcq]: "Paris", [mSa]: "People were hungry and angry." }, {}),
        score: 2, percentage: 40, passed: false, attemptNumber: 1, completedAt: new Date(),
      },
    });
    attemptId = attempt.id;
  });

  it("attempt DTO contains neither correct answers nor the model answer", async () => {
    const dto = await getQuizForStudentAttempt(quizMixed, student1);
    assert.ok(dto);
    assert.equal(dto.questions.length, 2);
    for (const q of dto.questions) assert.ok(!("correctAnswer" in q));
    assert.ok(!JSON.stringify(dto).includes(MODEL), "model answer must not leak into the attempt DTO");
    const sa = dto.questions.find((q) => q.id === mSa)!;
    assert.deepEqual(sa.options, []);
  });

  it("student review shows the pending state, never the model answer", async () => {
    const review = await getStudentAttemptReview(quizMixed, student1, attemptId);
    assert.ok(review);
    assert.equal(review.pendingMarking, true);
    assert.equal(review.autoScore, 2);
    assert.equal(review.autoTotalPoints, 2);
    const sa = review.questions.find((q) => q.id === mSa)!;
    assert.equal(sa.yourAnswer, "People were hungry and angry.");
    assert.equal(sa.awardedPoints, null);
    assert.equal(sa.correctAnswer, null, "model answer is never shown to students");
    assert.ok(!JSON.stringify(review).includes(MODEL));

    const list = await getQuizzesForStudent(student1);
    const item = list.find((q) => q.id === quizMixed)!;
    assert.equal(item.latestPendingMarking, true);
    assert.equal(item.latestPassed, null);
    assert.equal(item.bestPercentage, null, "pending attempts do not count toward best %");

    const admin = await getQuizForAdmin(quizMixed);
    assert.equal(admin!.attempts.find((a) => a.id === attemptId)!.pendingMarking, true);
  });

  it("admin marking view exposes the model answer and student text", async () => {
    const detail = await getQuizAttemptForAdmin(quizMixed, attemptId);
    assert.ok(detail);
    assert.equal(detail.evaluation.pendingMarking, true);
    const sa = detail.questions.find((q) => q.id === mSa)!;
    assert.equal(sa.correctAnswer, MODEL);
    assert.equal(sa.yourAnswer, "People were hungry and angry.");
    assert.equal(sa.awardedPoints, null);
    const mcq = detail.questions.find((q) => q.id === mMcq)!;
    assert.equal(mcq.isCorrect, true);
    assert.equal(mcq.earnedPoints, 2);
  });

  it("after marking, the review is final with the awarded points", async () => {
    // Mirror markQuizAttempt's write: merge awarded, recompute, persist.
    const questions: MarkableQuestion[] = [
      { id: mMcq, type: "MULTIPLE_CHOICE", correctAnswer: "Paris", points: 2 },
      { id: mSa, type: "SHORT_ANSWER", correctAnswer: MODEL, points: 3 },
    ];
    const answers = { [mMcq]: "Paris", [mSa]: "People were hungry and angry." };
    const ev = evaluateAttempt(questions, answers, { [mSa]: 3 }, 70);
    assert.equal(ev.pendingMarking, false);
    await db.quizAttempt.update({
      where: { id: attemptId },
      data: {
        answers: serializeAttemptAnswers(answers, { [mSa]: 3 }),
        score: ev.score, percentage: ev.percentage, passed: ev.passed,
      },
    });

    const review = await getStudentAttemptReview(quizMixed, student1, attemptId);
    assert.ok(review);
    assert.equal(review.pendingMarking, false);
    assert.equal(review.score, 5);
    assert.equal(review.percentage, 100);
    assert.equal(review.passed, true);
    const sa = review.questions.find((q) => q.id === mSa)!;
    assert.equal(sa.awardedPoints, 3);
    assert.equal(sa.correctAnswer, null);

    const admin = await getQuizForAdmin(quizMixed);
    assert.equal(admin!.attempts.find((a) => a.id === attemptId)!.pendingMarking, false);
  });

  it("the expired marker round-trips and defaults to false", () => {
    const withMarker = parseAttemptAnswers(serializeAttemptAnswers({ a: "x" }, {}, { expired: true }));
    assert.equal(withMarker.expired, true);
    assert.deepEqual(withMarker.answers, { a: "x" });
    assert.equal(parseAttemptAnswers(serializeAttemptAnswers({ a: "x" }, {})).expired, false);
    assert.equal(parseAttemptAnswers(JSON.stringify({ a: "x" })).expired, false, "legacy flat shape has no marker");
    assert.equal(parseAttemptAnswers(null).expired, false);
  });

  it("legacy flat-shape attempts still render (and read as pending)", async () => {
    const legacy = await db.quizAttempt.create({
      data: {
        quizId: quizMixed,
        studentId: student1,
        answers: JSON.stringify({ [mMcq]: "London", [mSa]: "legacy written answer" }),
        score: 0, percentage: 0, passed: false, attemptNumber: 2, completedAt: new Date(),
      },
    });
    const review = await getStudentAttemptReview(quizMixed, student1, legacy.id);
    assert.ok(review);
    assert.equal(review.pendingMarking, true);
    assert.equal(review.questions.find((q) => q.id === mSa)!.yourAnswer, "legacy written answer");
    assert.equal(review.questions.find((q) => q.id === mMcq)!.isCorrect, false);
  });
});

// ---------------------------------------------------------------------------
// v3: timed attempts — deadline helpers + lazy expiry
// ---------------------------------------------------------------------------

describe("timer helpers", () => {
  const started = new Date("2026-01-01T10:00:00.000Z");

  it("deadline is startedAt + timeLimit minutes", () => {
    assert.equal(attemptDeadline(started, 20).toISOString(), "2026-01-01T10:20:00.000Z");
    assert.equal(attemptDeadline(started, 1).toISOString(), "2026-01-01T10:01:00.000Z");
  });

  it("remaining seconds counts down and clamps at zero", () => {
    assert.equal(attemptRemainingSeconds(started, 20, started), 1200);
    assert.equal(attemptRemainingSeconds(started, 20, new Date("2026-01-01T10:19:30.000Z")), 30);
    assert.equal(attemptRemainingSeconds(started, 20, new Date("2026-01-01T10:20:00.000Z")), 0);
    assert.equal(attemptRemainingSeconds(started, 20, new Date("2026-01-01T11:00:00.000Z")), 0);
  });

  it("the submit window includes the 60s grace, then closes", () => {
    const at = (iso: string) => new Date(iso);
    assert.equal(isWithinSubmitWindow(started, 20, at("2026-01-01T10:19:59.000Z")), true);
    assert.equal(isWithinSubmitWindow(started, 20, at("2026-01-01T10:20:59.000Z")), true, "inside grace");
    assert.equal(isWithinSubmitWindow(started, 20, at("2026-01-01T10:21:00.000Z")), true, "grace boundary is inclusive");
    assert.equal(isWithinSubmitWindow(started, 20, at("2026-01-01T10:21:01.000Z")), false, "past grace");
    assert.equal(isAttemptExpired(started, 20, at("2026-01-01T10:21:00.000Z")), false);
    assert.equal(isAttemptExpired(started, 20, at("2026-01-01T10:21:01.000Z")), true);
  });
});

describe("timed attempts (DB): start state + lazy expiry", () => {
  let timedQuiz: string;
  let timedQ: string;

  before(async () => {
    const quiz = await db.quiz.create({
      data: { courseId: courseA, title: "Timed Quiz", passingScore: 70, attemptsAllowed: 3, timeLimit: 1, status: "PUBLISHED" },
    });
    timedQuiz = quiz.id;
    const q = await db.quizQuestion.create({
      data: {
        quizId: timedQuiz, question: "Capital of France?", type: "MULTIPLE_CHOICE",
        options: JSON.stringify(["Paris", "London", "Rome", "Berlin"]), correctAnswer: "Paris", points: 2, order: 0,
      },
    });
    timedQ = q.id;
  });

  it("a fresh in-progress attempt is exposed with server remaining time and is not finalized", async () => {
    const attempt = await db.quizAttempt.create({
      data: { quizId: timedQuiz, studentId: student1, answers: null, attemptNumber: 1, completedAt: null },
    });
    assert.equal(await finalizeExpiredAttemptIfStale(timedQuiz, student1), false);

    const dto = await getQuizForStudentAttempt(timedQuiz, student1);
    assert.ok(dto);
    assert.ok(dto.inProgressAttempt, "running attempt is exposed");
    assert.equal(dto.inProgressAttempt!.attemptId, attempt.id);
    assert.ok(dto.inProgressAttempt!.remainingSeconds > 0 && dto.inProgressAttempt!.remainingSeconds <= 60);
    assert.equal(dto.myAttemptCount, 1, "a started attempt consumes an attempt");
    assert.equal(dto.attemptsRemaining, 2);

    await db.quizAttempt.delete({ where: { id: attempt.id } });
  });

  it("an attempt past deadline + grace finalizes as expired at the deadline, scoring 0", async () => {
    const startedAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago, limit is 1 minute
    const attempt = await db.quizAttempt.create({
      data: { quizId: timedQuiz, studentId: student1, answers: null, attemptNumber: 1, startedAt, completedAt: null },
    });

    assert.equal(await finalizeExpiredAttemptIfStale(timedQuiz, student1), true);

    const stored = await db.quizAttempt.findUnique({ where: { id: attempt.id } });
    assert.ok(stored);
    assert.equal(stored.completedAt?.getTime(), startedAt.getTime() + 60_000, "completedAt is the deadline itself");
    assert.equal(stored.score, 0);
    assert.equal(stored.percentage, 0);
    assert.equal(stored.passed, false);
    const parsed = parseAttemptAnswers(stored.answers);
    assert.equal(parsed.expired, true, "expired marker is stored");
    assert.deepEqual(parsed.answers, {});

    // Finalizing is idempotent, and the review surfaces the expiry.
    assert.equal(await finalizeExpiredAttemptIfStale(timedQuiz, student1), false);
    const review = await getStudentAttemptReview(timedQuiz, student1, attempt.id);
    assert.ok(review);
    assert.equal(review.expired, true);
    assert.equal(review.pendingMarking, false, "no written questions — expired attempt is final at 0");

    const admin = await getQuizForAdmin(timedQuiz);
    const row = admin!.attempts.find((a) => a.id === attempt.id)!;
    assert.equal(row.expired, true);
    assert.equal(row.inProgress, false);

    void timedQ;
  });
});
