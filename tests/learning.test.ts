/**
 * Learning (courses/lessons/progress) integration tests — node:test via tsx.
 *
 * Run against a DISPOSABLE database only (refuses to run unless the
 * database name contains "test"). All fixtures are created here and
 * deleted afterwards via cascade (deleting the fixture users/courses
 * removes students/teachers/enrollments/progress/notifications).
 *
 * Session-bound server actions (setLessonCompleted, course-content CRUD,
 * resource access) are covered by browser E2E; this suite covers the
 * data layer those actions/pages rely on, the pure helpers, and the
 * schema-level guarantees (progress @@unique) the actions build on.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import {
  classifyResourceUrl,
  computeProgress,
  getCourseContent,
  getStudentCourse,
  getStudentCourses,
  getStudentLesson,
  getTeacherCourse,
  getTeacherCourses,
  getTeacherStudents,
} from "@/lib/data/learning";
import { parseVideoUrl } from "@/components/learning/video-embed";
import { notifyUsers } from "@/lib/notifications";

const userIds: string[] = [];
const courseIds: string[] = [];

let courseA: string, courseB: string;
let modA1: string, modA2: string;
let lessonA1: string, lessonA2: string, lessonA3: string, lessonDraft: string;
let student1: string, student2: string; // Student record ids
let student1User: string;
let teacher1: string; // Teacher record id

async function makeStudentUser() {
  const suffix = Math.random().toString(36).slice(2, 10);
  const user = await db.user.create({
    data: { username: `lt_${suffix}`, email: `lt_${suffix}@test.local`, passwordHash: "x", role: "STUDENT", status: "ACTIVE" },
  });
  userIds.push(user.id);
  const student = await db.student.create({
    data: { userId: user.id, studentId: `LT-${suffix}`, fullName: `Learner ${suffix}` },
  });
  return { user, student };
}

before(async () => {
  const row = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  assert.match(row[0].current_database, /test/, "refusing to run tests against a non-test database");

  const s1 = await makeStudentUser();
  const s2 = await makeStudentUser();
  student1 = s1.student.id;
  student1User = s1.user.id;
  student2 = s2.student.id;

  const tUser = await db.user.create({
    data: { username: `lt_t_${Math.random().toString(36).slice(2, 8)}`, email: "lt_t@test.local", passwordHash: "x", role: "TEACHER", status: "ACTIVE" },
  });
  userIds.push(tUser.id);
  const teacher = await db.teacher.create({ data: { userId: tUser.id, fullName: "Teacher One" } });
  teacher1 = teacher.id;

  const cA = await db.course.create({ data: { title: "Course A", slug: `course-a-${Date.now()}`, status: "PUBLISHED" } });
  const cB = await db.course.create({ data: { title: "Course B", slug: `course-b-${Date.now()}`, status: "PUBLISHED" } });
  courseA = cA.id; courseB = cB.id;
  courseIds.push(courseA, courseB);

  const m1 = await db.module.create({ data: { courseId: courseA, title: "A Module 1", order: 1 } });
  const m2 = await db.module.create({ data: { courseId: courseA, title: "A Module 2", order: 2 } });
  modA1 = m1.id; modA2 = m2.id;
  const l1 = await db.lesson.create({ data: { moduleId: modA1, title: "A1", order: 1, isPublished: true, content: "Hello" } });
  const l2 = await db.lesson.create({ data: { moduleId: modA1, title: "A2", order: 2, isPublished: true } });
  const l3 = await db.lesson.create({ data: { moduleId: modA2, title: "A3", order: 1, isPublished: true } });
  const ld = await db.lesson.create({ data: { moduleId: modA2, title: "A Draft", order: 2, isPublished: false } });
  lessonA1 = l1.id; lessonA2 = l2.id; lessonA3 = l3.id; lessonDraft = ld.id;
  await db.lessonResource.create({ data: { lessonId: lessonA1, title: "Slides", fileUrl: "https://example.com/slides.pdf", fileType: "PDF" } });

  const batchA = await db.batch.create({ data: { name: "Batch A", code: `BA-${Date.now()}`, courseId: courseA, teacherId: teacher1, status: "ONGOING" } });
  const batchB = await db.batch.create({ data: { name: "Batch B", code: `BB-${Date.now()}`, courseId: courseB, status: "ONGOING" } });
  await db.enrollment.create({ data: { studentId: student1, courseId: courseA, batchId: batchA.id, status: "ACTIVE" } });
  await db.enrollment.create({ data: { studentId: student2, courseId: courseB, batchId: batchB.id, status: "ACTIVE" } });
});

after(async () => {
  await db.course.deleteMany({ where: { id: { in: courseIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("pure helpers", () => {
  it("computeProgress handles empty, partial and over-complete inputs", () => {
    assert.deepEqual(computeProgress(0, 0), { totalLessons: 0, completedLessons: 0, percent: 0 });
    assert.equal(computeProgress(4, 1).percent, 25);
    assert.equal(computeProgress(3, 3).percent, 100);
    assert.equal(computeProgress(2, 5).completedLessons, 2); // clamped
    assert.equal(computeProgress(3, 2).percent, 67);
  });

  it("classifyResourceUrl separates external URLs, storage keys and junk", () => {
    assert.equal(classifyResourceUrl("https://example.com/a.pdf"), "external");
    assert.equal(classifyResourceUrl("http://example.com/a.pdf"), "external");
    assert.equal(classifyResourceUrl("submissions/abc/file.pdf"), "storage-key");
    assert.equal(classifyResourceUrl("javascript:alert(1)"), "invalid");
    assert.equal(classifyResourceUrl("//evil.example/x"), "invalid");
    assert.equal(classifyResourceUrl("ftp://example.com/x"), "invalid");
    assert.equal(classifyResourceUrl(""), "invalid");
    assert.equal(classifyResourceUrl(null), "invalid");
    assert.equal(classifyResourceUrl("https://exa mple.com"), "invalid");
  });

  it("parseVideoUrl only embeds trusted providers or direct files", () => {
    assert.equal(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.kind, "youtube");
    assert.equal(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")?.kind, "youtube");
    assert.equal(parseVideoUrl("https://vimeo.com/123456789")?.kind, "vimeo");
    assert.equal(parseVideoUrl("https://cdn.example.com/lesson.mp4")?.kind, "file");
    assert.equal(parseVideoUrl("https://example.com/some-page")?.kind, "link");
    assert.equal(parseVideoUrl("javascript:alert(1)"), null);
    assert.equal(parseVideoUrl("not a url"), null);
    assert.equal(parseVideoUrl(null), null);
  });
});

describe("student scoping", () => {
  it("lists only the student's own enrolled courses", async () => {
    const mine = await getStudentCourses(student1);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].courseId, courseA);
    assert.equal(mine[0].progress.totalLessons, 3); // published only, draft excluded
    assert.equal(mine[0].progress.completedLessons, 0);
  });

  it("course detail is null for a course the student is not enrolled in", async () => {
    assert.equal(await getStudentCourse(student1, courseB), null);
    const detail = await getStudentCourse(student1, courseA);
    assert.ok(detail);
    assert.equal(detail.modules.length, 2);
    const titles = detail.modules.flatMap((m) => m.lessons.map((l) => l.title));
    assert.deepEqual(titles, ["A1", "A2", "A3"]); // draft hidden, order respected
  });

  it("lesson view hides drafts and other courses' lessons, and orders prev/next across modules", async () => {
    assert.equal(await getStudentLesson(student1, lessonDraft), null);
    const second = await getStudentLesson(student2, lessonA1);
    assert.equal(second, null); // student2 is enrolled in course B, not A
    const view = await getStudentLesson(student1, lessonA2);
    assert.ok(view);
    assert.equal(view.prev?.id, lessonA1);
    assert.equal(view.next?.id, lessonA3);
    assert.equal(view.position, 2);
    assert.equal(view.totalLessons, 3);
    assert.equal(view.resources.length, 0); // resources live on A1
    const first = await getStudentLesson(student1, lessonA1);
    assert.equal(first?.resources.length, 1);
    assert.equal(first?.prev, null);
  });
});

describe("progress storage guarantees", () => {
  it("upsert by (studentId, lessonId) never duplicates, and percentages follow", async () => {
    const key = { studentId_lessonId: { studentId: student1, lessonId: lessonA1 } };
    await db.lessonProgress.upsert({ where: key, create: { studentId: student1, lessonId: lessonA1, completed: true, completedAt: new Date() }, update: { completed: true, completedAt: new Date() } });
    await db.lessonProgress.upsert({ where: key, create: { studentId: student1, lessonId: lessonA1, completed: true, completedAt: new Date() }, update: { completed: true, completedAt: new Date() } });
    const rows = await db.lessonProgress.findMany({ where: { studentId: student1, lessonId: lessonA1 } });
    assert.equal(rows.length, 1);

    const detail = await getStudentCourse(student1, courseA);
    assert.equal(detail?.progress.completedLessons, 1);
    assert.equal(detail?.progress.percent, 33);

    // marking incomplete flips the same row
    await db.lessonProgress.update({ where: key, data: { completed: false, completedAt: null } });
    const after2 = await getStudentCourse(student1, courseA);
    assert.equal(after2?.progress.completedLessons, 0);

    // another student's progress never leaks into this student's numbers
    await db.lessonProgress.create({ data: { studentId: student2, lessonId: lessonA1, completed: true } });
    const after3 = await getStudentCourse(student1, courseA);
    assert.equal(after3?.progress.completedLessons, 0);
    await db.lessonProgress.deleteMany({ where: { studentId: student2, lessonId: lessonA1 } });
  });
});

describe("teacher scoping", () => {
  it("teacher courses include only assigned courses with counts", async () => {
    const courses = await getTeacherCourses(teacher1);
    assert.equal(courses.length, 1);
    assert.equal(courses[0].courseId, courseA);
    assert.equal(courses[0].studentCount, 1);
    assert.equal(courses[0].lessonCount, 4); // incl. draft — teacher inspection view
    assert.equal(await getTeacherCourse(teacher1, courseB), null);
  });

  it("teacher students are limited to own batches; forged filters yield nothing", async () => {
    const all = await getTeacherStudents(teacher1);
    assert.equal(all.rows.length, 1);
    assert.equal(all.rows[0].studentId, student1);
    // fields are privacy-minimal: no phone/email/dob keys exist on the DTO
    assert.deepEqual(Object.keys(all.rows[0]).sort(), ["batchCode", "batchId", "batchName", "courseId", "courseTitle", "fullName", "studentCode", "studentId"]);
    const forged = await getTeacherStudents(teacher1, { batchId: "not-theirs" });
    assert.equal(forged.rows.length, 0);
    const searched = await getTeacherStudents(teacher1, { q: "no-such-person" });
    assert.equal(searched.rows.length, 0);
  });
});

describe("content management view + publish notification contract", () => {
  it("getCourseContent exposes delete-blocking counts", async () => {
    const content = await getCourseContent(courseA);
    assert.ok(content);
    const m1 = content.modules.find((m) => m.id === modA1);
    assert.equal(m1?.lessonCount, 2);
    const l1 = m1?.lessons.find((l) => l.id === lessonA1);
    assert.equal(l1?.resources.length, 1);
  });

  it("lesson-published notification dedupes by lesson and reaches enrolled students only", async () => {
    const input = {
      type: "LESSON" as const,
      title: "New lesson in Course A",
      message: "\"A1\" is now available in your course.",
      linkUrl: `/student/courses/${courseA}/lessons/${lessonA1}`,
      dedupeKey: `lesson-published:${lessonA1}`,
    };
    await notifyUsers([student1User], input);
    await notifyUsers([student1User], input); // repeat call must not duplicate
    const rows = await db.notification.findMany({ where: { dedupeKey: `lesson-published:${lessonA1}` } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].userId, student1User);
    assert.equal(rows[0].type, "LESSON");
  });
});
