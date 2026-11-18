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
  canAttempt,
  getQuizForStudentAttempt,
  getQuizzesForStudent,
  getStudentAttemptReview,
  scoreQuizAnswers,
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
