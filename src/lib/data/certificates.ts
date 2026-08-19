import { db } from "@/lib/db";
import type { CertificateStatus, Role } from "@prisma/client";

export interface CallerScope {
  role: Role;
  userId: string;
}

export interface CertificateListRow {
  id: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  courseId: string;
  courseName: string;
  certificateNumber: string;
  issueDate: Date;
  status: CertificateStatus;
}

export async function getAllCertificates(filters?: {
  status?: CertificateStatus;
  courseId?: string;
  studentId?: string;
  search?: string;
}): Promise<CertificateListRow[]> {
  const certs = await db.certificate.findMany({
    where: {
      status: filters?.status,
      courseId: filters?.courseId,
      studentId: filters?.studentId,
      ...(filters?.search
        ? {
            OR: [
              { certificateNumber: { contains: filters.search, mode: "insensitive" as const } },
              { student: { fullName: { contains: filters.search, mode: "insensitive" as const } } },
              { student: { studentId: { contains: filters.search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    include: {
      student: { select: { id: true, fullName: true, studentId: true } },
      course: { select: { id: true, title: true } },
    },
    orderBy: { issueDate: "desc" },
  });

  return certs.map((c) => ({
    id: c.id,
    studentId: c.student.id,
    studentName: c.student.fullName,
    studentCode: c.student.studentId,
    courseId: c.course.id,
    courseName: c.course.title,
    certificateNumber: c.certificateNumber,
    issueDate: c.issueDate,
    status: c.status,
  }));
}

/** A student's own certificates. Callers must resolve studentId from an
 *  already-guarded session first, matching src/lib/data/student-self.ts. */
export async function getCertificatesForStudent(studentId: string): Promise<CertificateListRow[]> {
  return getAllCertificates({ studentId });
}

export interface CertificateDetail {
  id: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  courseId: string;
  courseName: string;
  certificateNumber: string;
  verificationCode: string;
  issueDate: Date;
  status: CertificateStatus;
  notes: string | null;
  issuedByName: string | null;
  revokedAt: Date | null;
  revokeReason: string | null;
}

/** Staff can see any certificate; a student may only see their own. */
export async function getCertificateById(
  id: string,
  scope: CallerScope
): Promise<CertificateDetail | null> {
  const cert = await db.certificate.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, fullName: true, studentId: true, userId: true } },
      course: { select: { id: true, title: true } },
    },
  });
  if (!cert) return null;

  if (scope.role === "STUDENT" && cert.student.userId !== scope.userId) return null;

  const issuedByUser = cert.issuedBy
    ? await db.user.findUnique({ where: { id: cert.issuedBy }, select: { username: true } })
    : null;

  return {
    id: cert.id,
    studentId: cert.student.id,
    studentName: cert.student.fullName,
    studentCode: cert.student.studentId,
    courseId: cert.course.id,
    courseName: cert.course.title,
    certificateNumber: cert.certificateNumber,
    verificationCode: cert.verificationCode,
    issueDate: cert.issueDate,
    status: cert.status,
    notes: cert.notes,
    issuedByName: issuedByUser?.username ?? null,
    revokedAt: cert.revokedAt,
    revokeReason: cert.revokeReason,
  };
}

export interface EligibleCourseOption {
  id: string;
  title: string;
}

/** Courses this student is enrolled in that don't already have a non-revoked certificate. */
export async function getEligibleCoursesForStudent(studentId: string): Promise<EligibleCourseOption[]> {
  const [enrollments, existingCerts] = await Promise.all([
    db.enrollment.findMany({
      where: { studentId },
      select: { course: { select: { id: true, title: true } } },
      distinct: ["courseId"],
    }),
    db.certificate.findMany({
      where: { studentId, status: { not: "REVOKED" } },
      select: { courseId: true },
    }),
  ]);

  const certifiedCourseIds = new Set(existingCerts.map((c) => c.courseId));
  const seen = new Set<string>();
  const options: EligibleCourseOption[] = [];
  for (const e of enrollments) {
    if (certifiedCourseIds.has(e.course.id) || seen.has(e.course.id)) continue;
    seen.add(e.course.id);
    options.push({ id: e.course.id, title: e.course.title });
  }
  return options;
}

export interface StudentWithEligibleCourses {
  id: string;
  studentId: string;
  fullName: string;
  courses: EligibleCourseOption[];
}

/**
 * Bulk version of getEligibleCoursesForStudent, one query instead of N — for
 * the issuance form's student→course cascade, matching how AddStudentForm
 * pre-loads courses+batches and filters client-side rather than round-tripping.
 */
export async function getStudentsWithEligibleCourses(): Promise<StudentWithEligibleCourses[]> {
  const [students, certs] = await Promise.all([
    db.student.findMany({
      select: {
        id: true,
        studentId: true,
        fullName: true,
        enrollments: { select: { course: { select: { id: true, title: true } } }, distinct: ["courseId"] },
      },
      orderBy: { fullName: "asc" },
    }),
    db.certificate.findMany({ where: { status: { not: "REVOKED" } }, select: { studentId: true, courseId: true } }),
  ]);

  const certified = new Set(certs.map((c) => `${c.studentId}:${c.courseId}`));

  return students.map((s) => ({
    id: s.id,
    studentId: s.studentId,
    fullName: s.fullName,
    courses: s.enrollments
      .map((e) => e.course)
      .filter((c) => !certified.has(`${s.id}:${c.id}`)),
  }));
}
