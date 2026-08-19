import { db } from "@/lib/db";
import type { Prisma, StudentStatus } from "@prisma/client";
import { pct } from "@/lib/utils";

export interface StudentFilters {
  q?: string;
  courseId?: string;
  batchId?: string;
  status?: StudentStatus;
  page?: number;
  pageSize?: number;
}

export async function listStudents(filters: StudentFilters) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;

  const where: Prisma.StudentWhereInput = {};
  if (filters.q) {
    where.OR = [
      { fullName: { contains: filters.q, mode: "insensitive" } },
      { studentId: { contains: filters.q, mode: "insensitive" } },
      { email: { contains: filters.q, mode: "insensitive" } },
      { phone: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (filters.status) where.status = filters.status;
  if (filters.courseId || filters.batchId) {
    where.enrollments = {
      some: {
        ...(filters.courseId ? { courseId: filters.courseId } : {}),
        ...(filters.batchId ? { batchId: filters.batchId } : {}),
      },
    };
  }

  const [rows, total] = await Promise.all([
    db.student.findMany({
      where,
      include: {
        enrollments: { include: { course: true, batch: true }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.student.count({ where }),
  ]);

  return { rows, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

/** Full Section-8 360° profile. */
export async function getStudent360(id: string) {
  const student = await db.student.findUnique({
    where: { id },
    include: {
      user: { select: { username: true, email: true, status: true, lastLogin: true } },
      enrollments: { include: { course: true, batch: { include: { teacher: true } } } },
      attendance: true,
      submissions: { include: { assignment: true } },
      quizAttempts: { include: { quiz: true } },
      grades: true,
      fees: { include: { payments: true } },
      certificates: { include: { course: true } },
    },
  });
  if (!student) return null;

  // Attendance summary
  const attTotal = student.attendance.length;
  const present = student.attendance.filter((a) => a.status === "PRESENT").length;
  const absent = student.attendance.filter((a) => a.status === "ABSENT").length;
  const late = student.attendance.filter((a) => a.status === "LATE").length;
  const attendancePct = pct(present + late, attTotal);

  // Assignment summary
  const subs = student.submissions;
  const graded = subs.filter((s) => s.status === "GRADED");
  const avgAssignment = graded.length
    ? Math.round(graded.reduce((s, x) => s + (x.score ?? 0), 0) / graded.length)
    : 0;

  // Quiz summary
  const quizAttempts = student.quizAttempts;
  const avgQuiz = quizAttempts.length
    ? Math.round(quizAttempts.reduce((s, x) => s + x.percentage, 0) / quizAttempts.length)
    : 0;
  const bestQuiz = quizAttempts.reduce((m, x) => Math.max(m, x.percentage), 0);

  // Overall progress
  const overallProgress = student.enrollments.length
    ? Math.round(
        student.enrollments.reduce((s, e) => s + e.progress, 0) /
          student.enrollments.length
      )
    : 0;

  // Fees
  const feeTotals = student.fees.reduce(
    (acc, f) => {
      acc.total += f.finalFee;
      acc.paid += f.amountPaid;
      acc.remaining += f.remainingBalance;
      return acc;
    },
    { total: 0, paid: 0, remaining: 0 }
  );

  return {
    student,
    summary: {
      attendance: { total: attTotal, present, absent, late, pct: attendancePct },
      assignments: {
        total: subs.length,
        completed: subs.filter((s) => s.status === "SUBMITTED" || s.status === "GRADED").length,
        pending: subs.filter((s) => s.status === "PENDING").length,
        late: subs.filter((s) => s.status === "LATE").length,
        avgScore: avgAssignment,
      },
      quizzes: { attempts: quizAttempts.length, avg: avgQuiz, best: bestQuiz },
      overallProgress,
      fees: feeTotals,
    },
  };
}

export async function getCoursesAndBatches() {
  const courses = await db.course.findMany({
    where: { status: { not: "ARCHIVED" } },
    include: { batches: true },
    orderBy: { title: "asc" },
  });
  return courses;
}
