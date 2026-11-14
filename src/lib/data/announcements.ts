import { db } from "@/lib/db";
import type { AnnouncementAudience, PublishStatus, Role } from "@prisma/client";
import { getBatchesForTeacher } from "@/lib/data/attendance";
import { getCoursesForTeacher } from "@/lib/data/assignments";

export interface CallerScope {
  role: Role;
  userId: string;
}

function audienceLabel(a: AnnouncementAudience): string {
  return { ALL: "Everyone", STUDENTS: "All students", TEACHERS: "All teachers", BATCH: "One batch", COURSE: "One course" }[a];
}

export interface AnnouncementListRow {
  id: string;
  title: string;
  audience: AnnouncementAudience;
  audienceLabel: string;
  status: PublishStatus;
  publishedAt: Date | null;
  createdAt: Date;
}

export async function getAllAnnouncements(filters?: {
  status?: PublishStatus;
  audience?: AnnouncementAudience;
  search?: string;
}): Promise<AnnouncementListRow[]> {
  const rows = await db.announcement.findMany({
    where: {
      status: filters?.status,
      audience: filters?.audience,
      ...(filters?.search
        ? { title: { contains: filters.search, mode: "insensitive" as const } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((a) => ({
    id: a.id,
    title: a.title,
    audience: a.audience,
    audienceLabel: audienceLabel(a.audience),
    status: a.status,
    publishedAt: a.publishedAt,
    createdAt: a.createdAt,
  }));
}

export interface AnnouncementDetail {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  audienceLabel: string;
  targetBatchId: string | null;
  targetBatchName: string | null;
  targetCourseId: string | null;
  targetCourseName: string | null;
  status: PublishStatus;
  publishedAt: Date | null;
  createdAt: Date;
  authorName: string;
}

async function toDetail(a: {
  id: string;
  title: string;
  content: string;
  audience: AnnouncementAudience;
  targetBatchId: string | null;
  targetCourseId: string | null;
  status: PublishStatus;
  publishedAt: Date | null;
  createdAt: Date;
  author: { username: string };
  batch: { name: string } | null;
}): Promise<AnnouncementDetail> {
  let targetCourseName: string | null = null;
  if (a.targetCourseId) {
    const course = await db.course.findUnique({ where: { id: a.targetCourseId }, select: { title: true } });
    targetCourseName = course?.title ?? null;
  }
  return {
    id: a.id,
    title: a.title,
    body: a.content,
    audience: a.audience,
    audienceLabel: audienceLabel(a.audience),
    targetBatchId: a.targetBatchId,
    targetBatchName: a.batch?.name ?? null,
    targetCourseId: a.targetCourseId,
    targetCourseName,
    status: a.status,
    publishedAt: a.publishedAt,
    createdAt: a.createdAt,
    authorName: a.author.username,
  };
}

/**
 * Staff can see any announcement. Students/teachers may only see PUBLISHED
 * announcements that are actually in their audience — re-checked here, not
 * just trusted from the caller, matching the rest of src/lib/data/*.
 */
export async function getAnnouncementById(
  id: string,
  scope: CallerScope
): Promise<AnnouncementDetail | null> {
  const a = await db.announcement.findUnique({
    where: { id },
    include: { author: { select: { username: true } }, batch: { select: { name: true } } },
  });
  if (!a) return null;

  if (scope.role === "SUPER_ADMIN" || scope.role === "ADMIN") return toDetail(a);
  if (a.status !== "PUBLISHED") return null;

  if (scope.role === "STUDENT") {
    const student = await db.student.findUnique({ where: { userId: scope.userId } });
    if (!student) return null;
    const enrollments = await db.enrollment.findMany({
      where: { studentId: student.id, accessSuspended: false, status: { in: ["ACTIVE", "COMPLETED"] } },
      select: { batchId: true, courseId: true },
    });
    const inAudience =
      a.audience === "ALL" ||
      a.audience === "STUDENTS" ||
      (a.audience === "BATCH" && enrollments.some((e) => e.batchId === a.targetBatchId)) ||
      (a.audience === "COURSE" && enrollments.some((e) => e.courseId === a.targetCourseId));
    return inAudience ? toDetail(a) : null;
  }

  if (scope.role === "TEACHER") {
    const teacher = await db.teacher.findUnique({ where: { userId: scope.userId } });
    if (!teacher) return null;
    const batches = await db.batch.findMany({ where: { teacherId: teacher.id }, select: { id: true, courseId: true } });
    const inAudience =
      a.audience === "ALL" ||
      a.audience === "TEACHERS" ||
      (a.audience === "BATCH" && batches.some((b) => b.id === a.targetBatchId)) ||
      (a.audience === "COURSE" && batches.some((b) => b.courseId === a.targetCourseId));
    return inAudience ? toDetail(a) : null;
  }

  return null;
}

/** PUBLISHED announcements in this student's audience, newest first. */
export async function getAnnouncementsForStudent(studentId: string): Promise<AnnouncementListRow[]> {
  const enrollments = await db.enrollment.findMany({
    where: { studentId, accessSuspended: false, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { batchId: true, courseId: true },
  });
  const batchIds = enrollments.map((e) => e.batchId);
  const courseIds = enrollments.map((e) => e.courseId);

  const rows = await db.announcement.findMany({
    where: {
      status: "PUBLISHED",
      OR: [
        { audience: "ALL" },
        { audience: "STUDENTS" },
        { audience: "BATCH", targetBatchId: { in: batchIds } },
        { audience: "COURSE", targetCourseId: { in: courseIds } },
      ],
    },
    orderBy: { publishedAt: "desc" },
  });
  return rows.map((a) => ({
    id: a.id,
    title: a.title,
    audience: a.audience,
    audienceLabel: audienceLabel(a.audience),
    status: a.status,
    publishedAt: a.publishedAt,
    createdAt: a.createdAt,
  }));
}

/** PUBLISHED announcements in this teacher's audience, newest first. */
export async function getAnnouncementsForTeacher(teacherId: string): Promise<AnnouncementListRow[]> {
  const [batches, courses] = await Promise.all([
    getBatchesForTeacher(teacherId),
    getCoursesForTeacher(teacherId),
  ]);
  const batchIds = batches.map((b) => b.id);
  const courseIds = courses.map((c) => c.id);

  const rows = await db.announcement.findMany({
    where: {
      status: "PUBLISHED",
      OR: [
        { audience: "ALL" },
        { audience: "TEACHERS" },
        { audience: "BATCH", targetBatchId: { in: batchIds } },
        { audience: "COURSE", targetCourseId: { in: courseIds } },
      ],
    },
    orderBy: { publishedAt: "desc" },
  });
  return rows.map((a) => ({
    id: a.id,
    title: a.title,
    audience: a.audience,
    audienceLabel: audienceLabel(a.audience),
    status: a.status,
    publishedAt: a.publishedAt,
    createdAt: a.createdAt,
  }));
}
