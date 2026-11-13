import { db } from "@/lib/db";
import type { AccountStatus, BatchStatus } from "@prisma/client";

export interface TeacherListRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  specialization: string | null;
  status: AccountStatus;
  batchCount: number;
  studentCount: number;
}

/**
 * Paginated teacher listing, same shape as listStudents/listCourses/
 * listBatches — page/pageSize in, { rows, total, page, pageSize, pages }
 * out. Previously `getAllTeachers` returned every matching row with no
 * skip/take (flagged in the performance audit as unbounded, though at
 * current data volume it wasn't the actual bottleneck — Student 360 was;
 * this closes it out now that that's done). Sorting/filtering (status,
 * name/email search) and the single call site
 * (src/app/admin/teachers/page.tsx) are unchanged.
 */
export async function listTeachers(filters?: {
  status?: AccountStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  rows: TeacherListRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}> {
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;

  const where = {
    status: filters?.status,
    ...(filters?.search
      ? {
          OR: [
            { fullName: { contains: filters.search, mode: "insensitive" as const } },
            { email: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [teachers, total] = await Promise.all([
    db.teacher.findMany({
      where,
      include: {
        _count: { select: { batches: true } },
        batches: { select: { _count: { select: { enrollments: true } } } },
      },
      orderBy: { fullName: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.teacher.count({ where }),
  ]);

  return {
    rows: teachers.map((t) => ({
      id: t.id,
      fullName: t.fullName,
      email: t.email,
      phone: t.phone,
      specialization: t.specialization,
      status: t.status,
      batchCount: t._count.batches,
      studentCount: t.batches.reduce((sum, b) => sum + b._count.enrollments, 0),
    })),
    total,
    page,
    pageSize,
    pages: Math.ceil(total / pageSize),
  };
}

export interface TeacherBatchRow {
  id: string;
  code: string;
  name: string;
  courseTitle: string;
  startDate: Date | null;
  endDate: Date | null;
  status: BatchStatus;
}

export interface TeacherDetail {
  id: string;
  userId: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  specialization: string | null;
  status: AccountStatus;
  joiningDate: Date;
  batches: TeacherBatchRow[];
}

export async function getTeacherById(id: string): Promise<TeacherDetail | null> {
  const teacher = await db.teacher.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true } },
      batches: {
        include: { course: { select: { title: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!teacher) return null;

  return {
    id: teacher.id,
    userId: teacher.user.id,
    username: teacher.user.username,
    fullName: teacher.fullName,
    email: teacher.email,
    phone: teacher.phone,
    specialization: teacher.specialization,
    status: teacher.status,
    joiningDate: teacher.joiningDate,
    batches: teacher.batches.map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      courseTitle: b.course.title,
      startDate: b.startDate,
      endDate: b.endDate,
      status: b.status,
    })),
  };
}

export interface TeacherPickerOption {
  id: string;
  fullName: string;
  specialization: string | null;
}

/** Active teachers, for the Batch create/edit form. */
export async function getTeacherPicker(): Promise<TeacherPickerOption[]> {
  const teachers = await db.teacher.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, fullName: true, specialization: true },
    orderBy: { fullName: "asc" },
  });
  return teachers;
}
