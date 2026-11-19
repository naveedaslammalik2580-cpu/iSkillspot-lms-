/**
 * Assignment data-layer regression tests — node:test via tsx.
 *
 * Pins the behaviour established when the vestigial `scope: CallerScope`
 * parameters were removed from getAssignmentDetail / getSubmissionDetail
 * (Mission 2, §2C): authorization for these admin reads lives at the page
 * layer (requirePermission("assignment.manage") / ("assignment.grade") on
 * the three admin pages, behind the staff-only /admin layout), and the
 * getters themselves are plain by-id lookups — full detail for an existing
 * record, null for an unknown id. If a future change re-introduces caller
 * scoping (or breaks the by-id contract), these tests fail.
 *
 * Disposable database only (refuses non-"test" database names). All
 * fixtures are created here and removed via cascade afterwards.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import {
  getAssignmentDetail,
  getSubmissionDetail,
} from "@/lib/data/assignments";

const userIds: string[] = [];
const courseIds: string[] = [];
let assignmentId: string;
let submissionId: string;
let studentRowId: string;

before(async () => {
  const row = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  assert.match(row[0].current_database, /test/, "refusing to run tests against a non-test database");

  const suffix = Math.random().toString(36).slice(2, 10);
  const user = await db.user.create({
    data: {
      username: `ad_${suffix}`,
      email: `ad_${suffix}@test.local`,
      passwordHash: "x",
      role: "STUDENT",
      status: "ACTIVE",
    },
  });
  userIds.push(user.id);

  const student = await db.student.create({
    data: { userId: user.id, studentId: `AD-${suffix}`, fullName: "Assignment Data Student" },
  });
  studentRowId = student.id;

  const course = await db.course.create({
    data: { title: "Assignment Data Course", slug: `ad-${suffix}`, status: "PUBLISHED" },
  });
  courseIds.push(course.id);

  const assignment = await db.assignment.create({
    data: {
      courseId: course.id,
      title: "Assignment Data Task",
      description: "Detail lookup fixture",
      maxScore: 50,
    },
  });
  assignmentId = assignment.id;

  const submission = await db.assignmentSubmission.create({
    data: {
      assignmentId: assignment.id,
      studentId: student.id,
      submissionText: "Fixture answer",
      submittedAt: new Date(),
      status: "SUBMITTED",
    },
  });
  submissionId = submission.id;
});

after(async () => {
  await db.course.deleteMany({ where: { id: { in: courseIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("getAssignmentDetail (post-scope-removal contract)", () => {
  it("returns the full detail with the submission roster for an existing assignment", async () => {
    const detail = await getAssignmentDetail(assignmentId);
    assert.ok(detail);
    assert.equal(detail.id, assignmentId);
    assert.equal(detail.title, "Assignment Data Task");
    assert.equal(detail.courseTitle, "Assignment Data Course");
    assert.equal(detail.maxScore, 50);
    assert.equal(detail.submissions.length, 1);
    assert.equal(detail.submissions[0].id, submissionId);
    assert.equal(detail.submissions[0].studentId, studentRowId);
    assert.equal(detail.submissions[0].studentName, "Assignment Data Student");
  });

  it("returns null for an unknown assignment id", async () => {
    assert.equal(await getAssignmentDetail("no-such-assignment-id"), null);
  });
});

describe("getSubmissionDetail (post-scope-removal contract)", () => {
  it("returns the full grading detail for an existing submission", async () => {
    const detail = await getSubmissionDetail(submissionId);
    assert.ok(detail);
    assert.equal(detail.id, submissionId);
    assert.equal(detail.assignmentId, assignmentId);
    assert.equal(detail.assignmentTitle, "Assignment Data Task");
    assert.equal(detail.studentId, studentRowId);
    assert.equal(detail.studentName, "Assignment Data Student");
    assert.equal(detail.submissionText, "Fixture answer");
    assert.equal(detail.status, "SUBMITTED");
    assert.equal(detail.maxScore, 50);
  });

  it("returns null for an unknown submission id", async () => {
    assert.equal(await getSubmissionDetail("no-such-submission-id"), null);
  });
});
