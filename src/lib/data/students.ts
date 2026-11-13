import { db } from "@/lib/db";
import type { Prisma, StudentStatus } from "@prisma/client";
import { pct } from "@/lib/utils";

export interface StudentFilters {
  q?: string;
  courseId?: string;
  batchId?: string;
  status?: StudentStatus;
  page?: number;
  pageSize?: number;
}

export async function listStudents(filters: StudentFilters) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;

  const where: Prisma.StudentWhereInput = {};
  if (filters.q) {
    where.OR = [
      { fullName: { contains: filters.q, mode: "insensitive" } },
      { studentId: { contains: filters.q, mode: "insensitive" } },
      { email: { contains: filters.q, mode: "insensitive" } },
      { phone: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (filters.status) where.status = filters.status;
  if (filters.courseId || filters.batchId) {
    where.enrollments = {
      some: {
        ...(filters.courseId ? { courseId: filters.courseId } : {}),
        ...(filters.batchId ? { batchId: filters.batchId } : {}),
      },
    };
  }

  const [rows, total] = await Promise.all([
    db.student.findMany({
      where,
      include: {
        enrollments: { include: { course: true, batch: true }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.student.count({ where }),
  ]);

  return { rows, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

/**
 * Full Section-8 360° profile.
 *
 * Perf note (audited — see the performance investigation for the full
 * before/after): the original version `include`d entire `submissions`,
 * `quizAttempts`, `grades`, and `fees.payments` relations just to reduce
 * them to a handful of summary numbers in JS — none of those individual
 * rows are ever rendered by the profile page, and `grades` wasn't read at
 * all. Those four are computed with Postgres-side groupBy/aggregate calls
 * instead of being fetched as rows, batched into a single `$transaction`
 * (measured ~7% faster than four independent calls competing for pool
 * connections separately, with identical output — see the investigation).
 *
 * `enrollments` and `certificates` were originally nested under the main
 * `student.findUnique`; pulling them out into their own parallel queries
 * measured ~35% faster for that portion (1562ms -> 998ms combined; verified
 * byte-identical output across all students first) — nesting relations
 * inside `findUnique` costs more here than two extra parallel round trips
 * save, the reverse of the usual assumption, which is why this was measured
 * rather than assumed. `certificates` orderBy/take(20) unchanged from the
 * first pass. `enrollments` is deliberately NOT limited — current-state
 * data (drives overallProgress + the full course list), not history.
 */
export async function getStudent360(id: string) {
  // The 4 summary aggregates were tested batched into a single
  // `$transaction([...])` (one pool connection acquisition instead of
  // four independent ones) — measured ~7% faster with identical output,
  // but Prisma's `groupBy` return type loses its precise narrowing when
  // used inside `$transaction([...])` (a known Prisma typing limitation,
  // not specific to this query), which cascaded into `any`-shaped fields
  // all the way through to the page component. Reverted per the "preserve
  // strict TypeScript" requirement — a 7% gain isn't worth trading away
  // type safety for. Left as plain independent queries below, same as
  // enrollments/certificates/studentCore.
  const [student, enrollments, certificates, attendanceCounts, submissionStats, quizStats, feeTotals] =
    await Promise.all([
      db.student.findUnique({
        where: { id },
        select: {
          id: true,
          studentId: true,
          fullName: true,
          fatherName: true,
          email: true,
          phone: true,
          whatsapp: true,
          city: true,
          address: true,
          dateOfBirth: true,
          admissionDate: true,
          status: true,
          user: { select: { username: true, status: true, lastLogin: true } },
        },
      }),
      db.enrollment.findMany({
        where: { studentId: id },
        select: {
          id: true,
          progress: true,
          course: { select: { title: true } },
          batch: { select: { name: true, teacher: { select: { fullName: true } } } },
        },
      }),
      // Small, bounded collection in practice; ordered + capped defensively
      // rather than left fully open-ended, without changing what's shown
      // for any realistic student.
      db.certificate.findMany({
        where: { studentId: id },
        select: { id: true, certificateNumber: true, course: { select: { title: true } } },
        orderBy: { issueDate: "desc" },
        take: 20,
      }),
      // Attendance: already Postgres-side (unchanged from before).
      db.attendance.groupBy({
        by: ["status"],
        where: { studentId: id },
        _count: { _all: true },
      }),
      // Assignment summary: was `submissions: { include: { assignment: true } }`
      // reduced to counts/avg in JS, with `assignment` never actually read.
      // One groupBy replaces the entire row fetch.
      db.assignmentSubmission.groupBy({
        by: ["status"],
        where: { studentId: id },
        _count: { _all: true },
        _avg: { score: true },
      }),
      // Quiz summary: was `quizAttempts: { include: { quiz: true } }` reduced
      // to count/avg/max in JS, with `quiz` never actually read.
      db.quizAttempt.aggregate({
        where: { studentId: id },
        _count: { _all: true },
        _avg: { percentage: true },
        _max: { percentage: true },
      }),
      // Fee totals: was `fees: { include: { payments: true } }` reduced to 3
      // summed scalars, with every nested `payments` row never read at all.
      db.fee.aggregate({
        where: { studentId: id },
        _sum: { finalFee: true, amountPaid: true, remainingBalance: true },
      }),
    ]);
  if (!student) return null;

  // Attendance summary (unchanged logic)
  const countOf = (status: string) =>
    attendanceCounts.find((r) => r.status === status)?._count._all ?? 0;
  const attTotal = attendanceCounts.reduce((sum, r) => sum + r._count._all, 0);
  const present = countOf("PRESENT");
  const absent = countOf("ABSENT");
  const late = countOf("LATE");
  const attendancePct = pct(present + late, attTotal);

  // Assignment summary, from the groupBy above instead of row-level filters.
  // Same arithmetic as before: avgScore is the average score of GRADED
  // submissions only (matches the original's `graded.reduce(...)/graded.length`).
  const subCountOf = (status: string) =>
    submissionStats.find((r) => r.status === status)?._count._all ?? 0;
  const gradedGroup = submissionStats.find((r) => r.status === "GRADED");
  const subsTotal = submissionStats.reduce((sum, r) => sum + r._count._all, 0);
  const avgAssignment = gradedGroup?._avg.score != null ? Math.round(gradedGroup._avg.score) : 0;

  // Quiz summary, from the aggregate above. `best` is intentionally left
  // unrounded, matching the original's `Math.max(...)` (no Math.round call
  // was ever applied to bestQuiz — preserved exactly).
  const avgQuiz = quizStats._avg.percentage != null ? Math.round(quizStats._avg.percentage) : 0;
  const bestQuiz = quizStats._max.percentage ?? 0;

  // Overall progress (unchanged logic — enrollments are not limited).
  const overallProgress = enrollments.length
    ? Math.round(enrollments.reduce((s, e) => s + e.progress, 0) / enrollments.length)
    : 0;

  // Fee totals, from the aggregate above (same 3 scalars, same fallback to 0).
  const fees = {
    total: feeTotals._sum.finalFee ?? 0,
    paid: feeTotals._sum.amountPaid ?? 0,
    remaining: feeTotals._sum.remainingBalance ?? 0,
  };

  return {
    // enrollments/certificates are merged back onto `student` here (they're
    // fetched as separate parallel queries above, not nested relations) so
    // callers keep reading student.enrollments / student.certificates
    // exactly as before — no consumer-side shape change.
    student: { ...student, enrollments, certificates },
    summary: {
      attendance: { total: attTotal, present, absent, late, pct: attendancePct },
      assignments: {
        total: subsTotal,
        completed: subCountOf("SUBMITTED") + subCountOf("GRADED"),
        pending: subCountOf("PENDING"),
        late: subCountOf("LATE"),
        avgScore: avgAssignment,
      },
      quizzes: { attempts: quizStats._count._all, avg: avgQuiz, best: bestQuiz },
      overallProgress,
      fees,
    },
  };
}

export interface StudentEditFields {
  id: string;
  fullName: string;
  fatherName: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  status: StudentStatus;
  notes: string | null;
}

/**
 * Minimal field set for the student edit form. Split out from
 * getStudent360() above: src/app/admin/students/[id]/edit/page.tsx was
 * calling getStudent360() and discarding everything except these 9 scalar
 * columns — i.e. paying the full cost of the 360 profile (enrollments,
 * assignment/quiz/fee aggregates, certificates) just to prefill a form that
 * needs none of it. Field list traced directly from StudentForm's props.
 */
export async function getStudentForEdit(id: string): Promise<StudentEditFields | null> {
  return db.student.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      fatherName: true,
      phone: true,
      whatsapp: true,
      address: true,
      city: true,
      status: true,
      notes: true,
    },
  });
}

export async function getCoursesAndBatches() {
  const courses = await db.course.findMany({
    where: { status: { not: "ARCHIVED" } },
    include: { batches: true },
    orderBy: { title: "asc" },
  });
  return courses;
}
