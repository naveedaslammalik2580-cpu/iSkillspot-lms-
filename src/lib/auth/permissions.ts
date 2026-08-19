import type { Role } from "@prisma/client";

/**
 * Central permission matrix. Every capability is declared once here and
 * enforced on the server. Frontend visibility is derived from the same map,
 * but is NEVER the source of truth — server guards re-check on every action.
 */
export type Permission =
  // Admin management
  | "admin.manage"
  | "settings.manage"
  | "audit.view"
  // People
  | "student.create"
  | "student.edit"
  | "student.delete"
  | "student.viewAll"
  | "teacher.manage"
  // Learning
  | "course.manage"
  | "batch.manage"
  | "lesson.manage"
  | "enrollment.manage"
  // Academics
  | "attendance.manage"
  | "assignment.manage"
  | "assignment.grade"
  | "quiz.manage"
  | "quiz.grade"
  | "grade.manage"
  // Finance
  | "fee.manage"
  | "payment.manage"
  // Output
  | "certificate.manage"
  | "report.view"
  | "announcement.sendAll"
  | "announcement.sendBatch"
  // Student self-service
  | "self.viewOwn"
  | "self.submitAssignment"
  | "self.takeQuiz"
  | "self.changePassword";

const SUPER_ADMIN: Permission[] = [
  "admin.manage",
  "settings.manage",
  "audit.view",
  "student.create",
  "student.edit",
  "student.delete",
  "student.viewAll",
  "teacher.manage",
  "course.manage",
  "batch.manage",
  "lesson.manage",
  "enrollment.manage",
  "attendance.manage",
  "assignment.manage",
  "assignment.grade",
  "quiz.manage",
  "quiz.grade",
  "grade.manage",
  "fee.manage",
  "payment.manage",
  "certificate.manage",
  "report.view",
  "announcement.sendAll",
  "announcement.sendBatch",
];

const ADMIN: Permission[] = [
  "student.create",
  "student.edit",
  "student.delete",
  "student.viewAll",
  "teacher.manage",
  "course.manage",
  "batch.manage",
  "lesson.manage",
  "enrollment.manage",
  "attendance.manage",
  "assignment.manage",
  "assignment.grade",
  "quiz.manage",
  "quiz.grade",
  "grade.manage",
  "fee.manage",
  "payment.manage",
  "certificate.manage",
  "report.view",
  "announcement.sendAll",
  "announcement.sendBatch",
  // NOTE: no settings.manage / admin.manage / audit.view — reserved for SUPER_ADMIN
];

const TEACHER: Permission[] = [
  "lesson.manage",
  "assignment.manage",
  "assignment.grade",
  "quiz.manage",
  "quiz.grade",
  "attendance.manage",
  "grade.manage",
  "announcement.sendBatch",
  // Teacher-scoped: limited to assigned batches/students, enforced at data layer.
];

const STUDENT: Permission[] = [
  "self.viewOwn",
  "self.submitAssignment",
  "self.takeQuiz",
  "self.changePassword",
];

export const PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN,
  ADMIN,
  TEACHER,
  STUDENT,
};

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role]?.includes(permission) ?? false;
}

export function isStaff(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

export function homePathFor(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN":
    case "ADMIN":
      return "/admin/dashboard";
    case "TEACHER":
      return "/teacher/dashboard";
    case "STUDENT":
      return "/student/dashboard";
    default:
      return "/login";
  }
}
