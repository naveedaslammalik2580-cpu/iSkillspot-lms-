import { db } from "@/lib/db";
import type { AttendanceStatus } from "@prisma/client";

export interface BatchOption {
  id: string;
  name: string;
  courseTitle: string;
}

/** All batches, for admin/super-admin (who may mark attendance for any batch). */
export async function getBatchesForAdmin(): Promise<BatchOption[]> {
  const batches = await db.batch.findMany({
    include: { course: { select: { title: true } } },
    orderBy: { name: "asc" },
  });
  return batches.map((b) => ({ id: b.id, name: b.name, courseTitle: b.course.title }));
}

/** Only the batches assigned to this teacher. */
export async function getBatchesForTeacher(teacherId: string): Promise<BatchOption[]> {
  const batches = await db.batch.findMany({
    where: { teacherId },
    include: { course: { select: { title: true } } },
    orderBy: { name: "asc" },
  });
  return batches.map((b) => ({ id: b.id, name: b.name, courseTitle: b.course.title }));
}

export interface RosterEntry {
  studentId: string;
  studentIdCode: string;
  fullName: string;
  status: AttendanceStatus | null;
  remarks: string | null;
}

/**
 * The enrolled (active) roster for a batch on a given day, with each
 * student's existing attendance status for that day, if any.
 */
export async function getRosterForBatch(
  batchId: string,
  date: string
): Promise<{ batch: BatchOption; roster: RosterEntry[] } | null> {
  const batch = await db.batch.findUnique({
    where: { id: batchId },
    include: { course: { select: { title: true } } },
  });
  if (!batch) return null;

  const day = new Date(date);
  day.setHours(0, 0, 0, 0);

  const enrollments = await db.enrollment.findMany({
    where: { batchId, status: "ACTIVE" },
    include: { student: { select: { id: true, studentId: true, fullName: true } } },
    orderBy: { student: { fullName: "asc" } },
  });

  const existing = await db.attendance.findMany({
    where: { batchId, date: day },
  });
  const existingByStudent = new Map(existing.map((a) => [a.studentId, a]));

  const roster: RosterEntry[] = enrollments.map((e) => {
    const att = existingByStudent.get(e.student.id);
    return {
      studentId: e.student.id,
      studentIdCode: e.student.studentId,
      fullName: e.student.fullName,
      status: att?.status ?? null,
      remarks: att?.remarks ?? null,
    };
  });

  return {
    batch: { id: batch.id, name: batch.name, courseTitle: batch.course.title },
    roster,
  };
}
