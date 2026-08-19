import { db } from "@/lib/db";
import type { AttendanceStatus } from "@prisma/client";
import { pct } from "@/lib/utils";

export interface StudentOption {
  id: string;
  studentId: string;
  fullName: string;
}

/** All students, for the admin report pickers. */
export async function getAllStudentsForPicker(): Promise<StudentOption[]> {
  const students = await db.student.findMany({
    select: { id: true, studentId: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  return students;
}

/** Only students enrolled in one of this teacher's batches. */
export async function getStudentsForTeacher(teacherId: string): Promise<StudentOption[]> {
  const enrollments = await db.enrollment.findMany({
    where: { batch: { teacherId } },
    select: { student: { select: { id: true, studentId: true, fullName: true } } },
    distinct: ["studentId"],
  });
  return enrollments
    .map((e) => e.student)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export interface SheetRow {
  studentId: string;
  studentIdCode: string;
  fullName: string;
  cells: (AttendanceStatus | null)[];
  pctPresent: number;
}

export interface BatchAttendanceSheet {
  batch: { id: string; name: string; courseTitle: string };
  dates: string[]; // "YYYY-MM-DD", one per day of the month (up to today if current month)
  rows: SheetRow[];
  dailyPresent: number[]; // count of PRESENT+LATE per date, same index as dates
  rosterSize: number;
}

/**
 * Report 1: students (rows) x dates (columns) for one calendar month.
 * `month` is 1-12. Dates beyond today are excluded (nothing to show yet).
 */
export async function getBatchAttendanceSheet(
  batchId: string,
  year: number,
  month: number
): Promise<BatchAttendanceSheet | null> {
  const batch = await db.batch.findUnique({
    where: { id: batchId },
    include: { course: { select: { title: true } } },
  });
  if (!batch) return null;

  const monthStart = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    if (d > today) break;
    dates.push(d.toISOString().slice(0, 10));
  }
  const monthEnd = new Date(year, month - 1, daysInMonth);

  const enrollments = await db.enrollment.findMany({
    where: { batchId, status: "ACTIVE" },
    include: { student: { select: { id: true, studentId: true, fullName: true } } },
    orderBy: { student: { fullName: "asc" } },
  });

  const records = await db.attendance.findMany({
    where: { batchId, date: { gte: monthStart, lte: monthEnd } },
  });

  // studentId -> "YYYY-MM-DD" -> status
  const byStudent = new Map<string, Map<string, AttendanceStatus>>();
  for (const r of records) {
    const key = r.date.toISOString().slice(0, 10);
    if (!byStudent.has(r.studentId)) byStudent.set(r.studentId, new Map());
    byStudent.get(r.studentId)!.set(key, r.status);
  }

  const rows: SheetRow[] = enrollments.map((e) => {
    const marks = byStudent.get(e.student.id) ?? new Map();
    const cells = dates.map((d) => marks.get(d) ?? null);
    const marked = cells.filter((c) => c !== null) as AttendanceStatus[];
    const present = marked.filter((s) => s === "PRESENT" || s === "LATE").length;
    return {
      studentId: e.student.id,
      studentIdCode: e.student.studentId,
      fullName: e.student.fullName,
      cells,
      pctPresent: pct(present, marked.length),
    };
  });

  const dailyPresent = dates.map((d) =>
    rows.reduce((n, r) => {
      const status = byStudent.get(r.studentId)?.get(d);
      return n + (status === "PRESENT" || status === "LATE" ? 1 : 0);
    }, 0)
  );

  return {
    batch: { id: batch.id, name: batch.name, courseTitle: batch.course.title },
    dates,
    rows,
    dailyPresent,
    rosterSize: rows.length,
  };
}

export interface StudentAttendanceSummary {
  student: { id: string; studentId: string; fullName: string };
  records: {
    id: string;
    date: string;
    status: AttendanceStatus;
    batchName: string;
    courseTitle: string;
  }[];
  totals: {
    present: number;
    absent: number;
    late: number;
    excused: number;
    total: number;
    pctPresent: number;
  };
}

/** Report 2: one student's attendance totals + record list across a date range. */
export async function getStudentAttendanceSummary(
  studentId: string,
  from: string,
  to: string
): Promise<StudentAttendanceSummary | null> {
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { id: true, studentId: true, fullName: true },
  });
  if (!student) return null;

  const fromDate = new Date(from);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = new Date(to);
  toDate.setHours(0, 0, 0, 0);

  const attendance = await db.attendance.findMany({
    where: { studentId, date: { gte: fromDate, lte: toDate } },
    include: { batch: { include: { course: { select: { title: true } } } } },
    orderBy: { date: "desc" },
  });

  const records = attendance.map((a) => ({
    id: a.id,
    date: a.date.toISOString().slice(0, 10),
    status: a.status,
    batchName: a.batch.name,
    courseTitle: a.batch.course.title,
  }));

  const present = records.filter((r) => r.status === "PRESENT").length;
  const absent = records.filter((r) => r.status === "ABSENT").length;
  const late = records.filter((r) => r.status === "LATE").length;
  const excused = records.filter((r) => r.status === "EXCUSED").length;
  const total = records.length;

  return {
    student,
    records,
    totals: {
      present,
      absent,
      late,
      excused,
      total,
      pctPresent: pct(present + late, total),
    },
  };
}
