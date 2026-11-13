/**
 * Notification service — the single write path for in-app notifications.
 *
 * Design rules (see the notifications audit + implementation report):
 * - NEVER throws. A notification failure must not roll back or falsely fail
 *   a completed business action, so every function catches, logs, and
 *   reports counts instead. Callers fire notifications AFTER their main
 *   mutation/transaction has committed, next to their logAction(...) call.
 * - Deduplication: callers pass a stable, event-specific `dedupeKey`
 *   (e.g. "announcement:<id>", "payment:<id>"). The
 *   @@unique([userId, dedupeKey]) constraint makes re-fires safe no-ops.
 *   Fingerprint keys (including the event's distinguishing values, e.g.
 *   "assignment-graded:<submissionId>:<score>") are used where a later,
 *   genuinely different event must still notify.
 * - Only ACTIVE user accounts receive notifications.
 * - Fan-out is bounded (MAX_FANOUT) and chunked.
 * - linkUrl is restricted to safe internal paths so a notification can
 *   never become an open-redirect / phishing vector.
 * - A transactional outbox was assessed and deliberately NOT introduced:
 *   it would require writing inside protected financial/enrollment
 *   transactions, changing their semantics. Post-commit firing + stable
 *   dedupe keys + the existing AuditLog trail give an equivalent safety
 *   story at this scale: a crashed fire can be safely re-fired from the
 *   audit record without ever double-notifying.
 */
import { Prisma, type NotificationType } from "@prisma/client";
import { db } from "@/lib/db";

export const MAX_FANOUT = 500;
const CHUNK_SIZE = 100;
const MAX_LINK_LENGTH = 500;

export type NotifyInput = {
  title: string;
  message: string;
  type?: NotificationType;
  /** Safe internal path only (see isSafeInternalLink); unsafe values are dropped. */
  linkUrl?: string | null;
  /** Stable event identity; see header. Null = always create (no dedupe). */
  dedupeKey?: string | null;
};

export type NotifyResult = { created: number; skipped: number };

/**
 * A link is safe iff it is a site-internal absolute path: starts with a
 * single "/", contains no backslashes, whitespace, or control characters,
 * and is not protocol-relative ("//host") or a scheme URL.
 */
export function isSafeInternalLink(url: unknown): url is string {
  if (typeof url !== "string") return false;
  if (url.length === 0 || url.length > MAX_LINK_LENGTH) return false;
  if (!url.startsWith("/")) return false;
  if (url.startsWith("//")) return false;
  if (url.includes("\\")) return false;
  if (/[\s\u0000-\u001f\u007f]/.test(url)) return false;
  return true;
}

export function sanitizeLink(url: string | null | undefined): string | null {
  return isSafeInternalLink(url) ? url : null;
}

/**
 * Essential types always arrive in-app, even if a preference row says
 * otherwise: SYSTEM carries account/security/onboarding notices (welcome,
 * batch assignment, password-related notices). Users can still mute its
 * push channel. All other types respect the inApp preference; a missing
 * preference row means "enabled" (the default).
 */
export const ESSENTIAL_TYPES: ReadonlySet<NotificationType> = new Set(["SYSTEM"]);

/** Of the given users, those allowed to receive this type in-app. */
async function filterByInAppPreference(userIds: string[], type: NotificationType): Promise<string[]> {
  if (ESSENTIAL_TYPES.has(type) || userIds.length === 0) return userIds;
  const prefs = await db.notificationPreference.findMany({
    where: { userId: { in: userIds }, type },
    select: { userId: true, inApp: true },
  });
  const disabled = new Set(prefs.filter((p) => !p.inApp).map((p) => p.userId));
  return userIds.filter((id) => !disabled.has(id));
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

function toRow(userId: string, input: NotifyInput) {
  return {
    userId,
    title: input.title.slice(0, 200),
    message: input.message.slice(0, 1000),
    type: input.type ?? "SYSTEM",
    linkUrl: sanitizeLink(input.linkUrl),
    dedupeKey: input.dedupeKey ?? null,
  };
}

/** Notify a single user. Skips non-ACTIVE or missing accounts silently. */
export async function notifyUser(userId: string, input: NotifyInput): Promise<NotifyResult> {
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (!user || user.status !== "ACTIVE") return { created: 0, skipped: 1 };
    const allowed = await filterByInAppPreference([userId], input.type ?? "SYSTEM");
    if (allowed.length === 0) return { created: 0, skipped: 1 };
    const row = await db.notification.create({ data: toRow(userId, input) });
    await dispatchPushAfterCreate([row.id]);
    return { created: 1, skipped: 0 };
  } catch (e) {
    if (isUniqueViolation(e)) return { created: 0, skipped: 1 }; // deduped re-fire
    console.error("[notifications] notifyUser failed", e);
    return { created: 0, skipped: 1 };
  }
}

/**
 * Notify many users with the same payload. Recipients are de-duplicated,
 * filtered to ACTIVE accounts, and capped at MAX_FANOUT.
 */
export async function notifyUsers(userIds: string[], input: NotifyInput): Promise<NotifyResult> {
  try {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (unique.length === 0) return { created: 0, skipped: 0 };
    const bounded = unique.slice(0, MAX_FANOUT);
    if (unique.length > MAX_FANOUT) {
      console.error(`[notifications] fan-out capped: ${unique.length} recipients > ${MAX_FANOUT}`);
    }
    const active = await db.user.findMany({
      where: { id: { in: bounded }, status: "ACTIVE" },
      select: { id: true },
    });
    const activeIds = await filterByInAppPreference(active.map((u) => u.id), input.type ?? "SYSTEM");
    let created = 0;
    const createdIds: string[] = [];
    for (let i = 0; i < activeIds.length; i += CHUNK_SIZE) {
      const chunk = activeIds.slice(i, i + CHUNK_SIZE);
      // Insert chunk-by-chunk (not createMany) so we know exactly which
      // rows were newly created — only those may trigger a push.
      for (const uid of chunk) {
        try {
          const row = await db.notification.create({ data: toRow(uid, input) });
          createdIds.push(row.id);
          created += 1;
        } catch (e) {
          if (!isUniqueViolation(e)) throw e;
        }
      }
    }
    await dispatchPushAfterCreate(createdIds);
    return { created, skipped: bounded.length - created };
  } catch (e) {
    console.error("[notifications] notifyUsers failed", e);
    return { created: 0, skipped: userIds.length };
  }
}

/** Resolve a Student row id to its login user id (null if not found). */
export async function userIdForStudent(studentId: string): Promise<string | null> {
  const s = await db.student.findUnique({ where: { id: studentId }, select: { userId: true } });
  return s?.userId ?? null;
}

/** Resolve a Teacher row id to its login user id (null if not found). */
export async function userIdForTeacher(teacherId: string): Promise<string | null> {
  const t = await db.teacher.findUnique({ where: { id: teacherId }, select: { userId: true } });
  return t?.userId ?? null;
}

/** Notify a student (by Student row id). */
export async function notifyStudent(studentId: string, input: NotifyInput): Promise<NotifyResult> {
  const userId = await userIdForStudent(studentId);
  if (!userId) return { created: 0, skipped: 1 };
  return notifyUser(userId, input);
}

/** User ids of teachers assigned to any batch of a course. */
export async function teacherUserIdsForCourse(courseId: string): Promise<string[]> {
  const batches = await db.batch.findMany({
    where: { courseId, teacherId: { not: null } },
    select: { teacher: { select: { userId: true } } },
  });
  return [...new Set(batches.map((b) => b.teacher?.userId).filter((x): x is string => Boolean(x)))];
}

/** User ids of students enrolled in a course (any enrollment status). */
export async function studentUserIdsForCourse(courseId: string): Promise<string[]> {
  const enrollments = await db.enrollment.findMany({
    where: { courseId },
    select: { student: { select: { userId: true } } },
  });
  return [...new Set(enrollments.map((e) => e.student.userId))];
}

/**
 * Recipient resolution for announcements — mirrors the display predicates
 * in src/lib/data/announcements.ts exactly:
 * - students see ALL / STUDENTS, plus BATCH/COURSE via their enrollments
 * - teachers see ALL / TEACHERS, plus BATCH/COURSE via batches they teach
 * Staff (admin) authors are not notified of their own announcements.
 * Final ACTIVE-account filtering happens inside notifyUsers.
 */
export async function resolveAnnouncementRecipients(announcement: {
  audience: "ALL" | "STUDENTS" | "TEACHERS" | "BATCH" | "COURSE";
  targetBatchId: string | null;
  targetCourseId: string | null;
}): Promise<{ studentUserIds: string[]; teacherUserIds: string[] }> {
  const { audience, targetBatchId, targetCourseId } = announcement;
  let studentUserIds: string[] = [];
  let teacherUserIds: string[] = [];

  if (audience === "ALL" || audience === "STUDENTS") {
    const students = await db.user.findMany({ where: { role: "STUDENT" }, select: { id: true } });
    studentUserIds = students.map((u) => u.id);
  }
  if (audience === "ALL" || audience === "TEACHERS") {
    const teachers = await db.user.findMany({ where: { role: "TEACHER" }, select: { id: true } });
    teacherUserIds = teachers.map((u) => u.id);
  }
  if (audience === "BATCH" && targetBatchId) {
    const enrollments = await db.enrollment.findMany({
      where: { batchId: targetBatchId },
      select: { student: { select: { userId: true } } },
    });
    studentUserIds = enrollments.map((e) => e.student.userId);
    const batch = await db.batch.findUnique({
      where: { id: targetBatchId },
      select: { teacher: { select: { userId: true } } },
    });
    teacherUserIds = batch?.teacher?.userId ? [batch.teacher.userId] : [];
  }
  if (audience === "COURSE" && targetCourseId) {
    studentUserIds = await studentUserIdsForCourse(targetCourseId);
    teacherUserIds = await teacherUserIdsForCourse(targetCourseId);
  }
  return { studentUserIds: [...new Set(studentUserIds)], teacherUserIds: [...new Set(teacherUserIds)] };
}

/**
 * Fire notifications for a freshly published announcement. Uses one stable
 * dedupe key ("announcement:<id>") across both publish paths
 * (createAnnouncement with publishNow, and publishAnnouncement), so an
 * announcement can never notify twice. Students and teachers get links
 * into their own role area.
 */
export async function notifyAnnouncementPublished(announcement: {
  id: string;
  title: string;
  content: string;
  audience: "ALL" | "STUDENTS" | "TEACHERS" | "BATCH" | "COURSE";
  targetBatchId: string | null;
  targetCourseId: string | null;
}): Promise<NotifyResult> {
  try {
    const { studentUserIds, teacherUserIds } = await resolveAnnouncementRecipients(announcement);
    const message = announcement.content.trim().slice(0, 140);
    const base = { title: announcement.title, message, type: "ANNOUNCEMENT" as const, dedupeKey: `announcement:${announcement.id}` };
    const [a, b] = await Promise.all([
      notifyUsers(studentUserIds, { ...base, linkUrl: `/student/announcements/${announcement.id}` }),
      notifyUsers(teacherUserIds, { ...base, linkUrl: `/teacher/announcements/${announcement.id}` }),
    ]);
    return { created: a.created + b.created, skipped: a.skipped + b.skipped };
  } catch (e) {
    console.error("[notifications] notifyAnnouncementPublished failed", e);
    return { created: 0, skipped: 0 };
  }
}

/**
 * Phase-3 seam: after in-app rows are created, dispatch browser push for
 * exactly those rows. Lazily imported so the push stack (web-push, VAPID)
 * is only loaded when there is something to send, and wrapped so a push
 * failure can never affect the in-app result.
 */
async function dispatchPushAfterCreate(notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return;
  try {
    const { dispatchPushForNotifications } = await import("@/lib/push");
    await dispatchPushForNotifications(notificationIds);
  } catch (e) {
    console.error("[notifications] push dispatch failed", e);
  }
}
