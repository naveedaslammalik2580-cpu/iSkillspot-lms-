import { db } from "@/lib/db";
import type { BatchStatus } from "@prisma/client";

export interface BatchListRow {
  id: string;
  code: string;
  name: string;
  courseId: string;
  courseTitle: string;
  teacherName: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: BatchStatus;
  enrolledCount: number;
}

export async function getAllBatches(filters?: {
  status?: BatchStatus;
  courseId?: string;
  teacherId?: string;
  search?: string;
}): Promise<BatchListRow[]> {
  const batches = await db.batch.findMany({
    where: {
      status: filters?.status,
      courseId: filters?.courseId,
      teacherId: filters?.teacherId,
      ...(filters?.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" as const } },
              { code: { contains: filters.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: {
      course: { select: { id: true, title: true } },
      teacher: { select: { fullName: true } },
      _count: { select: { enrollments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return batches.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    courseId: b.course.id,
    courseTitle: b.course.title,
    teacherName: b.teacher?.fullName ?? null,
    startDate: b.startDate,
    endDate: b.endDate,
    status: b.status,
    enrolledCount: b._count.enrollments,
  }));
}

export interface BatchStudentRow {
  id: string;
  studentIdCode: string;
  fullName: string;
  enrollmentStatus: string;
}

export interface BatchDetail {
  id: string;
  code: string;
  name: string;
  courseId: string;
  courseTitle: string;
  teacherId: string | null;
  teacherName: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: BatchStatus;
  students: BatchStudentRow[];
  stats: { totalEnrolled: number; activeEnrolled: number; attendanceMarkedDays: number };
}

export async function getBatchById(id: string): Promise<BatchDetail | null> {
  const batch = await db.batch.findUnique({
    where: { id },
    include: {
      course: { select: { id: true, title: true } },
      teacher: { select: { id: true, fullName: true } },
      enrollments: {
        include: { student: { select: { id: true, studentId: true, fullName: true } } },
        orderBy: { student: { fullName: "asc" } },
      },
    },
  });
  if (!batch) return null;

  const attendanceDates = await db.attendance.findMany({
    where: { batchId: id },
    select: { date: true },
    distinct: ["date"],
  });

  return {
    id: batch.id,
    code: batch.code,
    name: batch.name,
    courseId: batch.course.id,
    courseTitle: batch.course.title,
    teacherId: batch.teacher?.id ?? null,
    teacherName: batch.teacher?.fullName ?? null,
    startDate: batch.startDate,
    endDate: batch.endDate,
    status: batch.status,
    students: batch.enrollments.map((e) => ({
      id: e.student.id,
      studentIdCode: e.student.studentId,
      fullName: e.student.fullName,
      enrollmentStatus: e.status,
    })),
    stats: {
      totalEnrolled: batch.enrollments.length,
      activeEnrolled: batch.enrollments.filter((e) => e.status === "ACTIVE").length,
      attendanceMarkedDays: attendanceDates.length,
    },
  };
}

export interface BatchPickerOption {
  id: string;
  code: string;
  name: string;
  courseTitle: string;
}

export async function getBatchPicker(filters?: {
  courseId?: string;
  teacherId?: string;
}): Promise<BatchPickerOption[]> {
  const batches = await db.batch.findMany({
    where: { courseId: filters?.courseId, teacherId: filters?.teacherId },
    include: { course: { select: { title: true } } },
    orderBy: { name: "asc" },
  });
  return batches.map((b) => ({ id: b.id, code: b.code, name: b.name, courseTitle: b.course.title }));
}
