"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { logAction } from "@/lib/audit";

// Schema note (see Section 0): Course has no admin-entered "code" (only a
// unique "slug"), no "name" (only "title"), no numeric duration (only a
// free-text "duration" string), and status is PublishStatus
// (DRAFT/PUBLISHED/ARCHIVED), not ACTIVE/INACTIVE. No fee field exists.
// Reusing the existing fields under the module's field names rather than
// changing the schema (confirmed with the user).

const CODE_REGEX = /^[A-Z0-9-]+$/;

const createCourseSchema = z.object({
  code: z.string().min(2).max(20).regex(CODE_REGEX, "Code must be uppercase letters, numbers, and hyphens only"),
  name: z.string().min(2, "Name is required").max(200),
  description: z.string().max(5000).optional(),
  duration: z.string().max(100).optional(),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
});

export type CourseResult = { ok: true; courseId: string } | { ok: false; error: string };

export async function createCourse(
  input: z.infer<typeof createCourseSchema>
): Promise<CourseResult> {
  const session = await requirePermission("course.manage");

  const parsed = createCourseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  try {
    const course = await db.course.create({
      data: {
        title: d.name,
        slug: d.code,
        description: d.description || null,
        duration: d.duration || null,
        level: d.level ?? "BEGINNER",
        status: d.status,
      },
    });

    await logAction({
      userId: session.userId,
      action: "Created course",
      entity: "Course",
      entityId: course.id,
      metadata: { name: d.name, code: d.code },
    });

    revalidatePath("/admin/courses");
    return { ok: true, courseId: course.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "A course with this code already exists." };
    }
    return { ok: false, error: "Failed to create course. Please try again." };
  }
}

const updateCourseSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(2).max(20).regex(CODE_REGEX, "Code must be uppercase letters, numbers, and hyphens only"),
  name: z.string().min(2, "Name is required").max(200),
  description: z.string().max(5000).optional(),
  duration: z.string().max(100).optional(),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
});

export async function updateCourse(
  input: z.infer<typeof updateCourseSchema>
): Promise<CourseResult> {
  const session = await requirePermission("course.manage");

  const parsed = updateCourseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const existing = await db.course.findUnique({ where: { id: d.id } });
  if (!existing) return { ok: false, error: "Course not found." };

  const nextDescription = d.description || null;
  const nextDuration = d.duration || null;

  const changes: Record<string, { old: unknown; new: unknown }> = {};
  if (existing.title !== d.name) changes.name = { old: existing.title, new: d.name };
  if (existing.slug !== d.code) changes.code = { old: existing.slug, new: d.code };
  if (existing.description !== nextDescription)
    changes.description = { old: existing.description, new: nextDescription };
  if (existing.duration !== nextDuration)
    changes.duration = { old: existing.duration, new: nextDuration };
  if (existing.level !== d.level) changes.level = { old: existing.level, new: d.level };
  if (existing.status !== d.status) changes.status = { old: existing.status, new: d.status };

  try {
    await db.course.update({
      where: { id: d.id },
      data: {
        title: d.name,
        slug: d.code,
        description: nextDescription,
        duration: nextDuration,
        level: d.level,
        status: d.status,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "A course with this code already exists." };
    }
    return { ok: false, error: "Failed to update course. Please try again." };
  }

  if (Object.keys(changes).length > 0) {
    await logAction({
      userId: session.userId,
      action: "Updated course",
      entity: "Course",
      entityId: d.id,
      metadata: { changes },
    });
  }

  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${d.id}`);
  return { ok: true, courseId: d.id };
}

export async function deleteCourse(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requirePermission("course.manage");

  const existing = await db.course.findUnique({
    where: { id },
    include: { _count: { select: { batches: true } } },
  });
  if (!existing) return { ok: false, error: "Course not found." };

  if (existing._count.batches > 0) {
    return { ok: false, error: "Cannot delete a course that has batches." };
  }

  await db.course.delete({ where: { id } });

  await logAction({
    userId: session.userId,
    action: "Deleted course",
    entity: "Course",
    entityId: id,
    metadata: { name: existing.title },
  });

  revalidatePath("/admin/courses");
  return { ok: true };
}
