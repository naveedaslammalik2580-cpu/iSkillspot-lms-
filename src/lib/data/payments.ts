import { db } from "@/lib/db";
import type { PaymentMethod } from "@prisma/client";

export interface PaymentRow {
  id: string;
  feeId: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: PaymentMethod | null;
  transactionReference: string | null;
  notes: string | null;
  recordedBy: string | null;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason: string | null;
}

function toRow(p: {
  id: string;
  feeId: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: PaymentMethod | null;
  transactionReference: string | null;
  notes: string | null;
  recordedBy: string | null;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason: string | null;
}): PaymentRow {
  return {
    id: p.id,
    feeId: p.feeId,
    amount: p.amount,
    paymentDate: p.paymentDate,
    paymentMethod: p.paymentMethod,
    transactionReference: p.transactionReference,
    notes: p.notes,
    recordedBy: p.recordedBy,
    voidedAt: p.voidedAt,
    voidedBy: p.voidedBy,
    voidReason: p.voidReason,
  };
}

/** Active (non-voided) payments for a fee, for the fee detail page. */
export async function getPaymentsForFee(feeId: string): Promise<PaymentRow[]> {
  const payments = await db.payment.findMany({
    where: { feeId, voidedAt: null },
    orderBy: { paymentDate: "desc" },
  });
  return payments.map(toRow);
}

/** Voided payments for a fee, shown separately (struck-through) on the detail page. */
export async function getVoidedPaymentsForFee(feeId: string): Promise<PaymentRow[]> {
  const payments = await db.payment.findMany({
    where: { feeId, voidedAt: { not: null } },
    orderBy: { voidedAt: "desc" },
  });
  return payments.map(toRow);
}

export interface PaymentListRow extends PaymentRow {
  studentName: string;
  studentCode: string;
  courseName: string;
}

/** All payments across the institute, for the daily reconciliation list. */
export async function getAllPayments(filters?: {
  from?: string;
  to?: string;
  method?: PaymentMethod;
  search?: string;
}): Promise<PaymentListRow[]> {
  const payments = await db.payment.findMany({
    where: {
      paymentMethod: filters?.method,
      ...(filters?.from || filters?.to
        ? {
            paymentDate: {
              ...(filters?.from ? { gte: new Date(filters.from) } : {}),
              ...(filters?.to ? { lte: new Date(`${filters.to}T23:59:59`) } : {}),
            },
          }
        : {}),
      ...(filters?.search
        ? {
            student: {
              OR: [
                { fullName: { contains: filters.search, mode: "insensitive" as const } },
                { studentId: { contains: filters.search, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
    },
    include: {
      student: { select: { fullName: true, studentId: true } },
      fee: { include: { course: { select: { title: true } } } },
    },
    orderBy: { paymentDate: "desc" },
  });

  return payments.map((p) => ({
    ...toRow(p),
    studentName: p.student.fullName,
    studentCode: p.student.studentId,
    courseName: p.fee.course.title,
  }));
}

export interface PaymentDetail extends PaymentRow {
  studentName: string;
  courseName: string;
  feeDescription: string | null;
  recordedByName: string | null;
}

/**
 * Single payment, with student/course context — for the printable receipt.
 * `recordedBy` (like Assignment.createdBy elsewhere in the schema) is a raw
 * userId string with no Prisma relation, so the display name is resolved
 * with a second lookup rather than an `include`.
 */
export async function getPaymentById(id: string): Promise<PaymentDetail | null> {
  const payment = await db.payment.findUnique({
    where: { id },
    include: {
      student: { select: { fullName: true } },
      fee: { include: { course: { select: { title: true } } } },
    },
  });
  if (!payment) return null;

  const recordedByUser = payment.recordedBy
    ? await db.user.findUnique({ where: { id: payment.recordedBy }, select: { username: true } })
    : null;

  return {
    ...toRow(payment),
    studentName: payment.student.fullName,
    courseName: payment.fee.course.title,
    feeDescription: payment.fee.description,
    recordedByName: recordedByUser?.username ?? null,
  };
}
