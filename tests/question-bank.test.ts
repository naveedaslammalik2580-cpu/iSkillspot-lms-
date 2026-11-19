/**
 * Question bank tests — node:test via tsx.
 *
 * Run against a DISPOSABLE database only (refuses to run unless the
 * database name contains "test"). Covers the shared question validation
 * (the same rules quiz questions obey), the copy-to-quiz semantics
 * (copies are independent), and course scoping.
 *
 * Session-bound server actions are covered by browser E2E; the copy
 * operations live in the data layer precisely so they are testable here.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { validateQuestionFields } from "@/lib/quiz-questions";
import {
  copyBankItemToQuiz,
  copyQuizQuestionToBank,
  getBankItemsForCourse,
} from "@/lib/data/question-bank";

const courseIds: string[] = [];
let courseA: string, courseB: string;
let moduleA: string;
let quizA: string;
let bankMcq: string, bankOtherCourse: string;

before(async () => {
  const row = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  assert.match(row[0].current_database, /test/, "refusing to run tests against a non-test database");

  const cA = await db.course.create({ data: { title: "Bank Course A", slug: `bank-a-${Date.now()}`, status: "PUBLISHED" } });
  const cB = await db.course.create({ data: { title: "Bank Course B", slug: `bank-b-${Date.now()}`, status: "PUBLISHED" } });
  courseA = cA.id; courseB = cB.id;
  courseIds.push(courseA, courseB);

  const mod = await db.module.create({ data: { courseId: courseA, title: "Bank Module A", order: 0 } });
  moduleA = mod.id;

  const quiz = await db.quiz.create({
    data: { courseId: courseA, title: "Bank Target Quiz", passingScore: 70, attemptsAllowed: 1, status: "DRAFT" },
  });
  quizA = quiz.id;

  const mcq = await db.questionBankItem.create({
    data: {
      courseId: courseA, moduleId: moduleA, type: "MULTIPLE_CHOICE",
      question: "Capital of France?",
      options: JSON.stringify(["Paris", "London", "Rome", "Berlin"]),
      correctAnswer: "Paris", points: 2,
    },
  });
  bankMcq = mcq.id;

  const other = await db.questionBankItem.create({
    data: {
      courseId: courseB, type: "TRUE_FALSE", question: "The sky is green.",
      options: JSON.stringify(["True", "False"]), correctAnswer: "False", points: 1,
    },
  });
  bankOtherCourse = other.id;
});

after(async () => {
  await db.course.deleteMany({ where: { id: { in: courseIds } } });
  await db.$disconnect();
});

describe("shared question validation", () => {
  const base = { question: "Q?", points: 2 };

  it("accepts a valid MCQ and trims its options", () => {
    const v = validateQuestionFields({
      ...base, type: "MULTIPLE_CHOICE",
      options: [" Paris ", "London", "Rome", "Berlin"], correctAnswer: "Paris",
    });
    assert.ok(!("error" in v));
    if (!("error" in v)) {
      assert.deepEqual(v.options, ["Paris", "London", "Rome", "Berlin"]);
      assert.equal(v.correctAnswer, "Paris");
    }
  });

  it("rejects an MCQ without exactly 4 non-empty distinct options", () => {
    const three = validateQuestionFields({
      ...base, type: "MULTIPLE_CHOICE", options: ["A", "B", "C"], correctAnswer: "A",
    });
    assert.ok("error" in three);
    const dup = validateQuestionFields({
      ...base, type: "MULTIPLE_CHOICE", options: ["A", "A", "B", "C"], correctAnswer: "A",
    });
    assert.ok("error" in dup);
    const blank = validateQuestionFields({
      ...base, type: "MULTIPLE_CHOICE", options: ["A", " ", "B", "C"], correctAnswer: "A",
    });
    assert.ok("error" in blank);
  });

  it("rejects an MCQ whose correct answer is not one of the options", () => {
    const v = validateQuestionFields({
      ...base, type: "MULTIPLE_CHOICE",
      options: ["A", "B", "C", "D"], correctAnswer: "Madrid",
    });
    assert.ok("error" in v);
  });

  it("validates TRUE_FALSE answers strictly", () => {
    const ok = validateQuestionFields({ ...base, type: "TRUE_FALSE", correctAnswer: "False" });
    assert.ok(!("error" in ok));
    if (!("error" in ok)) assert.deepEqual(ok.options, ["True", "False"]);
    const bad = validateQuestionFields({ ...base, type: "TRUE_FALSE", correctAnswer: "Yes" });
    assert.ok("error" in bad);
  });

  it("SHORT_ANSWER needs no options; the model answer is optional", () => {
    const none = validateQuestionFields({ ...base, type: "SHORT_ANSWER" });
    assert.ok(!("error" in none));
    if (!("error" in none)) {
      assert.equal(none.options, null);
      assert.equal(none.correctAnswer, null);
    }
    const withModel = validateQuestionFields({
      ...base, type: "SHORT_ANSWER", correctAnswer: "  Because of the Bastille. ",
    });
    assert.ok(!("error" in withModel));
    if (!("error" in withModel)) assert.equal(withModel.correctAnswer, "Because of the Bastille.");
  });
});

describe("copy semantics", () => {
  it("copying into a quiz creates an independent QuizQuestion", async () => {
    const res = await copyBankItemToQuiz(quizA, bankMcq);
    assert.ok(res.ok);
    if (!res.ok) return;

    const copy = await db.quizQuestion.findUnique({ where: { id: res.id } });
    assert.ok(copy);
    assert.equal(copy.quizId, quizA);
    assert.equal(copy.question, "Capital of France?");
    assert.equal(copy.correctAnswer, "Paris");
    assert.equal(copy.points, 2);
    assert.equal(copy.order, 0);

    // Mutating the bank item afterwards must not change the copy.
    await db.questionBankItem.update({
      where: { id: bankMcq },
      data: { question: "Capital of Spain?", correctAnswer: "Madrid", points: 9 },
    });
    const afterEdit = await db.quizQuestion.findUnique({ where: { id: res.id } });
    assert.equal(afterEdit!.question, "Capital of France?");
    assert.equal(afterEdit!.correctAnswer, "Paris");
    assert.equal(afterEdit!.points, 2);

    // Deleting the bank item must not change the copy either.
    await db.questionBankItem.delete({ where: { id: bankMcq } });
    const afterDelete = await db.quizQuestion.findUnique({ where: { id: res.id } });
    assert.ok(afterDelete, "quiz copy survives bank deletion");
    assert.equal(afterDelete.question, "Capital of France?");
  });

  it("rejects copying a bank item from another course", async () => {
    const before = await db.quizQuestion.count({ where: { quizId: quizA } });
    const res = await copyBankItemToQuiz(quizA, bankOtherCourse);
    assert.equal(res.ok, false);
    if (!res.ok) assert.match(res.error, /different course/);
    const after = await db.quizQuestion.count({ where: { quizId: quizA } });
    assert.equal(after, before, "no question was created");
  });

  it("saving a quiz question to the bank scopes it to the quiz's course + module", async () => {
    const quizWithModule = await db.quiz.create({
      data: { courseId: courseA, moduleId: moduleA, title: "Module Quiz", passingScore: 70, attemptsAllowed: 1, status: "DRAFT" },
    });
    const question = await db.quizQuestion.create({
      data: {
        quizId: quizWithModule.id, question: "Explain gravity.", type: "SHORT_ANSWER",
        options: null, correctAnswer: "Mass attracts mass.", points: 4, order: 0,
      },
    });
    const res = await copyQuizQuestionToBank(question.id);
    assert.ok(res.ok);
    if (!res.ok) return;
    const item = await db.questionBankItem.findUnique({ where: { id: res.id } });
    assert.ok(item);
    assert.equal(item.courseId, courseA);
    assert.equal(item.moduleId, moduleA);
    assert.equal(item.type, "SHORT_ANSWER");
    assert.equal(item.correctAnswer, "Mass attracts mass.");
  });

  it("the bank panel data is scoped to the quiz's course", async () => {
    const items = await getBankItemsForCourse(courseA);
    assert.ok(items.length >= 1, "course A items are listed");
    assert.ok(items.every((i) => i.courseId === courseA));
    assert.ok(!items.some((i) => i.id === bankOtherCourse), "course B items are not offered");
  });
});
