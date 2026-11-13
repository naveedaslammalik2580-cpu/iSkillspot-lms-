"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth/guards";
import { logAction } from "@/lib/audit";
import { notifyAnnouncementPublished } from "@/lib/notifications";

// "announcement.manage" isn't in the permission matrix (only sendAll/sendBatch,
// neither of which map cleanly to "can administer any announcement"), so this
// module gates on requireStaff() directly — ADMIN/SUPER_ADMIN only, same set
// requireStaff() already restricts to.

const AUDIENCES = ["ALL", "STUDENTS", "TEACHERS", "BATCH", "COURSE"] as const;

function resolveTargets(
  audience: (typeof AUDIENCES)[number],
  targetBatchId?: string,
  targetCourseId?: string
): { targetRole: Role | null; targetBatchId: string | null; targetCourseId: string | null } {
  switch (audience) {
    case "STUDENTS":
      return { targetRole: "STUDENT", targetBatchId: null, targetCourseId: null };
    case "TEACHERS":
      return { targetRole: "TEACHER", targetBatchId: null, targetCourseId: null };
    case "BATCH":
      return { targetRole: null, targetBatchId: targetBatchId!, targetCourseId: null };
    case "COURSE":
      return { targetRole: null, targetBatchId: null, targetCourseId: targetCourseId! };
    default:
      return { targetRole: null, targetBatchId: null, targetCourseId: null };
  }
}

const createAnnouncementSchema = z
  .object({
    title: z.string().min(3, "Title must be at least 3 characters").max(200),
    body: z.string().min(10, "Body must be at least 10 characters").max(10_000),
    audience: z.enum(AUDIENCES),
    targetBatchId: z.string().optional(),
    targetCourseId: z.string().optional(),
    publishNow: z.coerce.boolean().optional(),
  })
  .refine((d) => d.audience !== "BATCH" || !!d.targetBatchId, {
    message: "Select a batch",
    path: ["targetBatchId"],
  })
  .refine((d) => d.audience !== "COURSE" || !!d.targetCourseId, {
    message: "Select a course",
    path: ["targetCourseId"],
  });

export type AnnouncementResult = { ok: true; announcementId: string } | { ok: false; error: string };

export async function createAnnouncement(
  input: z.infer<typeof createAnnouncementSchema>
): Promise<AnnouncementResult> {
  const session = await requireStaff();

  const parsed = createAnnouncementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  if (d.audience === "BATCH") {
    const batch = await db.batch.findUnique({ where: { id: d.targetBatchId } });
    if (!batch) return { ok: false, error: "Batch not found." };
  }
  if (d.audience === "COURSE") {
    const course = await db.course.findUnique({ where: { id: d.targetCourseId } });
    if (!course) return { ok: false, error: "Course not found." };
  }

  const targets = resolveTargets(d.audience, d.targetBatchId, d.targetCourseId);
  const publishNow = d.publishNow ?? false;

  const announcement = await db.announcement.create({
    data: {
      title: d.title,
      content: d.body,
      audience: d.audience,
      ...targets,
      createdBy: session.userId,
      status: publishNow ? "PUBLISHED" : "DRAFT",
      publishedAt: publishNow ? new Date() : null,
    },
  });

  if (publishNow) {
    await notifyAnnouncementPublished(announcement);
  }

  await logAction({
    userId: session.userId,
    action: "Created announcement",
    entity: "Announcement",
    entityId: announcement.id,
    metadata: { title: d.title, audience: d.audience, published: publishNow },
  });

  revalidatePath("/admin/announcements");
  return { ok: true, announcementId: announcement.id };
}

const editDraftSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(3, "Title must be at least 3 characters").max(200),
    body: z.string().min(10, "Body must be at least 10 characters").max(10_000),
    audience: z.enum(AUDIENCES),
    targetBatchId: z.string().optional(),
    targetCourseId: z.string().optional(),
  })
  .refine((d) => d.audience !== "BATCH" || !!d.targetBatchId, {
    message: "Select a batch",
    path: ["targetBatchId"],
  })
  .refine((d) => d.audience !== "COURSE" || !!d.targetCourseId, {
    message: "Select a course",
    path: ["targetCourseId"],
  });

const editPublishedSchema = z.object({
  id: z.string().min(1),
  body: z.string().min(10, "Body must be at least 10 characters").max(10_000),
});

/**
 * DRAFT: title/body/audience/targets are all editable. PUBLISHED: only body
 * is — announcements are messages, not living docs, so title/audience/targets
 * freeze the moment they go out.
 */
export async function updateAnnouncement(
  input: Record<string, unknown>
): Promise<AnnouncementResult> {
  const session = await requireStaff();

  const id = String(input.id ?? "");
  const existing = await db.announcement.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Announcement not found." };

  if (existing.status === "PUBLISHED") {
    const parsed = editPublishedSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }
    const changed = existing.content !== parsed.data.body;
    await db.announcement.update({ where: { id }, data: { content: parsed.data.body } });
    if (changed) {
      await logAction({
        userId: session.userId,
        action: "Updated announcement",
        entity: "Announcement",
        entityId: id,
        metadata: { changes: { body: { old: existing.content, new: parsed.data.body } } },
      });
    }
  } else {
    const parsed = editDraftSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }
    const d = parsed.data;
    if (d.audience === "BATCH") {
      const batch = await db.batch.findUnique({ where: { id: d.targetBatchId } });
      if (!batch) return { ok: false, error: "Batch not found." };
    }
    if (d.audience === "COURSE") {
      const course = await db.course.findUnique({ where: { id: d.targetCourseId } });
      if (!course) return { ok: false, error: "Course not found." };
    }
    const targets = resolveTargets(d.audience, d.targetBatchId, d.targetCourseId);

    const changes: Record<string, { old: unknown; new: unknown }> = {};
    if (existing.title !== d.title) changes.title = { old: existing.title, new: d.title };
    if (existing.content !== d.body) changes.body = { old: existing.content, new: d.body };
    if (existing.audience !== d.audience) changes.audience = { old: existing.audience, new: d.audience };

    await db.announcement.update({
      where: { id },
      data: { title: d.title, content: d.body, audience: d.audience, ...targets },
    });
    if (Object.keys(changes).length > 0) {
      await logAction({
        userId: session.userId,
        action: "Updated announcement",
        entity: "Announcement",
        entityId: id,
        metadata: { changes },
      });
    }
  }

  revalidatePath("/admin/announcements");
  revalidatePath(`/admin/announcements/${id}`);
  return { ok: true, announcementId: id };
}

export async function publishAnnouncement(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireStaff();

  const existing = await db.announcement.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Announcement not found." };
  if (existing.status !== "DRAFT") return { ok: false, error: "Only draft announcements can be published." };

  await db.announcement.update({
    where: { id },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });

  await notifyAnnouncementPublished(existing);

  await logAction({
    userId: session.userId,
    action: "Published announcement",
    entity: "Announcement",
    entityId: id,
  });

  revalidatePath("/admin/announcements");
  revalidatePath(`/admin/announcements/${id}`);
  return { ok: true };
}

export async function archiveAnnouncement(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireStaff();

  const existing = await db.announcement.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Announcement not found." };
  if (existing.status !== "PUBLISHED") return { ok: false, error: "Only published announcements can be archived." };

  await db.announcement.update({ where: { id }, data: { status: "ARCHIVED" } });

  await logAction({
    userId: session.userId,
    action: "Archived announcement",
    entity: "Announcement",
    entityId: id,
  });

  revalidatePath("/admin/announcements");
  revalidatePath(`/admin/announcements/${id}`);
  return { ok: true };
}
