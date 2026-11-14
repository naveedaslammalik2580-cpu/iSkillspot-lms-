import { db } from "@/lib/db";
import { pct } from "@/lib/utils";
import { getAnnouncementsForStudent } from "@/lib/data/announcements";

export async function getStudentDashboard(studentId: string) {
  const access = await db.enrollment.findMany({ where: { studentId, accessSuspended: false, status: { in: ["ACTIVE", "COMPLETED"] } }, select: { courseId: true, batchId: true } });
  const courseIds = access.map(e => e.courseId), batchIds = access.map(e => e.batchId);
  // Present/total attendance counts computed by Postgres (one groupBy)
  // instead of loading every attendance row just to reduce it to a
  // percentage. Independent of the student fetch below, so run together.
  const [student, attendanceCounts] = await Promise.all([
    db.student.findUnique({
      where: { id: studentId },
      include: {
        enrollments: { where: { accessSuspended: false, status: { in: ["ACTIVE", "COMPLETED"] } }, include: { course: true, batch: true } },
        submissions: { where: { status: "PENDING", assignment: { courseId: { in: courseIds } } }, include: { assignment: true } },
        grades: { where: { courseId: { in: courseIds } }, orderBy: { createdAt: "desc" }, take: 5, include: { course: true } },
      },
    }),
    db.attendance.groupBy({
      by: ["status"],
      where: { studentId, batchId: { in: batchIds } },
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

  const visible = (await getAnnouncementsForStudent(studentId)).slice(0, 5);
  const announcements = await db.announcement.findMany({ where: { id: { in: visible.map(a => a.id) }, status: "PUBLISHED" }, orderBy: { publishedAt: "desc" } });

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
  const access = await db.enrollment.findMany({ where: { studentId, accessSuspended: false, status: { in: ["ACTIVE", "COMPLETED"] } }, select: { batchId: true } });
  return db.attendance.findMany({
    where: { studentId, batchId: { in: access.map(e => e.batchId) } },
    include: { batch: { include: { course: { select: { title: true } } } } },
    orderBy: { date: "desc" },
  });
}
