import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// Re-evaluate stored notifications too, so suspending a course hides its old notices.
export async function notificationVisibility(
  userId: string,
): Promise<Prisma.NotificationWhereInput> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      admissionRequired: true,
      student: { select: { id: true } },
    },
  });
  if (user?.role !== "STUDENT") return {};
  if (user.admissionRequired || !user.student)
    return { type: "SYSTEM", linkUrl: "/admission" };
  const studentId = user.student.id;
  const enrollments = await db.enrollment.findMany({
    where: {
      studentId,
      accessSuspended: false,
      status: { in: ["ACTIVE", "COMPLETED"] },
    },
    select: { courseId: true },
  });
  const courseIds = enrollments.map((e) => e.courseId);
  const assignments = await db.assignment.findMany({
    where: { courseId: { in: courseIds } },
    select: { id: true },
  });
  // Agency model: the student portal is Courses / Quizzes / Assignments /
  // Profile, plus the notifications page itself (announcement notifications
  // link there now that the student announcement pages are gone). Fee,
  // attendance and certificate links are no longer student-visible.
  const links = [
    ...assignments.map((a) => `/student/assignments/${a.id}`),
    ...(courseIds.length
      ? [
          "/student/notifications",
          "/student/assignments",
          "/student/courses",
        ]
      : []),
  ];
  return {
    OR: [
      { type: "SYSTEM" },
      { linkUrl: { in: links } },
      ...courseIds.flatMap((id) => [
        { linkUrl: `/student/courses/${id}` },
        { linkUrl: { startsWith: `/student/courses/${id}/` } },
      ]),
    ],
  };
}
