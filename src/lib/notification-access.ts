import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getAnnouncementsForStudent } from "@/lib/data/announcements";

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
  const [assignments, certificates, announcements] = await Promise.all([
    db.assignment.findMany({
      where: { courseId: { in: courseIds } },
      select: { id: true },
    }),
    db.certificate.findMany({
      where: { studentId, courseId: { in: courseIds } },
      select: { id: true },
    }),
    getAnnouncementsForStudent(studentId),
  ]);
  const links = [
    ...assignments.map((a) => `/student/assignments/${a.id}`),
    ...certificates.map((c) => `/student/certificates/${c.id}`),
    ...announcements.map((a) => `/student/announcements/${a.id}`),
    ...(courseIds.length
      ? [
          "/student/fees",
          "/student/attendance",
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
