"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, assertTeacherOwnsBatch, AuthError } from "@/lib/auth/guards";
import { logAction } from "@/lib/audit";

const entrySchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
  remarks: z.string().optional(),
});

const markAttendanceSchema = z.object({
  batchId: z.string().min(1),
  date: z.string().min(1),
  entries: z.array(entrySchema).min(1, "No students to mark."),
});

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
export type MarkAttendanceResult = { ok: true } | { ok: false; error: string };

/**
 * Section 4 workflow: mark/update attendance for a batch's enrolled roster
 * on a given day. Teachers are scoped to their own batches; admins may mark
 * any batch. Every create/update is audited with old + new status.
 */
export async function markAttendance(
  input: MarkAttendanceInput
): Promise<MarkAttendanceResult> {
  const session = await requirePermission("attendance.manage");

  const parsed = markAttendanceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const batch = await db.batch.findUnique({ where: { id: d.batchId } });
  if (!batch) return { ok: false, error: "Batch not found." };

  if (session.role === "TEACHER") {
    const teacher = await db.teacher.findUnique({ where: { userId: session.userId } });
    if (!teacher) return { ok: false, error: "Teacher profile not found." };
    try {
      await assertTeacherOwnsBatch(teacher.id, d.batchId);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof AuthError ? e.message : "Not authorized for this batch.",
      };
    }
  }

  const day = new Date(d.date);
  day.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (day > today) {
    return { ok: false, error: "Cannot mark attendance for a future date." };
  }

  // Only mark students actually (actively) enrolled in this batch.
  const enrollments = await db.enrollment.findMany({
    where: { batchId: d.batchId, status: "ACTIVE" },
    select: { studentId: true },
  });
  const validStudentIds = new Set(enrollments.map((e) => e.studentId));
  const entries = d.entries.filter((e) => validStudentIds.has(e.studentId));
  if (entries.length === 0) {
    return { ok: false, error: "No valid students to mark for this batch." };
  }

  const existing = await db.attendance.findMany({
    where: { batchId: d.batchId, date: day, studentId: { in: entries.map((e) => e.studentId) } },
  });
  const existingByStudent = new Map(existing.map((a) => [a.studentId, a]));

  try {
    await db.$transaction(
      entries.map((e) =>
        db.attendance.upsert({
          where: {
            studentId_batchId_date: { studentId: e.studentId, batchId: d.batchId, date: day },
          },
          update: { status: e.status, remarks: e.remarks || null, markedBy: session.userId },
          create: {
            studentId: e.studentId,
            batchId: d.batchId,
            date: day,
            status: e.status,
            remarks: e.remarks || null,
            markedBy: session.userId,
          },
        })
      )
    );
  } catch {
    return { ok: false, error: "Failed to save attendance. Please try again." };
  }

  for (const e of entries) {
    const prev = existingByStudent.get(e.studentId);
    await logAction({
      userId: session.userId,
      action: prev ? "Updated attendance" : "Marked attendance",
      entity: "Attendance",
      entityId: e.studentId,
      metadata: {
        studentId: e.studentId,
        batchId: d.batchId,
        date: d.date,
        oldStatus: prev?.status ?? null,
        newStatus: e.status,
      },
    });
  }

  revalidatePath("/admin/attendance");
  revalidatePath("/teacher/attendance");
  revalidatePath("/student/attendance");
  return { ok: true };
}
