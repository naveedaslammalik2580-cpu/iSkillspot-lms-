import { db } from "@/lib/db";
import type { CourseLevel, PublishStatus, BatchStatus, Prisma } from "@prisma/client";

export interface CourseListRow {
  id: string;
  code: string;
  name: string;
  duration: string | null;
  level: CourseLevel;
  status: PublishStatus;
  batchCount: number;
  studentCount: number;
}

export interface CourseFilters {
  status?: PublishStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Paginated course listing, same shape as listStudents (src/lib/data/students.ts)
 * — page/pageSize in, { rows, total, page, pageSize, pages } out. At current
 * seed volume (5 courses) this makes no measurable difference; it's here so
 * the query doesn't grow unbounded as courses accumulate over time.
 */
export async function listCourses(filters?: CourseFilters): Promise<{
  rows: CourseListRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}> {
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;

  const where: Prisma.CourseWhereInput = {
    status: filters?.status,
    ...(filters?.search
      ? {
          OR: [
            { title: { contains: filters.search, mode: "insensitive" as const } },
            { slug: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [courses, total] = await Promise.all([
    db.course.findMany({
      where,
      include: {
        _count: { select: { batches: true } },
        batches: { select: { _count: { select: { enrollments: true } } } },
      },
      orderBy: { title: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.course.count({ where }),
  ]);

  return {
    rows: courses.map((c) => ({
      id: c.id,
      code: c.slug,
      name: c.title,
      duration: c.duration,
      level: c.level,
      status: c.status,
      batchCount: c._count.batches,
      studentCount: c.batches.reduce((sum, b) => sum + b._count.enrollments, 0),
    })),
    total,
    page,
    pageSize,
    pages: Math.ceil(total / pageSize),
  };
}

export interface CourseBatchRow {
  id: string;
  code: string;
  name: string;
  teacherName: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: BatchStatus;
  activeStudentCount: number;
}

export interface CourseDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  duration: string | null;
  level: CourseLevel;
  status: PublishStatus;
  batches: CourseBatchRow[];
}

export async function getCourseById(id: string): Promise<CourseDetail | null> {
  const course = await db.course.findUnique({
    where: { id },
    include: {
      batches: {
        include: {
          teacher: { select: { fullName: true } },
          enrollments: { where: { status: "ACTIVE" }, select: { id: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!course) return null;

  return {
    id: course.id,
    code: course.slug,
    name: course.title,
    description: course.description,
    duration: course.duration,
    level: course.level,
    status: course.status,
    batches: course.batches.map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      teacherName: b.teacher?.fullName ?? null,
      startDate: b.startDate,
      endDate: b.endDate,
      status: b.status,
      activeStudentCount: b.enrollments.length,
    })),
  };
}

export interface CoursePickerOption {
  id: string;
  code: string;
  name: string;
}

/** Non-archived courses, for Batch/Fee/etc. create forms. */
export async function getCoursePicker(): Promise<CoursePickerOption[]> {
  const courses = await db.course.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, slug: true, title: true },
    orderBy: { title: "asc" },
  });
  return courses.map((c) => ({ id: c.id, code: c.slug, name: c.title }));
}
