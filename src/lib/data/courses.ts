import { db } from "@/lib/db";
import type { CourseLevel, PublishStatus, BatchStatus } from "@prisma/client";

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

export async function getAllCourses(filters?: {
  status?: PublishStatus;
  search?: string;
}): Promise<CourseListRow[]> {
  const courses = await db.course.findMany({
    where: {
      status: filters?.status,
      ...(filters?.search
        ? {
            OR: [
              { title: { contains: filters.search, mode: "insensitive" as const } },
              { slug: { contains: filters.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: {
      _count: { select: { batches: true } },
      batches: { select: { _count: { select: { enrollments: true } } } },
    },
    orderBy: { title: "asc" },
  });

  return courses.map((c) => ({
    id: c.id,
    code: c.slug,
    name: c.title,
    duration: c.duration,
    level: c.level,
    status: c.status,
    batchCount: c._count.batches,
    studentCount: c.batches.reduce((sum, b) => sum + b._count.enrollments, 0),
  }));
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
