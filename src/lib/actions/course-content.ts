"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, assertTeacherOwnsCourse } from "@/lib/auth/guards";
import { logAction } from "@/lib/audit";
import { classifyResourceUrl } from "@/lib/data/learning";
import { notifyUsers } from "@/lib/notifications";

/**
 * Module / lesson / resource management.
 *
 * Authorization: the existing permission matrix grants `lesson.manage`
 * to SUPER_ADMIN, ADMIN and TEACHER. Staff manage any course; teachers
 * are additionally scoped — at this data layer, on every call — to
 * courses they are assigned to via batches (assertTeacherOwnsCourse).
 * No permission was broadened to implement this module.
 *
 * Safe-delete rules (learning history is never collateral damage):
 * - A module can be deleted only when it has no lessons, assignments
 *   or quizzes.
 * - A lesson can be deleted only when no student has a progress record
 *   for it. (Its resource rows go with it; stored files are not touched.)
 * - Resources can always be removed (metadata row only).
 */

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function requireContentManager(courseId: string) {
  const session = await requirePermission("lesson.manage");
  if (session.role === "TEACHER") {
    const teacher = await db.teacher.findUnique({
      where: { userId: session.userId },
      select: { id: true },
    });
    if (!teacher) throw new Error("Teacher profile not found.");
    await assertTeacherOwnsCourse(teacher.id, courseId);
  }
  return session;
}

function revalidateCourse(courseId: string) {
  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath(`/admin/courses/${courseId}/content`);
  revalidatePath(`/teacher/courses/${courseId}`);
  revalidatePath(`/teacher/courses/${courseId}/content`);
  revalidatePath(`/teacher/courses`);
  revalidatePath(`/student/courses/${courseId}`);
  revalidatePath(`/student/courses`);
}

async function courseIdOfModule(moduleId: string): Promise<string | null> {
  const m = await db.module.findUnique({ where: { id: moduleId }, select: { courseId: true } });
  return m?.courseId ?? null;
}

async function courseIdOfLesson(lessonId: string): Promise<{ courseId: string; moduleId: string } | null> {
  const l = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { module: { select: { id: true, courseId: true } } },
  });
  return l ? { courseId: l.module.courseId, moduleId: l.module.id } : null;
}

// ---------------------------------------------------------------------------
// Phase 8 — lesson-published notifications (existing notification system)
// ---------------------------------------------------------------------------

/**
 * Notify actively-enrolled students that a lesson was published. Fires
 * ONLY on a draft->published transition (or a lesson created already
 * published) — never for edits to an already-published lesson — and the
 * stable dedupeKey makes any accidental second call a no-op. Uses the
 * existing notification service unchanged (it filters to ACTIVE user
 * accounts and applies user preferences).
 */
async function notifyLessonPublished(lessonId: string, courseId: string): Promise<void> {
  const [lesson, course, enrollments] = await Promise.all([
    db.lesson.findUnique({ where: { id: lessonId }, select: { title: true } }),
    db.course.findUnique({ where: { id: courseId }, select: { title: true } }),
    db.enrollment.findMany({
      where: { courseId, status: "ACTIVE" },
      select: { student: { select: { userId: true } } },
    }),
  ]);
  if (!lesson || !course) return;
  const userIds = [...new Set(enrollments.map((e) => e.student.userId))];
  if (userIds.length === 0) return;
  await notifyUsers(userIds, {
    type: "LESSON",
    title: `New lesson in ${course.title}`,
    message: `"${lesson.title}" is now available in your course.`,
    linkUrl: `/student/courses/${courseId}/lessons/${lessonId}`,
    dedupeKey: `lesson-published:${lessonId}`,
  });
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

const moduleSchema = z.object({
  title: z.string().min(2, "Title is required").max(200),
  description: z.string().max(5000).optional(),
  order: z.coerce.number().int().min(0).max(999).default(0),
});

export async function createModule(courseId: string, input: z.infer<typeof moduleSchema>): Promise<Result<{ id: string }>> {
  const session = await requireContentManager(courseId);
  const parsed = moduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  const course = await db.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) return { ok: false, error: "Course not found." };

  const mod = await db.module.create({
    data: {
      courseId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      order: parsed.data.order,
    },
  });
  await logAction({ userId: session.userId, action: "Created module", entity: "Module", entityId: mod.id, metadata: { courseId, title: mod.title } });
  revalidateCourse(courseId);
  return { ok: true, data: { id: mod.id } };
}

export async function updateModule(moduleId: string, input: z.infer<typeof moduleSchema>): Promise<Result> {
  const courseId = await courseIdOfModule(moduleId);
  if (!courseId) return { ok: false, error: "Module not found." };
  const session = await requireContentManager(courseId);
  const parsed = moduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };

  await db.module.update({
    where: { id: moduleId },
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      order: parsed.data.order,
    },
  });
  await logAction({ userId: session.userId, action: "Updated module", entity: "Module", entityId: moduleId, metadata: { courseId } });
  revalidateCourse(courseId);
  return { ok: true };
}

export async function deleteModule(moduleId: string): Promise<Result> {
  const courseId = await courseIdOfModule(moduleId);
  if (!courseId) return { ok: false, error: "Module not found." };
  const session = await requireContentManager(courseId);

  const counts = await db.module.findUnique({
    where: { id: moduleId },
    select: { _count: { select: { lessons: true, assignments: true, quizzes: true } } },
  });
  if (!counts) return { ok: false, error: "Module not found." };
  const { lessons, assignments, quizzes } = counts._count;
  if (lessons > 0 || assignments > 0 || quizzes > 0) {
    return {
      ok: false,
      error: `Module cannot be deleted while it contains ${lessons} lesson(s), ${assignments} assignment(s) and ${quizzes} quiz(zes). Move or remove those first.`,
    };
  }

  await db.module.delete({ where: { id: moduleId } });
  await logAction({ userId: session.userId, action: "Deleted module", entity: "Module", entityId: moduleId, metadata: { courseId } });
  revalidateCourse(courseId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

const lessonSchema = z.object({
  title: z.string().min(2, "Title is required").max(200),
  description: z.string().max(5000).optional(),
  content: z.string().max(50000).optional(),
  videoUrl: z
    .string()
    .max(2000)
    .optional()
    .refine((v) => !v || classifyResourceUrl(v) === "external", "Video URL must be a valid http(s) URL"),
  duration: z.string().max(50).optional(),
  order: z.coerce.number().int().min(0).max(999).default(0),
  isPublished: z.boolean().default(false),
});

export async function createLesson(moduleId: string, input: z.infer<typeof lessonSchema>): Promise<Result<{ id: string }>> {
  const courseId = await courseIdOfModule(moduleId);
  if (!courseId) return { ok: false, error: "Module not found." };
  const session = await requireContentManager(courseId);
  const parsed = lessonSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const lesson = await db.lesson.create({
    data: {
      moduleId,
      title: d.title,
      description: d.description || null,
      content: d.content || null,
      videoUrl: d.videoUrl || null,
      duration: d.duration || null,
      order: d.order,
      isPublished: d.isPublished,
    },
  });
  await logAction({ userId: session.userId, action: "Created lesson", entity: "Lesson", entityId: lesson.id, metadata: { courseId, moduleId, title: lesson.title } });
  if (lesson.isPublished) await notifyLessonPublished(lesson.id, courseId);
  revalidateCourse(courseId);
  return { ok: true, data: { id: lesson.id } };
}

export async function updateLesson(lessonId: string, input: z.infer<typeof lessonSchema>): Promise<Result> {
  const located = await courseIdOfLesson(lessonId);
  if (!located) return { ok: false, error: "Lesson not found." };
  const session = await requireContentManager(located.courseId);
  const parsed = lessonSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const before = await db.lesson.findUnique({ where: { id: lessonId }, select: { isPublished: true } });
  if (!before) return { ok: false, error: "Lesson not found." };

  await db.lesson.update({
    where: { id: lessonId },
    data: {
      title: d.title,
      description: d.description || null,
      content: d.content || null,
      videoUrl: d.videoUrl || null,
      duration: d.duration || null,
      order: d.order,
      isPublished: d.isPublished,
    },
  });
  await logAction({ userId: session.userId, action: "Updated lesson", entity: "Lesson", entityId: lessonId, metadata: { courseId: located.courseId } });
  // Publish transition only — edits to an already-published lesson and
  // unpublishing never notify.
  if (!before.isPublished && d.isPublished) await notifyLessonPublished(lessonId, located.courseId);
  revalidateCourse(located.courseId);
  return { ok: true };
}

export async function deleteLesson(lessonId: string): Promise<Result> {
  const located = await courseIdOfLesson(lessonId);
  if (!located) return { ok: false, error: "Lesson not found." };
  const session = await requireContentManager(located.courseId);

  const progressCount = await db.lessonProgress.count({ where: { lessonId } });
  if (progressCount > 0) {
    return {
      ok: false,
      error: `Lesson cannot be deleted: ${progressCount} student progress record(s) exist for it. Unpublish it instead to hide it from students.`,
    };
  }

  await db.lesson.delete({ where: { id: lessonId } });
  await logAction({ userId: session.userId, action: "Deleted lesson", entity: "Lesson", entityId: lessonId, metadata: { courseId: located.courseId } });
  revalidateCourse(located.courseId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

const resourceSchema = z.object({
  title: z.string().min(2, "Title is required").max(200),
  fileUrl: z
    .string()
    .min(1, "File URL or storage key is required")
    .max(2000)
    .refine((v) => classifyResourceUrl(v) !== "invalid", "Enter a valid http(s) URL or a storage key"),
  fileType: z.string().max(50).optional(),
});

export async function createResource(lessonId: string, input: z.infer<typeof resourceSchema>): Promise<Result<{ id: string }>> {
  const located = await courseIdOfLesson(lessonId);
  if (!located) return { ok: false, error: "Lesson not found." };
  const session = await requireContentManager(located.courseId);
  const parsed = resourceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };

  const resource = await db.lessonResource.create({
    data: {
      lessonId,
      title: parsed.data.title,
      fileUrl: parsed.data.fileUrl.trim(),
      fileType: parsed.data.fileType || null,
    },
  });
  await logAction({ userId: session.userId, action: "Added lesson resource", entity: "LessonResource", entityId: resource.id, metadata: { courseId: located.courseId, lessonId } });
  revalidateCourse(located.courseId);
  return { ok: true, data: { id: resource.id } };
}

export async function deleteResource(resourceId: string): Promise<Result> {
  const resource = await db.lessonResource.findUnique({
    where: { id: resourceId },
    select: { id: true, lesson: { select: { module: { select: { courseId: true } } } } },
  });
  if (!resource) return { ok: false, error: "Resource not found." };
  const courseId = resource.lesson.module.courseId;
  const session = await requireContentManager(courseId);

  // Metadata row only — the underlying file/object is deliberately not
  // deleted here (storage objects may be shared or managed elsewhere).
  await db.lessonResource.delete({ where: { id: resourceId } });
  await logAction({ userId: session.userId, action: "Removed lesson resource", entity: "LessonResource", entityId: resourceId, metadata: { courseId } });
  revalidateCourse(courseId);
  return { ok: true };
}
