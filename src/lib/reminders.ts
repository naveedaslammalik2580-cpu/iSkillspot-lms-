/**
 * Scheduled reminder generators (Phase 4).
 *
 * These are pure, reusable server functions: each computes its candidate
 * set from stored data, fires through the standard notification service
 * (so preferences, ACTIVE filtering, and dedupe all apply), and returns
 * counts. They contain NO scheduling of their own — invocation wiring is
 * a deployment decision (see src/app/api/cron/reminders/route.ts and the
 * implementation report): an external cron hitting that protected route
 * is the recommended minimal setup for ~50 users. Nothing here runs
 * automatically, and nothing backfills historical reminders: candidates
 * are computed from `now` forward, and dedupe keys make re-runs safe.
 *
 * Anti-spam design:
 * - Assignment deadline: one reminder per assignment per student, keyed
 *   by the assignment's due date — re-runs inside the window are no-ops.
 * - Fee overdue: at most one reminder per fee per ISO week.
 * - No amounts or private details in any reminder payload.
 *
 * Class/activity reminders are intentionally NOT generated: Batch stores
 * its schedule as free text (`schedule`, `startTime`, `endTime` strings)
 * with no structured recurrence, so "upcoming class" cannot be computed
 * reliably from stored data.
 */
import { db } from "@/lib/db";
import { notifyStudent, notifyUsers } from "@/lib/notifications";

export type ReminderResult = { candidates: number; created: number; skipped: number };

const DAY_MS = 24 * 60 * 60 * 1000;

function isoWeekBucket(d: Date): string {
  // ISO week (UTC) — stable bucket for the weekly overdue throttle.
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / DAY_MS - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Assignments due within the next 24 hours, for enrolled students who have not submitted. */
export async function generateAssignmentDeadlineReminders(now: Date = new Date()): Promise<ReminderResult> {
  const until = new Date(now.getTime() + DAY_MS);
  const assignments = await db.assignment.findMany({
    where: { dueDate: { gt: now, lte: until } },
    select: { id: true, title: true, courseId: true, dueDate: true },
  });
  let created = 0;
  let skipped = 0;
  for (const a of assignments) {
    const submissions = await db.assignmentSubmission.findMany({
      where: { assignmentId: a.id },
      select: { studentId: true },
    });
    const submittedStudentIds = new Set(submissions.map((s) => s.studentId));
    const enrolledStudents = await db.enrollment.findMany({
      where: { courseId: a.courseId },
      select: { studentId: true, student: { select: { userId: true } } },
    });
    const pendingUserIds = enrolledStudents
      .filter((e) => !submittedStudentIds.has(e.studentId))
      .map((e) => e.student.userId);
    const res = await notifyUsers(pendingUserIds, {
      type: "ASSIGNMENT",
      title: "Assignment due soon",
      message: `"${a.title}" is due within 24 hours and has not been submitted yet.`,
      linkUrl: `/student/assignments/${a.id}`,
      dedupeKey: `reminder:assignment:${a.id}:${a.dueDate?.toISOString().slice(0, 10) ?? "nodate"}`,
    });
    created += res.created;
    skipped += res.skipped;
  }
  return { candidates: assignments.length, created, skipped };
}

/** Overdue fees: one reminder per fee per ISO week. No amounts in the payload. */
export async function generateFeeOverdueReminders(now: Date = new Date()): Promise<ReminderResult> {
  const fees = await db.fee.findMany({
    where: { status: "OVERDUE", dueDate: { lt: now } },
    select: { id: true, studentId: true },
  });
  const bucket = isoWeekBucket(now);
  let created = 0;
  let skipped = 0;
  for (const fee of fees) {
    const res = await notifyStudent(fee.studentId, {
      type: "FEE",
      title: "Fee overdue",
      message: "You have an overdue fee. Open Fees to see your current statement.",
      linkUrl: "/student/fees",
      dedupeKey: `reminder:fee-overdue:${fee.id}:${bucket}`,
    });
    created += res.created;
    skipped += res.skipped;
  }
  return { candidates: fees.length, created, skipped };
}

/** Run all reminder generators. Safe to call repeatedly (dedupe-bounded). */
export async function runAllReminders(now: Date = new Date()): Promise<{ assignments: ReminderResult; fees: ReminderResult }> {
  const assignments = await generateAssignmentDeadlineReminders(now);
  const fees = await generateFeeOverdueReminders(now);
  return { assignments, fees };
}
