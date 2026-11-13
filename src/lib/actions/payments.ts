"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { logAction } from "@/lib/audit";
import { notifyStudent } from "@/lib/notifications";
import { recomputeFeeStatus } from "@/lib/actions/fees";

const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "ONLINE", "OTHER"] as const;

const recordPaymentSchema = z.object({
  feeId: z.string().min(1),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  paidAt: z.string().min(1, "Payment date is required"),
  method: z.enum(PAYMENT_METHODS, { errorMap: () => ({ message: "Select a valid payment method" }) }),
  reference: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
});

export type PaymentResult = { ok: true; paymentId: string } | { ok: false; error: string };

/**
 * Section: record a payment against a fee. Inserts the Payment row and
 * recomputes the parent Fee's amountPaid/remainingBalance/status in one
 * transaction, so the two never drift out of sync.
 */
export async function recordPayment(
  input: z.infer<typeof recordPaymentSchema>
): Promise<PaymentResult> {
  const session = await requirePermission("payment.manage");

  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const paidAt = new Date(d.paidAt);
  if (paidAt.getTime() > Date.now()) {
    return { ok: false, error: "Payment date cannot be in the future." };
  }

  const fee = await db.fee.findUnique({ where: { id: d.feeId } });
  if (!fee) return { ok: false, error: "Fee not found." };
  if (fee.status === "WAIVED") return { ok: false, error: "This fee has been waived — no payment needed." };
  if (d.amount > fee.remainingBalance) {
    return { ok: false, error: `Amount cannot exceed the remaining balance of ${fee.remainingBalance}.` };
  }

  try {
    const payment = await db.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          feeId: d.feeId,
          studentId: fee.studentId,
          amount: d.amount,
          paymentDate: paidAt,
          paymentMethod: d.method,
          transactionReference: d.reference || null,
          notes: d.notes || null,
          recordedBy: session.userId,
        },
      });
      await recomputeFeeStatus(tx, d.feeId);
      return created;
    });

    await logAction({
      userId: session.userId,
      action: "Recorded payment",
      entity: "Payment",
      entityId: payment.id,
      metadata: { feeId: d.feeId, amount: d.amount, method: d.method },
    });

    revalidatePath("/admin/payments");
    revalidatePath("/admin/fees");
    revalidatePath(`/admin/fees/${d.feeId}`);
    await notifyStudent(fee.studentId, {
      type: "FEE",
      title: "Payment recorded",
      message: "A payment has been recorded on your account. Open Fees to see your updated statement.",
      linkUrl: "/student/fees",
      dedupeKey: `payment:${payment.id}`,
    });

    return { ok: true, paymentId: payment.id };
  } catch {
    return { ok: false, error: "Failed to record payment. Please try again." };
  }
}

const voidPaymentSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(10, "Reason must be at least 10 characters").max(500),
});

/**
 * Void a payment. Never hard-deletes — sets voidedAt/voidedBy/voidReason and
 * recomputes the parent fee so the voided amount no longer counts toward it.
 */
export async function voidPayment(
  input: z.infer<typeof voidPaymentSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requirePermission("payment.manage");

  const parsed = voidPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const existing = await db.payment.findUnique({ where: { id: d.id } });
  if (!existing) return { ok: false, error: "Payment not found." };
  if (existing.voidedAt) return { ok: false, error: "This payment is already voided." };

  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: d.id },
      data: { voidedAt: new Date(), voidedBy: session.userId, voidReason: d.reason },
    });
    await recomputeFeeStatus(tx, existing.feeId);
  });

  await logAction({
    userId: session.userId,
    action: "Voided payment",
    entity: "Payment",
    entityId: d.id,
    metadata: { feeId: existing.feeId, amount: existing.amount, reason: d.reason },
  });

  const voidedFee = await db.fee.findUnique({ where: { id: existing.feeId }, select: { studentId: true } });
  if (voidedFee) {
    await notifyStudent(voidedFee.studentId, {
      type: "FEE",
      title: "Payment update",
      message: "A payment record on your account was updated. Open Fees to see your current statement.",
      linkUrl: "/student/fees",
      dedupeKey: `payment-voided:${d.id}`,
    });
  }

  revalidatePath("/admin/payments");
  revalidatePath("/admin/fees");
  revalidatePath(`/admin/fees/${existing.feeId}`);
  return { ok: true };
}
