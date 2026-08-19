import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { getAllBatches } from "@/lib/data/batches";
import { getAssignmentsForTeacher, getCoursesForTeacher } from "@/lib/data/assignments";

export async function getAdminStats() {
  const [
    totalStudents,
    activeStudents,
    completedStudents,
    totalTeachers,
    activeCourses,
    activeBatches,
    outstandingAgg,
  ] = await Promise.all([
    db.student.count(),
    db.student.count({ where: { status: "ACTIVE" } }),
    db.student.count({ where: { status: "COMPLETED" } }),
    db.teacher.count({ where: { status: "ACTIVE" } }),
    db.course.count({ where: { status: "PUBLISHED" } }),
    db.batch.count({ where: { status: "ONGOING" } }),
    db.fee.aggregate({
      _sum: {
        remainingBalance: true,
      },
    }),
  ]);

  return {
    totalStudents,
    activeStudents,
    completedStudents,
    totalTeachers,
    activeCourses,
    activeBatches,
    outstandingFees: outstandingAgg._sum.remainingBalance ?? 0,
  };
}

export async function getStudentStatusBreakdown() {
  const rows = await db.student.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  const map: Record<string, number> = {
    ACTIVE: 0,
    COMPLETED: 0,
    ON_HOLD: 0,
    DROPPED: 0,
    SUSPENDED: 0,
  };

  for (const row of rows) {
    map[row.status] = row._count._all;
  }

  return map;
}

/**
 * At-risk = attendance below threshold OR progress below threshold.
 * Computed from real data.
 */
export async function getAtRiskStudents() {
  const progressThreshold = 40;

  // The student query doesn't depend on the threshold value (only used below,
  // after both have resolved) — safe to run these two concurrently.
  const [attThresholdSetting, students] = await Promise.all([
    getSetting("attendanceThreshold", "75"),
    db.student.findMany({
      where: {
        status: "ACTIVE",
      },
      select: {
        id: true,
        studentId: true,
        fullName: true,

        enrollments: {
          select: {
            progress: true,
            course: {
              select: {
                title: true,
              },
            },
          },
        },

        attendance: {
          select: {
            status: true,
          },
        },
      },
    }),
  ]);
  const attThreshold = Number(attThresholdSetting);

  const results = [];

  for (const student of students) {
    const totalAttendance = student.attendance.length;

    const presentAttendance = student.attendance.filter(
      (attendance) =>
        attendance.status === "PRESENT" ||
        attendance.status === "LATE"
    ).length;

    const attendancePercentage =
      totalAttendance > 0
        ? Math.round(
            (presentAttendance / totalAttendance) * 100
          )
        : 100;

    const averageProgress =
      student.enrollments.length > 0
        ? Math.round(
            student.enrollments.reduce(
              (sum, enrollment) => sum + enrollment.progress,
              0
            ) / student.enrollments.length
          )
        : 0;

    const reasons: string[] = [];

    if (
      totalAttendance > 0 &&
      attendancePercentage < attThreshold
    ) {
      reasons.push(
        `Attendance ${attendancePercentage}%`
      );
    }

    if (
      student.enrollments.length > 0 &&
      averageProgress < progressThreshold
    ) {
      reasons.push(
        `Progress ${averageProgress}%`
      );
    }

    if (reasons.length > 0) {
      results.push({
        id: student.id,
        studentId: student.studentId,
        fullName: student.fullName,
        course:
          student.enrollments[0]?.course.title ?? "—",
        attendance: attendancePercentage,
        progress: averageProgress,
        reasons,
      });
    }
  }

  return results;
}

export async function getRecentActivity(limit = 8) {
  const logs = await db.auditLog.findMany({
    orderBy: {
      timestamp: "desc",
    },
    take: limit,
    include: {
      user: {
        select: {
          username: true,
        },
      },
    },
  });

  return logs;
}

export async function getEnrollmentByCourse() {
  const courses = await db.course.findMany({
    where: {
      status: "PUBLISHED",
    },
    select: {
      title: true,
      _count: {
        select: {
          enrollments: true,
        },
      },
    },
  });

  return courses.map((course) => ({
    name: course.title,
    value: course._count.enrollments,
  }));
}

// ---------------------------------------------------------------------------
// Teacher dashboard
// ---------------------------------------------------------------------------

export interface TeacherDashboardBatch {
  batchId: string;
  code: string;
  courseName: string;
  studentCount: number;
  status: string;
  attendanceMarked: boolean;
}

export interface TeacherRecentSubmission {
  submissionId: string;
  assignmentId: string;
  studentName: string;
  assignmentTitle: string;
  submittedAt: Date | null;
}

export interface TeacherDashboardData {
  stats: {
    activeBatches: number;
    totalStudents: number;
    ungradedSubmissions: number;
    upcomingAssignments: number;
  };
  todaysBatches: TeacherDashboardBatch[];
  recentSubmissions: TeacherRecentSubmission[];
  myBatches: TeacherDashboardBatch[];
}

/**
 * Composed from existing data helpers (getAllBatches, getAssignmentsForTeacher,
 * getCoursesForTeacher) rather than re-querying what they already fetch — the
 * only genuinely new query here is the recent-ungraded-submissions lookup,
 * since no existing helper returns individual submission rows across a
 * teacher's assignments.
 */
export async function getTeacherDashboard(teacherId: string): Promise<TeacherDashboardData> {
  // batches is fetched first (rather than in the same Promise.all as the two
  // calls below) because its rows already carry courseId per batch — passing
  // that derived set into getAssignmentsForTeacher/getCoursesForTeacher lets
  // them skip their own redundant "which courses does this teacher own"
  // lookup (previously two separate, identical db.batch.findMany calls).
  const batches = await getAllBatches({ teacherId });
  const courseIds = [...new Set(batches.map((b) => b.courseId))];

  const [assignments, courses] = await Promise.all([
    getAssignmentsForTeacher(teacherId, undefined, courseIds),
    getCoursesForTeacher(teacherId, courseIds),
  ]);

  const ongoingBatchIds = batches.filter((b) => b.status === "ONGOING").map((b) => b.id);

  // UTC-safe "today", matching a @db.Date column — avoids the
  // new Date(str); setHours(0,0,0,0) local-timezone mismatch used elsewhere.
  const today = new Date(new Date().toISOString().slice(0, 10));

  const [markedToday, recentSubs] = await Promise.all([
    ongoingBatchIds.length
      ? db.attendance.findMany({
          where: { batchId: { in: ongoingBatchIds }, date: today },
          select: { batchId: true },
          distinct: ["batchId"],
        })
      : Promise.resolve([]),
    courses.length
      ? db.assignmentSubmission.findMany({
          where: {
            status: { in: ["SUBMITTED", "LATE"] },
            assignment: { courseId: { in: courses.map((c) => c.id) } },
          },
          include: {
            student: { select: { fullName: true } },
            assignment: { select: { title: true } },
          },
          orderBy: { submittedAt: "desc" },
          take: 5,
        })
      : Promise.resolve([]),
  ]);

  const markedSet = new Set(markedToday.map((a) => a.batchId));

  const toDashboardBatch = (b: (typeof batches)[number]): TeacherDashboardBatch => ({
    batchId: b.id,
    code: b.code,
    courseName: b.courseTitle,
    studentCount: b.enrolledCount,
    status: b.status,
    attendanceMarked: markedSet.has(b.id),
  });

  const myBatches = batches.map(toDashboardBatch);
  // "Today's classes" = batches currently running (ONGOING); the app has no
  // structured weekday schedule to check against Schedule is free text
  // (e.g. "Mon/Wed/Fri"), so this is the closest reliable signal available.
  const todaysBatches = myBatches.filter((b) => b.status === "ONGOING");

  const weekFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const upcomingAssignments = assignments.filter(
    (a) => a.dueDate !== null && a.dueDate.getTime() >= Date.now() && a.dueDate.getTime() <= weekFromNow
  ).length;
  const ungradedSubmissions = assignments.reduce(
    (sum, a) => sum + a.counts.submitted + a.counts.late + a.counts.pending,
    0
  );

  return {
    stats: {
      activeBatches: ongoingBatchIds.length,
      totalStudents: batches.reduce((sum, b) => sum + b.enrolledCount, 0),
      ungradedSubmissions,
      upcomingAssignments,
    },
    todaysBatches,
    recentSubmissions: recentSubs.map((s) => ({
      submissionId: s.id,
      assignmentId: s.assignmentId,
      studentName: s.student.fullName,
      assignmentTitle: s.assignment.title,
      submittedAt: s.submittedAt,
    })),
    myBatches,
  };
}