import { db } from "@/lib/db";
import { pct } from "@/lib/utils";

export async function getStudentDashboard(studentId: string) {
  const student = await db.student.findUnique({
    where: { id: studentId },
    include: {
      enrollments: { include: { course: true, batch: true } },
      attendance: true,
      submissions: { where: { status: "PENDING" }, include: { assignment: true } },
      grades: { orderBy: { createdAt: "desc" }, take: 5, include: { course: true } },
    },
  });
  if (!student) return null;

  const attTotal = student.attendance.length;
  const attPresent = student.attendance.filter(
    (a) => a.status === "PRESENT" || a.status === "LATE"
  ).length;

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
