import { db } from "@/lib/db";
import { pct } from "@/lib/utils";

export async function getStudentDashboard(studentId: string) {
  // Present/total attendance counts computed by Postgres (one groupBy)
  // instead of loading every attendance row just to reduce it to a
  // percentage. Independent of the student fetch below, so run together.
  const [student, attendanceCounts] = await Promise.all([
    db.student.findUnique({
      where: { id: studentId },
      include: {
        enrollments: { include: { course: true, batch: true } },
        submissions: { where: { status: "PENDING" }, include: { assignment: true } },
        grades: { orderBy: { createdAt: "desc" }, take: 5, include: { course: true } },
      },
    }),
    db.attendance.groupBy({
      by: ["status"],
      where: { studentId },
      _count: { _all: true },
    }),
  ]);
  if (!student) return null;

  const attTotal = attendanceCounts.reduce((sum, r) => sum + r._count._all, 0);
  const attPresent = attendanceCounts
    .filter((r) => r.status === "PRESENT" || r.status === "LATE")
    .reduce((sum, r) => sum + r._count._all, 0);

  const overallProgress = student.enrollments.length
    ? Math.round(
        student.enrollments.reduce((s, e) => s + e.progress, 0) / student.enrollments.length
      )
    : 0;

  const announcements = await db.announcement.findMany({
    where: {
      OR: [
        { targetRole: "STUDENT" },
        { targetBatchId: { in: student.enrollments.map((e) => e.batchId) } },
        { targetCourseId: { in: student.enrollments.map((e) => e.courseId) } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return {
    student,
    currentCourse: student.enrollments[0]?.course.title ?? "—",
    overallProgress,
    attendancePct: pct(attPresent, attTotal),
    pendingAssignments: student.submissions.length,
    recentGrades: student.grades,
    announcements,
  };
}

/** Full attendance history for the logged-in student's own record. */
export async function getStudentAttendance(studentId: string) {
  return db.attendance.findMany({
    where: { studentId },
    include: { batch: { include: { course: { select: { title: true } } } } },
    orderBy: { date: "desc" },
  });
}
