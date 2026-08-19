import { db } from "@/lib/db";
import type { Role, SubmissionStatus } from "@prisma/client";

export interface CallerScope {
  role: Role;
  userId: string;
}

async function teacherOwnsCourse(userId: string, courseId: string): Promise<boolean> {
  const teacher = await db.teacher.findUnique({ where: { userId } });
  if (!teacher) return false;
  const batch = await db.batch.findFirst({
    where: { courseId, teacherId: teacher.id },
    select: { id: true },
  });
  return Boolean(batch);
}

/**
 * Every function below re-checks this itself — callers (pages/actions) may
 * already have guarded, but this file doesn't trust that.
 */
async function canAccessCourse(scope: CallerScope, courseId: string): Promise<boolean> {
  if (scope.role !== "TEACHER") return true;
  return teacherOwnsCourse(scope.userId, courseId);
}

function parseFiles(fileUrl: string | null): SubmissionFile[] {
  if (!fileUrl) return [];
  try {
    const arr = JSON.parse(fileUrl);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is string => typeof x === "string")
      .map((storageKey) => ({ storageKey, name: storageKey.split("/").pop() ?? storageKey }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Course/module pickers (for the create/edit assignment form)
// ---------------------------------------------------------------------------

export interface CourseOption {
  id: string;
  title: string;
  modules: { id: string; title: string }[];
}

export async function getCoursesForAdmin(): Promise<CourseOption[]> {
  return db.course.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: {
      id: true,
      title: true,
      modules: { select: { id: true, title: true }, orderBy: { order: "asc" } },
    },
    orderBy: { title: "asc" },
  });
}

export async function getCoursesForTeacher(
  teacherId: string,
  precomputedCourseIds?: string[]
): Promise<CourseOption[]> {
  const courseIds =
    precomputedCourseIds ??
    (
      await db.batch.findMany({ where: { teacherId }, select: { courseId: true }, distinct: ["courseId"] })
    ).map((b) => b.courseId);
  if (courseIds.length === 0) return [];
  return db.course.findMany({
    where: { id: { in: courseIds } },
    select: {
      id: true,
      title: true,
      modules: { select: { id: true, title: true }, orderBy: { order: "asc" } },
    },
    orderBy: { title: "asc" },
  });
}

// ---------------------------------------------------------------------------
// Teacher / admin: list + detail
// ---------------------------------------------------------------------------

export interface AssignmentListRow {
  id: string;
  title: string;
  courseTitle: string;
  dueDate: Date | null;
  maxScore: number;
  counts: { submitted: number; graded: number; late: number; pending: number; total: number };
}

async function withCounts(
  assignments: { id: string; title: string; course: { title: string }; dueDate: Date | null; maxScore: number }[]
): Promise<AssignmentListRow[]> {
  const ids = assignments.map((a) => a.id);
  const submissions = ids.length
    ? await db.assignmentSubmission.findMany({
        where: { assignmentId: { in: ids } },
        select: { assignmentId: true, status: true },
      })
    : [];
  const byAssignment = new Map<string, SubmissionStatus[]>();
  for (const s of submissions) {
    if (!byAssignment.has(s.assignmentId)) byAssignment.set(s.assignmentId, []);
    byAssignment.get(s.assignmentId)!.push(s.status);
  }
  return assignments.map((a) => {
    const statuses = byAssignment.get(a.id) ?? [];
    return {
      id: a.id,
      title: a.title,
      courseTitle: a.course.title,
      dueDate: a.dueDate,
      maxScore: a.maxScore,
      counts: {
        submitted: statuses.filter((s) => s === "SUBMITTED").length,
        graded: statuses.filter((s) => s === "GRADED").length,
        late: statuses.filter((s) => s === "LATE").length,
        pending: statuses.filter((s) => s === "PENDING").length,
        total: statuses.length,
      },
    };
  });
}

export async function getAllAssignmentsForAdmin(filters?: { courseId?: string }): Promise<AssignmentListRow[]> {
  const assignments = await db.assignment.findMany({
    where: filters?.courseId ? { courseId: filters.courseId } : undefined,
    include: { course: { select: { title: true } } },
    orderBy: { dueDate: "asc" },
  });
  return withCounts(assignments);
}

export async function getAssignmentsForTeacher(
  teacherId: string,
  filters?: { courseId?: string },
  precomputedCourseIds?: string[]
): Promise<AssignmentListRow[]> {
  const courseIds =
    precomputedCourseIds ??
    (
      await db.batch.findMany({ where: { teacherId }, select: { courseId: true }, distinct: ["courseId"] })
    ).map((b) => b.courseId);
  if (courseIds.length === 0) return [];

  // If a specific course was requested, only honor it when it's actually one
  // of this teacher's own courses — same rule assertTeacherOwnsCourse enforces.
  const scopedCourseIds =
    filters?.courseId && courseIds.includes(filters.courseId) ? [filters.courseId] : courseIds;

  const assignments = await db.assignment.findMany({
    where: { courseId: { in: scopedCourseIds } },
    include: { course: { select: { title: true } } },
    orderBy: { dueDate: "asc" },
  });
  return withCounts(assignments);
}

export interface SubmissionRow {
  id: string;
  studentId: string;
  studentIdCode: string;
  studentName: string;
  status: SubmissionStatus;
  score: number | null;
  submittedAt: Date | null;
}

export interface AssignmentDetail {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  courseId: string;
  courseTitle: string;
  moduleTitle: string | null;
  dueDate: Date | null;
  maxScore: number;
  submissions: SubmissionRow[];
}

/** For the teacher/admin assignment detail + roster page. */
export async function getAssignmentDetail(
  assignmentId: string,
  scope: CallerScope
): Promise<AssignmentDetail | null> {
  const assignment = await db.assignment.findUnique({
    where: { id: assignmentId },
    include: { course: { select: { title: true } }, module: { select: { title: true } } },
  });
  if (!assignment) return null;
  if (!(await canAccessCourse(scope, assignment.courseId))) return null;

  const submissions = await db.assignmentSubmission.findMany({
    where: { assignmentId },
    include: { student: { select: { id: true, studentId: true, fullName: true } } },
    orderBy: { student: { fullName: "asc" } },
  });

  return {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description,
    instructions: assignment.instructions,
    courseId: assignment.courseId,
    courseTitle: assignment.course.title,
    moduleTitle: assignment.module?.title ?? null,
    dueDate: assignment.dueDate,
    maxScore: assignment.maxScore,
    submissions: submissions.map((s) => ({
      id: s.id,
      studentId: s.student.id,
      studentIdCode: s.student.studentId,
      studentName: s.student.fullName,
      status: s.status,
      score: s.score,
      submittedAt: s.submittedAt,
    })),
  };
}

export interface SubmissionFile {
  storageKey: string;
  name: string;
}

export interface SubmissionDetail {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  maxScore: number;
  dueDate: Date | null;
  courseId: string;
  studentId: string;
  studentIdCode: string;
  studentName: string;
  submissionText: string | null;
  files: SubmissionFile[];
  status: SubmissionStatus;
  score: number | null;
  feedback: string | null;
  submittedAt: Date | null;
  gradedAt: Date | null;
}

/** For the teacher/admin grading page. */
export async function getSubmissionDetail(
  submissionId: string,
  scope: CallerScope
): Promise<SubmissionDetail | null> {
  const submission = await db.assignmentSubmission.findUnique({
    where: { id: submissionId },
    include: {
      assignment: true,
      student: { select: { id: true, studentId: true, fullName: true } },
    },
  });
  if (!submission) return null;
  if (!(await canAccessCourse(scope, submission.assignment.courseId))) return null;

  return {
    id: submission.id,
    assignmentId: submission.assignmentId,
    assignmentTitle: submission.assignment.title,
    maxScore: submission.assignment.maxScore,
    dueDate: submission.assignment.dueDate,
    courseId: submission.assignment.courseId,
    studentId: submission.student.id,
    studentIdCode: submission.student.studentId,
    studentName: submission.student.fullName,
    submissionText: submission.submissionText,
    files: parseFiles(submission.fileUrl),
    status: submission.status,
    score: submission.score,
    feedback: submission.feedback,
    submittedAt: submission.submittedAt,
    gradedAt: submission.gradedAt,
  };
}

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

export interface StudentAssignmentRow {
  id: string;
  title: string;
  courseTitle: string;
  dueDate: Date | null;
  maxScore: number;
  status: SubmissionStatus | "NOT_SUBMITTED";
  score: number | null;
}

/** Across all the student's ACTIVE enrollments. Overdue + ungraded first, then dueDate ascending. */
export async function getAssignmentsForStudent(studentId: string): Promise<StudentAssignmentRow[]> {
  const enrollments = await db.enrollment.findMany({
    where: { studentId, status: "ACTIVE" },
    select: { courseId: true },
  });
  const courseIds = [...new Set(enrollments.map((e) => e.courseId))];
  if (courseIds.length === 0) return [];

  const assignments = await db.assignment.findMany({
    where: { courseId: { in: courseIds } },
    include: {
      course: { select: { title: true } },
      submissions: { where: { studentId }, select: { status: true, score: true } },
    },
  });

  const rows: StudentAssignmentRow[] = assignments.map((a) => {
    const sub = a.submissions[0];
    return {
      id: a.id,
      title: a.title,
      courseTitle: a.course.title,
      dueDate: a.dueDate,
      maxScore: a.maxScore,
      status: sub?.status ?? "NOT_SUBMITTED",
      score: sub?.score ?? null,
    };
  });

  const now = Date.now();
  const overdueUngraded = (r: StudentAssignmentRow) =>
    r.status !== "GRADED" && r.dueDate !== null && r.dueDate.getTime() < now;

  rows.sort((a, b) => {
    const aFlag = overdueUngraded(a);
    const bFlag = overdueUngraded(b);
    if (aFlag !== bFlag) return aFlag ? -1 : 1;
    const aTime = a.dueDate?.getTime() ?? Infinity;
    const bTime = b.dueDate?.getTime() ?? Infinity;
    return aTime - bTime;
  });

  return rows;
}

export interface StudentAssignmentDetail {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  courseTitle: string;
  dueDate: Date | null;
  maxScore: number;
  isPastDue: boolean;
  submission: {
    id: string;
    submissionText: string | null;
    files: SubmissionFile[];
    status: SubmissionStatus;
    score: number | null;
    feedback: string | null;
    submittedAt: Date | null;
  } | null;
}

/** For the student's submit page. Returns null if not found OR not enrolled (never distinguish the two). */
export async function getStudentAssignmentDetail(
  assignmentId: string,
  studentId: string
): Promise<StudentAssignmentDetail | null> {
  const assignment = await db.assignment.findUnique({
    where: { id: assignmentId },
    include: { course: { select: { title: true } } },
  });
  if (!assignment) return null;

  const enrollment = await db.enrollment.findFirst({
    where: { studentId, courseId: assignment.courseId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!enrollment) return null;

  const submission = await db.assignmentSubmission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId } },
  });

  return {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description,
    instructions: assignment.instructions,
    courseTitle: assignment.course.title,
    dueDate: assignment.dueDate,
    maxScore: assignment.maxScore,
    isPastDue: assignment.dueDate !== null && assignment.dueDate.getTime() < Date.now(),
    submission: submission
      ? {
          id: submission.id,
          submissionText: submission.submissionText,
          files: parseFiles(submission.fileUrl),
          status: submission.status,
          score: submission.score,
          feedback: submission.feedback,
          submittedAt: submission.submittedAt,
        }
      : null,
  };
}
