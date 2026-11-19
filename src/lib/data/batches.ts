import { db } from "@/lib/db";
import type { BatchStatus, Prisma } from "@prisma/client";

export interface BatchListRow {
  id: string;
  code: string;
  name: string;
  courseId: string;
  courseTitle: string;
  startDate: Date | null;
  endDate: Date | null;
  status: BatchStatus;
  enrolledCount: number;
}

export interface BatchFilters {
  status?: BatchStatus;
  courseId?: string;
  search?: string;
}

const batchInclude = {
  course: { select: { id: true, title: true } },
  _count: { select: { enrollments: true } },
} satisfies Prisma.BatchInclude;

type BatchWithRelations = Prisma.BatchGetPayload<{ include: typeof batchInclude }>;

function mapBatchRow(b: BatchWithRelations): BatchListRow {
  return {
    id: b.id,
    code: b.code,
    name: b.name,
    courseId: b.course.id,
    courseTitle: b.course.title,
    startDate: b.startDate,
    endDate: b.endDate,
    status: b.status,
    enrolledCount: b._count.enrollments,
  };
}

function buildBatchWhere(filters?: BatchFilters): Prisma.BatchWhereInput {
  return {
    status: filters?.status,
    courseId: filters?.courseId,
    ...(filters?.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" as const } },
            { code: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

/**
 * Paginated batch listing, same shape as listStudents/listCourses — page/
 * pageSize in, { rows, total, page, pageSize, pages } out. At current seed
 * volume (10 batches) this makes no measurable difference; it's here so the
 * query doesn't grow unbounded as batches accumulate over time.
 */
export async function listBatches(filters?: BatchFilters & { page?: number; pageSize?: number }): Promise<{
  rows: BatchListRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}> {
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;
  const where = buildBatchWhere(filters);

  const [batches, total] = await Promise.all([
    db.batch.findMany({
      where,
      include: batchInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.batch.count({ where }),
  ]);

  return {
    rows: batches.map(mapBatchRow),
    total,
    page,
    pageSize,
    pages: Math.ceil(total / pageSize),
  };
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
  startDate: Date | null;
  endDate: Date | null;
  status: BatchStatus;
  students: BatchStudentRow[];
  stats: { totalEnrolled: number; activeEnrolled: number };
}

export async function getBatchById(id: string): Promise<BatchDetail | null> {
  const batch = await db.batch.findUnique({
    where: { id },
    include: {
      course: { select: { id: true, title: true } },
      enrollments: {
        include: { student: { select: { id: true, studentId: true, fullName: true } } },
        orderBy: { student: { fullName: "asc" } },
      },
    },
  });
  if (!batch) return null;

  return {
    id: batch.id,
    code: batch.code,
    name: batch.name,
    courseId: batch.course.id,
    courseTitle: batch.course.title,
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
}): Promise<BatchPickerOption[]> {
  const batches = await db.batch.findMany({
    where: { courseId: filters?.courseId },
    include: { course: { select: { title: true } } },
    orderBy: { name: "asc" },
  });
  return batches.map((b) => ({ id: b.id, code: b.code, name: b.name, courseTitle: b.course.title }));
}
