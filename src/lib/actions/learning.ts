"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, requireStudentSelf, assertTeacherOwnsCourse } from "@/lib/auth/guards";
import { classifyResourceUrl } from "@/lib/data/learning";
import { getSignedDownloadUrl } from "@/lib/storage/supabase";

/**
 * Student lesson-progress actions and lesson-resource access.
 *
 * The acting identity always comes from the server-side session — a
 * client can never name a student, teacher or course it is acting for.
 */

export type LearningResult = { ok: true } | { ok: false; error: string };

export async function setLessonCompleted(lessonId: string, completed: boolean): Promise<LearningResult> {
  const { student } = await requireStudentSelf();

  const lesson = await db.lesson.findFirst({
    where: { id: lessonId, isPublished: true },
    select: { id: true, module: { select: { courseId: true } } },
  });
  if (!lesson) return { ok: false, error: "Lesson not found." };

  const courseId = lesson.module.courseId;
  const enrollment = await db.enrollment.findFirst({
    where: { studentId: student.id, courseId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { id: true },
  });
  if (!enrollment) return { ok: false, error: "You are not enrolled in this course." };

  // @@unique([studentId, lessonId]) makes this upsert race-safe: repeated
  // toggles update the single row instead of creating duplicates.
  await db.lessonProgress.upsert({
    where: { studentId_lessonId: { studentId: student.id, lessonId } },
    create: {
      studentId: student.id,
      lessonId,
      completed,
      completedAt: completed ? new Date() : null,
    },
    update: {
      completed,
      completedAt: completed ? new Date() : null,
    },
  });

  revalidatePath(`/student/courses/${courseId}`);
  revalidatePath(`/student/courses/${courseId}/lessons/${lessonId}`);
  revalidatePath(`/student/courses`);
  return { ok: true };
}

/**
 * Resolve a lesson resource to a safe URL for the current user, or fail.
 * Used by the /api/lessons/resources route handler (mirrors the
 * assignment-file download pattern): authorization is enforced here,
 * before any external redirect or signed URL is issued.
 *
 * - Students: must be enrolled in the lesson's course and the lesson
 *   must be published.
 * - Teachers: must be assigned to the lesson's course (any publish state).
 * - Staff (SUPER_ADMIN / ADMIN): allowed.
 * - External fileUrls are validated http(s) URLs, returned as stored.
 * - Storage keys are exchanged for short-lived signed URLs via the
 *   existing storage helper. The service-role key never leaves the server.
 */
export async function getLessonResourceAccess(
  resourceId: string
): Promise<{ ok: true; url: string } | { ok: false }> {
  const session = await requireSession();

  const resource = await db.lessonResource.findUnique({
    where: { id: resourceId },
    select: {
      fileUrl: true,
      lesson: {
        select: {
          isPublished: true,
          module: { select: { courseId: true } },
        },
      },
    },
  });
  if (!resource) return { ok: false };
  const courseId = resource.lesson.module.courseId;

  try {
    if (session.role === "STUDENT") {
      const student = await db.student.findUnique({
        where: { userId: session.userId },
        select: { id: true },
      });
      if (!student || !resource.lesson.isPublished) return { ok: false };
      const enrollment = await db.enrollment.findFirst({
        where: { studentId: student.id, courseId, status: { in: ["ACTIVE", "COMPLETED"] } },
        select: { id: true },
      });
      if (!enrollment) return { ok: false };
    } else if (session.role === "TEACHER") {
      const teacher = await db.teacher.findUnique({
        where: { userId: session.userId },
        select: { id: true },
      });
      if (!teacher) return { ok: false };
      await assertTeacherOwnsCourse(teacher.id, courseId);
    } else if (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN") {
      return { ok: false };
    }
  } catch {
    return { ok: false };
  }

  const kind = classifyResourceUrl(resource.fileUrl);
  if (kind === "external") return { ok: true, url: resource.fileUrl.trim() };
  if (kind === "storage-key") {
    try {
      const url = await getSignedDownloadUrl(resource.fileUrl.trim());
      return { ok: true, url };
    } catch {
      return { ok: false };
    }
  }
  return { ok: false };
}
