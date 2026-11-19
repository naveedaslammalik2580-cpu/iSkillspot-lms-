"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { logAction } from "@/lib/audit";

// Schema note: Batch.capacity does not exist (confirmed with the user — no
// schema change). Batch.name is a required schema field the spec's input
// list omitted; added here since a batch can't be created without it.

const createBatchSchema = z.object({
  code: z.string().min(2).max(30, "Code must be 2-30 characters"),
  name: z.string().min(2, "Name is required").max(200),
  courseId: z.string().min(1, "Select a course"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(["UPCOMING", "ONGOING", "COMPLETED", "CANCELLED"]),
});

export type BatchResult = { ok: true; batchId: string } | { ok: false; error: string };

export async function createBatch(
  input: z.infer<typeof createBatchSchema>
): Promise<BatchResult> {
  const session = await requirePermission("batch.manage");

  const parsed = createBatchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const course = await db.course.findUnique({ where: { id: d.courseId } });
  if (!course) return { ok: false, error: "Course not found." };
  if (course.status === "ARCHIVED") {
    return { ok: false, error: "Cannot create a batch under an archived course." };
  }

  const startDate = d.startDate ? new Date(d.startDate) : null;
  const endDate = d.endDate ? new Date(d.endDate) : null;
  if (startDate && endDate && startDate >= endDate) {
    return { ok: false, error: "Start date must be before end date." };
  }

  try {
    const batch = await db.batch.create({
      data: {
        code: d.code,
        name: d.name,
        courseId: d.courseId,
        startDate,
        endDate,
        status: d.status,
      },
    });

    await logAction({
      userId: session.userId,
      action: "Created batch",
      entity: "Batch",
      entityId: batch.id,
      metadata: { code: d.code, name: d.name, courseId: d.courseId },
    });

    revalidatePath("/admin/batches");
    revalidatePath(`/admin/courses/${d.courseId}`);
    return { ok: true, batchId: batch.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "A batch with this code already exists." };
    }
    return { ok: false, error: "Failed to create batch. Please try again." };
  }
}

const updateBatchSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(2).max(30, "Code must be 2-30 characters"),
  name: z.string().min(2, "Name is required").max(200),
  courseId: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(["UPCOMING", "ONGOING", "COMPLETED", "CANCELLED"]),
});

export async function updateBatch(
  input: z.infer<typeof updateBatchSchema>
): Promise<BatchResult> {
  const session = await requirePermission("batch.manage");

  const parsed = updateBatchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const existing = await db.batch.findUnique({
    where: { id: d.id },
  });
  if (!existing) return { ok: false, error: "Batch not found." };

  if (d.courseId !== existing.courseId) {
    const activeCount = await db.enrollment.count({ where: { batchId: d.id, status: "ACTIVE" } });
    if (activeCount > 0) {
      return { ok: false, error: "Course cannot change once students are enrolled." };
    }
    const course = await db.course.findUnique({ where: { id: d.courseId } });
    if (!course) return { ok: false, error: "Course not found." };
  }

  const startDate = d.startDate ? new Date(d.startDate) : null;
  const endDate = d.endDate ? new Date(d.endDate) : null;
  if (startDate && endDate && startDate >= endDate) {
    return { ok: false, error: "Start date must be before end date." };
  }

  const changes: Record<string, { old: unknown; new: unknown }> = {};
  if (existing.code !== d.code) changes.code = { old: existing.code, new: d.code };
  if (existing.name !== d.name) changes.name = { old: existing.name, new: d.name };
  if (existing.courseId !== d.courseId) changes.courseId = { old: existing.courseId, new: d.courseId };
  if (existing.status !== d.status) changes.status = { old: existing.status, new: d.status };
  if ((existing.startDate?.toISOString() ?? null) !== (startDate?.toISOString() ?? null))
    changes.startDate = { old: existing.startDate, new: startDate };
  if ((existing.endDate?.toISOString() ?? null) !== (endDate?.toISOString() ?? null))
    changes.endDate = { old: existing.endDate, new: endDate };

  try {
    await db.batch.update({
      where: { id: d.id },
      data: {
        code: d.code,
        name: d.name,
        courseId: d.courseId,
        startDate,
        endDate,
        status: d.status,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "A batch with this code already exists." };
    }
    return { ok: false, error: "Failed to update batch. Please try again." };
  }

  if (Object.keys(changes).length > 0) {
    await logAction({
      userId: session.userId,
      action: "Updated batch",
      entity: "Batch",
      entityId: d.id,
      metadata: { changes },
    });
  }

  revalidatePath("/admin/batches");
  revalidatePath(`/admin/batches/${d.id}`);
  return { ok: true, batchId: d.id };
}

export async function deleteBatch(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requirePermission("batch.manage");

  const existing = await db.batch.findUnique({
    where: { id },
    include: { _count: { select: { enrollments: true, announcements: true } } },
  });
  if (!existing) return { ok: false, error: "Batch not found." };

  if (existing._count.enrollments > 0) {
    return {
      ok: false,
      error: "Cannot delete a batch that has enrollments. Set its status to CANCELLED instead.",
    };
  }
  // Announcements reference the batch directly and can outlive
  // enrollments — never silently cascade-delete them with the batch.
  if (existing._count.announcements > 0) {
    return {
      ok: false,
      error:
        "Cannot delete a batch that has announcement records. Set its status to CANCELLED instead.",
    };
  }

  await db.batch.delete({ where: { id } });

  await logAction({
    userId: session.userId,
    action: "Deleted batch",
    entity: "Batch",
    entityId: id,
    metadata: { code: existing.code, name: existing.name },
  });

  revalidatePath("/admin/batches");
  return { ok: true };
}
