import { db } from "@/lib/db";
import type { FeeStatus } from "@prisma/client";

export interface FeeListRow {
  id: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  courseId: string;
  courseName: string;
  finalFee: number;
  amountPaid: number;
  remainingBalance: number;
  status: FeeStatus;
  dueDate: Date | null;
}

/** Admin fee list, with student/course names joined in for display. */
export async function getAllFees(filters?: {
  status?: FeeStatus;
  courseId?: string;
  studentId?: string;
  search?: string;
}): Promise<FeeListRow[]> {
  const fees = await db.fee.findMany({
    where: {
      status: filters?.status,
      courseId: filters?.courseId,
      studentId: filters?.studentId,
      ...(filters?.search
        ? {
            student: {
              OR: [
                { fullName: { contains: filters.search, mode: "insensitive" as const } },
                { studentId: { contains: filters.search, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
    },
    include: {
      student: { select: { id: true, fullName: true, studentId: true } },
      course: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return fees.map((f) => ({
    id: f.id,
    studentId: f.student.id,
    studentName: f.student.fullName,
    studentCode: f.student.studentId,
    courseId: f.course.id,
    courseName: f.course.title,
    finalFee: f.finalFee,
    amountPaid: f.amountPaid,
    remainingBalance: f.remainingBalance,
    status: f.status,
    dueDate: f.dueDate,
  }));
}

/**
 * Paginated fee listing, same shape as listStudents/listCourses/listBatches/
 * listTeachers — page/pageSize in, { rows, total, page, pageSize, pages }
 * out. For the admin fee list specifically. `getAllFees` above stays
 * unpaginated and untouched — it also backs getFeesForStudent(), a single
 * student's own (small, unbounded-by-need) fee list, which must not be
 * capped to a page size. Financial totals shown on the admin page come from
 * getFeeSummary() below, which already aggregates in Postgres and is
 * completely independent of this row list — pagination here cannot affect
 * those totals since they were never computed from the row array.
 */
export async function listFees(filters?: {
  status?: FeeStatus;
  courseId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  rows: FeeListRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}> {
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;

  const where = {
    status: filters?.status,
    courseId: filters?.courseId,
    ...(filters?.search
      ? {
          student: {
            OR: [
              { fullName: { contains: filters.search, mode: "insensitive" as const } },
              { studentId: { contains: filters.search, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [fees, total] = await Promise.all([
    db.fee.findMany({
      where,
      include: {
        student: { select: { id: true, fullName: true, studentId: true } },
        course: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.fee.count({ where }),
  ]);

  return {
    rows: fees.map((f) => ({
      id: f.id,
      studentId: f.student.id,
      studentName: f.student.fullName,
      studentCode: f.student.studentId,
      courseId: f.course.id,
      courseName: f.course.title,
      finalFee: f.finalFee,
      amountPaid: f.amountPaid,
      remainingBalance: f.remainingBalance,
      status: f.status,
      dueDate: f.dueDate,
    })),
    total,
    page,
    pageSize,
    pages: Math.ceil(total / pageSize),
  };
}

export interface FeeSummary {
  totalOutstanding: number;
  paidThisMonth: number;
  overdueCount: number;
}

/** Summary tiles for the admin fee list header. */
export async function getFeeSummary(): Promise<FeeSummary> {
  const [outstanding, overdueCount, monthPayments] = await Promise.all([
    db.fee.aggregate({ _sum: { remainingBalance: true } }),
    db.fee.count({ where: { status: "OVERDUE" } }),
    db.payment.aggregate({
      _sum: { amount: true },
      where: {
        voidedAt: null,
        paymentDate: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    }),
  ]);

  return {
    totalOutstanding: outstanding._sum.remainingBalance ?? 0,
    paidThisMonth: monthPayments._sum.amount ?? 0,
    overdueCount,
  };
}

export interface FeePaymentRow {
  id: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: string | null;
  transactionReference: string | null;
  notes: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
}

export interface FeeDetail {
  id: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  courseId: string;
  courseName: string;
  totalFee: number;
  discount: number;
  finalFee: number;
  amountPaid: number;
  remainingBalance: number;
  status: FeeStatus;
  dueDate: Date | null;
  description: string | null;
  createdAt: Date;
  payments: FeePaymentRow[];
}

/** Full fee detail, including payment history (active and voided). */
export async function getFeeById(id: string): Promise<FeeDetail | null> {
  const fee = await db.fee.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, fullName: true, studentId: true } },
      course: { select: { id: true, title: true } },
      payments: { orderBy: { paymentDate: "desc" } },
    },
  });
  if (!fee) return null;

  return {
    id: fee.id,
    studentId: fee.student.id,
    studentName: fee.student.fullName,
    studentCode: fee.student.studentId,
    courseId: fee.course.id,
    courseName: fee.course.title,
    totalFee: fee.totalFee,
    discount: fee.discount,
    finalFee: fee.finalFee,
    amountPaid: fee.amountPaid,
    remainingBalance: fee.remainingBalance,
    status: fee.status,
    dueDate: fee.dueDate,
    description: fee.description,
    createdAt: fee.createdAt,
    payments: fee.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      paymentDate: p.paymentDate,
      paymentMethod: p.paymentMethod,
      transactionReference: p.transactionReference,
      notes: p.notes,
      voidedAt: p.voidedAt,
      voidReason: p.voidReason,
    })),
  };
}

/**
 * A student's own fees. Callers must resolve `studentId` from an already-
 * guarded session first (matching the rest of src/lib/data/student-self.ts) —
 * this function does not re-check the session itself.
 */
export async function getFeesForStudent(studentId: string): Promise<FeeListRow[]> {
  const enrollments = await db.enrollment.findMany({ where: { studentId, accessSuspended: false, status: { in: ["ACTIVE", "COMPLETED"] } }, select: { courseId: true } });
  const courses = new Set(enrollments.map(e => e.courseId));
  return (await getAllFees({ studentId })).filter(f => courses.has(f.courseId));
}

/** Course.defaultFee for fee-form auto-fill. Null if unset. */
export async function getCourseDefaultFee(courseId: string): Promise<number | null> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { defaultFee: true },
  });
  return course?.defaultFee ?? null;
}

export interface CourseFeeOption {
  id: string;
  name: string;
  defaultFee: number | null;
}

/** Course + defaultFee list, for the fee form's course-change auto-fill. */
export async function getCoursesWithDefaultFee(): Promise<CourseFeeOption[]> {
  const courses = await db.course.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, title: true, defaultFee: true },
    orderBy: { title: "asc" },
  });
  return courses.map((c) => ({ id: c.id, name: c.title, defaultFee: c.defaultFee }));
}
