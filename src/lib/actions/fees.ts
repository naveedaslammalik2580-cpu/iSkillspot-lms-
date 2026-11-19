"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { logAction } from "@/lib/audit";
import { notifyStudent } from "@/lib/notifications";
import { computeStatus } from "@/lib/data/fees";

export type FeeResult = { ok: true; feeId: string } | { ok: false; error: string };

const createFeeSchema = z.object({
  studentId: z.string().min(1, "Select a student"),
  courseId: z.string().min(1, "Select a course"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  discount: z.coerce.number().min(0).optional(),
  dueDate: z.string().optional(),
  description: z.string().max(500).optional(),
});

/** Section: create a Fee row. `amount` is what the student owes (finalFee); totalFee = amount + discount. */
export async function createFee(
  input: z.infer<typeof createFeeSchema>
): Promise<FeeResult> {
  const session = await requirePermission("fee.manage");

  const parsed = createFeeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const student = await db.student.findUnique({ where: { id: d.studentId } });
  if (!student) return { ok: false, error: "Student not found." };
  const course = await db.course.findUnique({ where: { id: d.courseId } });
  if (!course) return { ok: false, error: "Course not found." };

  const discount = d.discount ?? 0;
  const finalFee = d.amount;
  const totalFee = d.amount + discount;
  const dueDate = d.dueDate ? new Date(d.dueDate) : null;

  try {
    const fee = await db.fee.create({
      data: {
        studentId: d.studentId,
        courseId: d.courseId,
        totalFee,
        discount,
        finalFee,
        amountPaid: 0,
        remainingBalance: finalFee,
        dueDate,
        description: d.description || null,
        status: computeStatus(0, finalFee, dueDate),
      },
    });

    await logAction({
      userId: session.userId,
      action: "Created fee",
      entity: "Fee",
      entityId: fee.id,
      metadata: { studentId: d.studentId, courseId: d.courseId, finalFee },
    });

    await notifyStudent(fee.studentId, {
      type: "FEE",
      title: "New fee assigned",
      message: "A new fee has been added to your account. Open Fees to see the details.",
      linkUrl: "/student/fees",
      dedupeKey: `fee-created:${fee.id}`,
    });

    revalidatePath("/admin/fees");
    return { ok: true, feeId: fee.id };
  } catch {
    return { ok: false, error: "Failed to create fee. Please try again." };
  }
}

const updateFeeSchema = z.object({
  id: z.string().min(1),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  discount: z.coerce.number().min(0).optional(),
  dueDate: z.string().optional(),
  description: z.string().max(500).optional(),
});

/** Edit a fee. Amount is locked once any payment has been recorded against it. */
export async function updateFee(
  input: z.infer<typeof updateFeeSchema>
): Promise<FeeResult> {
  const session = await requirePermission("fee.manage");

  const parsed = updateFeeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const existing = await db.fee.findUnique({ where: { id: d.id } });
  if (!existing) return { ok: false, error: "Fee not found." };

  const discount = d.discount ?? 0;
  const finalFee = d.amount;
  const totalFee = d.amount + discount;
  const dueDate = d.dueDate ? new Date(d.dueDate) : null;
  const amountChanged = existing.finalFee !== finalFee || existing.discount !== discount;

  if (amountChanged && existing.amountPaid > 0) {
    return {
      ok: false,
      error: "Cannot edit amount after payments recorded. Waive and reissue instead.",
    };
  }

  const changes: Record<string, { old: unknown; new: unknown }> = {};
  if (existing.finalFee !== finalFee) changes.amount = { old: existing.finalFee, new: finalFee };
  if ((existing.dueDate?.toISOString() ?? null) !== (dueDate?.toISOString() ?? null))
    changes.dueDate = { old: existing.dueDate, new: dueDate };

  await db.fee.update({
    where: { id: d.id },
    data: {
      totalFee,
      discount,
      finalFee,
      remainingBalance: finalFee - existing.amountPaid,
      dueDate,
      description: d.description || null,
      status: computeStatus(existing.amountPaid, finalFee, dueDate),
    },
  });

  if (Object.keys(changes).length > 0) {
    await logAction({
      userId: session.userId,
      action: "Updated fee",
      entity: "Fee",
      entityId: d.id,
      metadata: { changes },
    });

    const updated = await db.fee.findUnique({ where: { id: d.id }, select: { studentId: true, updatedAt: true } });
    if (updated) {
      await notifyStudent(updated.studentId, {
        type: "FEE",
        title: "Fee updated",
        message: "One of your fees has been updated. Open Fees to see the details.",
        linkUrl: "/student/fees",
        dedupeKey: `fee-updated:${d.id}:${updated.updatedAt.toISOString()}`,
      });
    }
  }

  revalidatePath("/admin/fees");
  revalidatePath(`/admin/fees/${d.id}`);
  return { ok: true, feeId: d.id };
}

const waiveFeeSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(10, "Reason must be at least 10 characters").max(500),
});

/** Waive a fee — sets status to WAIVED. Does not touch recorded payments. */
export async function waiveFee(
  input: z.infer<typeof waiveFeeSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requirePermission("fee.manage");

  const parsed = waiveFeeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const existing = await db.fee.findUnique({ where: { id: d.id } });
  if (!existing) return { ok: false, error: "Fee not found." };
  if (existing.status === "PAID") return { ok: false, error: "This fee is already fully paid." };

  await db.fee.update({
    where: { id: d.id },
    data: { status: "WAIVED", remainingBalance: 0 },
  });

  await logAction({
    userId: session.userId,
    action: "Waived fee",
    entity: "Fee",
    entityId: d.id,
    metadata: { reason: d.reason },
  });

  revalidatePath("/admin/fees");
  revalidatePath(`/admin/fees/${d.id}`);
  return { ok: true };
}

/**
 * FeeStatus has no CANCELLED value, so "cancel" follows the same pattern as
 * deleteBatch/deleteCourse/deleteAssignment: reject if dependents (here,
 * payments) exist, otherwise hard-delete a record with no real-world footprint.
 */
export async function deleteFee(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requirePermission("fee.manage");

  const existing = await db.fee.findUnique({
    where: { id },
    include: { _count: { select: { payments: true } } },
  });
  if (!existing) return { ok: false, error: "Fee not found." };

  if (existing._count.payments > 0) {
    return { ok: false, error: "Cannot delete a fee with payments recorded. Waive it instead." };
  }

  await db.fee.delete({ where: { id } });

  await logAction({
    userId: session.userId,
    action: "Deleted fee",
    entity: "Fee",
    entityId: id,
    metadata: { studentId: existing.studentId, courseId: existing.courseId },
  });

  revalidatePath("/admin/fees");
  return { ok: true };
}
