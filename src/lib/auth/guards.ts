import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { getSession, type SessionPayload } from "./session";
import { can, isStaff, type Permission } from "./permissions";
import { db } from "@/lib/db";

/**
 * Server-only authorization guards. These are the single source of truth for
 * access control. UI hiding is cosmetic; every server action and page loader
 * calls one of these before touching data.
 */

export class AuthError extends Error {
  constructor(
    message: string,
    public code: "UNAUTHENTICATED" | "FORBIDDEN" = "FORBIDDEN"
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Require any authenticated session. Redirects to /login if absent. */
export async function requireSession(options: { allowPasswordChange?: boolean; allowAdmission?: boolean } = {}): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "STUDENT" && session.admissionRequired && !options.allowAdmission) redirect("/admission");
  if (session.mustChangePassword && !options.allowPasswordChange) {
    redirect(session.role === "STUDENT" ? "/student/change-password" : "/change-password");
  }
  return session;
}

/** Require one of the given roles. */
export async function requireRole(
  ...roles: Role[]
): Promise<SessionPayload> {
  const session = await requireSession();
  if (!roles.includes(session.role)) {
    redirect("/forbidden");
  }
  return session;
}

/** Require staff (admin or super admin). */
export async function requireStaff(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!isStaff(session.role)) redirect("/forbidden");
  return session;
}

/** Require a specific capability. Redirects to /forbidden if absent. */
export async function requirePermission(
  permission: Permission
): Promise<SessionPayload> {
  const session = await requireSession();
  if (!can(session.role, permission)) {
    redirect("/forbidden");
  }
  return session;
}

/**
 * Resolve the Student row that belongs to the current session, or null.
 * Students may only ever read their OWN student record.
 */
export async function requireStudentSelf(options: { allowPasswordChange?: boolean } = {}) {
  const session = await requireSession(options);
  if (session.role !== "STUDENT") redirect("/forbidden");
  const student = await db.student.findUnique({
    where: { userId: session.userId },
  });
  if (!student) redirect("/forbidden");
  return { session, student };
}

/** Resolve the Teacher row for the current session. */
export async function requireTeacherSelf() {
  const session = await requireRole("TEACHER");
  const teacher = await db.teacher.findUnique({
    where: { userId: session.userId },
  });
  if (!teacher) redirect("/forbidden");
  return { session, teacher };
}

/**
 * Verify a teacher is assigned to a given batch. Enforces the rule that a
 * teacher cannot touch unrelated batches/students.
 */
export async function assertTeacherOwnsBatch(
  teacherId: string,
  batchId: string
): Promise<void> {
  const batch = await db.batch.findFirst({
    where: { id: batchId, teacherId },
    select: { id: true },
  });
  if (!batch) throw new AuthError("Batch not assigned to this teacher.");
}

/**
 * Verify a teacher is allowed to act on a given student (student is in one of
 * the teacher's batches).
 */
export async function assertTeacherOwnsStudent(
  teacherId: string,
  studentId: string
): Promise<void> {
  const enrollment = await db.enrollment.findFirst({
    where: {
      studentId,
      batch: { teacherId },
    },
    select: { id: true },
  });
  if (!enrollment) throw new AuthError("Student not in this teacher's batches.");
}

/**
 * Verify a teacher teaches at least one batch of a given course. Assignments
 * are course-wide (no batchId on Assignment), so this is the course-level
 * equivalent of assertTeacherOwnsBatch.
 */
export async function assertTeacherOwnsCourse(
  teacherId: string,
  courseId: string
): Promise<void> {
  const batch = await db.batch.findFirst({
    where: { courseId, teacherId },
    select: { id: true },
  });
  if (!batch) throw new AuthError("Course not assigned to this teacher.");
}
