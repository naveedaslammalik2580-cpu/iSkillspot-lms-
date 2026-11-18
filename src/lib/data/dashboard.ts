import { db } from "@/lib/db";

export async function getAdminStats() {
  const [
    totalStudents,
    activeStudents,
    completedStudents,
    activeCourses,
    activeBatches,
    outstandingAgg,
  ] = await Promise.all([
    db.student.count(),
    db.student.count({ where: { status: "ACTIVE" } }),
    db.student.count({ where: { status: "COMPLETED" } }),
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
 * At-risk = average course progress below threshold.
 * Computed from real data. (Attendance-based risk was removed with the
 * attendance module in the agency-model change.)
 */
export async function getAtRiskStudents() {
  const progressThreshold = 40;

  const students = await db.student.findMany({
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
    },
  });

  const results = [];

  for (const student of students) {
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
