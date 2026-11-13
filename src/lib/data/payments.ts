import { db } from "@/lib/db";
import type { PaymentMethod, Prisma } from "@prisma/client";

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

export interface PaymentListFilters {
  from?: string;
  to?: string;
  method?: PaymentMethod;
  search?: string;
}

/**
 * Shared where-clause builder for the admin payments list and its total —
 * kept as one function so the two can never drift out of sync (the total
 * must reflect the same filtered set as the rows, just not the same page
 * of it).
 */
function buildPaymentsWhere(filters?: PaymentListFilters): Prisma.PaymentWhereInput {
  return {
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
  };
}

/**
 * Paginated payment listing, same shape as listStudents/listCourses/
 * listBatches/listTeachers/listFees — page/pageSize in,
 * { rows, total, page, pageSize, pages } out. For the daily reconciliation
 * list. Table is empty in current seed data, so this is verified by build/
 * type-check correctness rather than measured row-count performance.
 */
export async function listPayments(filters?: PaymentListFilters & { page?: number; pageSize?: number }): Promise<{
  rows: PaymentListRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}> {
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;
  const where = buildPaymentsWhere(filters);

  const [payments, total] = await Promise.all([
    db.payment.findMany({
      where,
      include: {
        student: { select: { fullName: true, studentId: true } },
        fee: { include: { course: { select: { title: true } } } },
      },
      orderBy: { paymentDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.payment.count({ where }),
  ]);

  return {
    rows: payments.map((p) => ({
      ...toRow(p),
      studentName: p.student.fullName,
      studentCode: p.student.studentId,
      courseName: p.fee.course.title,
    })),
    total,
    page,
    pageSize,
    pages: Math.ceil(total / pageSize),
  };
}

/**
 * Sum of active (non-voided) payment amounts matching the same filters as
 * listPayments — computed in Postgres, independent of pagination. Was
 * previously `payments.reduce((sum, p) => sum + (p.voidedAt ? 0 : p.amount), 0)`
 * over the full (unpaginated) row array; paginating the rows without this
 * would have silently truncated the displayed total to whatever fit on one
 * page. Same filtered set as listPayments, by construction (shared
 * buildPaymentsWhere), just with `voidedAt: null` added.
 */
export async function getPaymentsTotal(filters?: PaymentListFilters): Promise<number> {
  const where = { ...buildPaymentsWhere(filters), voidedAt: null };
  const result = await db.payment.aggregate({ where, _sum: { amount: true } });
  return result._sum.amount ?? 0;
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
