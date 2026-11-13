/**
 * Notification service integration tests (node:test via tsx).
 *
 * Run against a DISPOSABLE database only:
 *   DATABASE_URL=postgresql://postgres@localhost:54329/iskillspot_test \
 *   DIRECT_URL=postgresql://postgres@localhost:54329/iskillspot_test \
 *   npx tsx --test tests/notifications.test.ts
 * All fixtures are created inside this file and deleted afterwards
 * (User deletion cascades to notifications/students/teachers/enrollments).
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { db } from "@/lib/db";
import {
  isSafeInternalLink,
  notifyAnnouncementPublished,
  notifyUser,
  notifyUsers,
  resolveAnnouncementRecipients,
} from "@/lib/notifications";

const createdUserIds: string[] = [];
const createdCourseIds: string[] = [];

async function makeUser(role: "STUDENT" | "TEACHER" | "SUPER_ADMIN", status: "ACTIVE" | "INACTIVE" = "ACTIVE") {
  const suffix = Math.random().toString(36).slice(2, 10);
  const u = await db.user.create({
    data: { username: `t_${suffix}`, email: `t_${suffix}@test.local`, passwordHash: "x", role, status },
  });
  createdUserIds.push(u.id);
  return u;
}

before(async () => {
  // Make sure we are NOT pointed at anything resembling a shared/prod DB:
  // tests refuse to run unless the database name contains "test".
  const row = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  assert.match(row[0].current_database, /test/, "refusing to run tests against a non-test database");
});

after(async () => {
  await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await db.course.deleteMany({ where: { id: { in: createdCourseIds } } });
  await db.$disconnect();
});

describe("isSafeInternalLink", () => {
  it("accepts internal paths", () => {
    assert.equal(isSafeInternalLink("/student/fees"), true);
    assert.equal(isSafeInternalLink("/a/b?x=1#frag"), true);
    assert.equal(isSafeInternalLink("/"), true);
  });
  it("rejects external / protocol-relative / scheme / malformed links", () => {
    assert.equal(isSafeInternalLink("//evil.example"), false);
    assert.equal(isSafeInternalLink("https://evil.example"), false);
    assert.equal(isSafeInternalLink("javascript:alert(1)"), false);
    assert.equal(isSafeInternalLink("/\\evil"), false);
    assert.equal(isSafeInternalLink("/has space"), false);
    assert.equal(isSafeInternalLink(""), false);
    assert.equal(isSafeInternalLink(null), false);
    assert.equal(isSafeInternalLink(undefined), false);
    assert.equal(isSafeInternalLink(42), false);
  });
});

describe("notifyUser", () => {
  it("creates a notification and dedupes a re-fire with the same key", async () => {
    const u = await makeUser("STUDENT");
    const input = { title: "Hello", message: "World", dedupeKey: "evt:1" };
    const first = await notifyUser(u.id, input);
    assert.deepEqual(first, { created: 1, skipped: 0 });
    const second = await notifyUser(u.id, input);
    assert.deepEqual(second, { created: 0, skipped: 1 });
    const count = await db.notification.count({ where: { userId: u.id } });
    assert.equal(count, 1);
  });

  it("skips INACTIVE users", async () => {
    const u = await makeUser("STUDENT", "INACTIVE");
    const res = await notifyUser(u.id, { title: "X", message: "Y" });
    assert.equal(res.created, 0);
    assert.equal(await db.notification.count({ where: { userId: u.id } }), 0);
  });

  it("drops unsafe links instead of storing them", async () => {
    const u = await makeUser("STUDENT");
    await notifyUser(u.id, { title: "X", message: "Y", linkUrl: "https://evil.example/phish" });
    const row = await db.notification.findFirst({ where: { userId: u.id } });
    assert.equal(row?.linkUrl, null);
  });

  it("never throws for a missing user", async () => {
    const res = await notifyUser("nonexistent-user-id", { title: "X", message: "Y" });
    assert.equal(res.created, 0);
  });
});

describe("notifyUsers fan-out", () => {
  it("notifies only ACTIVE, de-duplicated recipients and dedupes re-fires", async () => {
    const a = await makeUser("STUDENT");
    const b = await makeUser("STUDENT");
    const inactive = await makeUser("STUDENT", "INACTIVE");
    const input = { title: "Bulk", message: "Hi", dedupeKey: "bulk:1" };
    const res = await notifyUsers([a.id, b.id, a.id, inactive.id], input);
    assert.equal(res.created, 2);
    const again = await notifyUsers([a.id, b.id], input);
    assert.equal(again.created, 0);
    assert.equal(await db.notification.count({ where: { dedupeKey: "bulk:1" } }), 2);
  });
});

describe("preferences (Phase 2)", () => {
  it("defaults apply when no preference row exists; stored rows override per type/channel", async () => {
    const { getPreferencesForUser } = await import("@/lib/data/notifications");
    const u = await makeUser("STUDENT");
    const before = await getPreferencesForUser(u.id);
    assert.equal(before.length, 8);
    assert.ok(before.every((p) => p.inApp && p.push));
    await db.notificationPreference.create({ data: { userId: u.id, type: "ASSIGNMENT", inApp: false, push: true } });
    const after = await getPreferencesForUser(u.id);
    assert.equal(after.find((p) => p.type === "ASSIGNMENT")?.inApp, false);
    assert.equal(after.find((p) => p.type === "FEE")?.inApp, true);
  });

  it("inApp=false suppresses that type but not others, and SYSTEM is essential", async () => {
    const u = await makeUser("STUDENT");
    await db.notificationPreference.create({ data: { userId: u.id, type: "ASSIGNMENT", inApp: false } });
    await db.notificationPreference.create({ data: { userId: u.id, type: "SYSTEM", inApp: false } });
    const a = await notifyUser(u.id, { title: "A", message: "m", type: "ASSIGNMENT" });
    assert.equal(a.created, 0);
    const s = await notifyUser(u.id, { title: "S", message: "m", type: "SYSTEM" });
    assert.equal(s.created, 1); // essential: preference cannot suppress SYSTEM in-app
    const f = await notifyUser(u.id, { title: "F", message: "m", type: "FEE" });
    assert.equal(f.created, 1);
  });

  it("fan-out respects per-user preferences", async () => {
    const opted = await makeUser("STUDENT");
    const normal = await makeUser("STUDENT");
    await db.notificationPreference.create({ data: { userId: opted.id, type: "ANNOUNCEMENT", inApp: false } });
    const res = await notifyUsers([opted.id, normal.id], { title: "N", message: "m", type: "ANNOUNCEMENT", dedupeKey: "pref-fanout:1" });
    assert.equal(res.created, 1);
    assert.equal(await db.notification.count({ where: { userId: opted.id, type: "ANNOUNCEMENT" } }), 0);
  });
});

describe("push subscriptions (Phase 3)", () => {
  it("validates subscription payloads strictly", async () => {
    const { pushSubscriptionSchema } = await import("@/lib/push-subscriptions");
    const webpush = createRequire(import.meta.url)("web-push");
    const { publicKey } = webpush.generateVAPIDKeys();
    const good = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: publicKey, auth: "AAAAAAAAAAAAAAAAAAAAAA" } };
    assert.equal(pushSubscriptionSchema.safeParse(good).success, true);
    assert.equal(pushSubscriptionSchema.safeParse({ ...good, endpoint: "http://insecure.example/x" }).success, false);
    assert.equal(pushSubscriptionSchema.safeParse({ ...good, endpoint: "not a url" }).success, false);
    assert.equal(pushSubscriptionSchema.safeParse({ endpoint: good.endpoint, keys: { p256dh: "short", auth: "AAAAAAAAAAAAAAAAAAAAAA" } }).success, false);
    assert.equal(pushSubscriptionSchema.safeParse({ endpoint: good.endpoint }).success, false);
  });

  it("upserts, reassigns across users on shared devices, and enforces remove ownership", async () => {
    const { upsertPushSubscription, removePushSubscription, isEndpointMine, listMyPushEndpoints } = await import("@/lib/push-subscriptions");
    const webpush = createRequire(import.meta.url)("web-push");
    const { publicKey } = webpush.generateVAPIDKeys();
    const sub = { endpoint: "https://push.example/device-1", keys: { p256dh: publicKey, auth: "AAAAAAAAAAAAAAAAAAAAAA" } };
    const a = await makeUser("STUDENT");
    const b = await makeUser("STUDENT");
    assert.equal((await upsertPushSubscription(a.id, sub, "UA-A")).ok, true);
    assert.equal(await isEndpointMine(a.id, sub.endpoint), true);
    // Same browser, new signed-in user: ownership follows the presenter.
    assert.equal((await upsertPushSubscription(b.id, sub, "UA-B")).ok, true);
    assert.equal(await isEndpointMine(a.id, sub.endpoint), false);
    assert.equal(await isEndpointMine(b.id, sub.endpoint), true);
    assert.deepEqual(await listMyPushEndpoints(a.id), []);
    // A cannot remove B's subscription.
    assert.equal(await removePushSubscription(a.id, sub.endpoint), false);
    assert.equal(await removePushSubscription(b.id, sub.endpoint), true);
  });

  it("dispatch failure is contained: in-app row still created, failureCount increments, nothing throws", async () => {
    const webpush = createRequire(import.meta.url)("web-push");
    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    const { upsertPushSubscription } = await import("@/lib/push-subscriptions");
    const u = await makeUser("STUDENT");
    // Unreachable endpoint: connection refused is a transient failure.
    await upsertPushSubscription(u.id, {
      endpoint: "https://localhost:9/dead-endpoint",
      keys: { p256dh: keys.publicKey, auth: "AAAAAAAAAAAAAAAAAAAAAA" },
    });
    const res = await notifyUser(u.id, { title: "Push path", message: "m", dedupeKey: "push-fail:1" });
    assert.equal(res.created, 1);
    const row = await db.pushSubscription.findFirst({ where: { userId: u.id } });
    assert.ok(row, "subscription row kept after transient failure");
    assert.equal(row.failureCount, 1);
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });
});

describe("reminders (Phase 4)", () => {
  async function fixture(dueInHours: number) {
    const stamp = Date.now() + Math.floor(Math.random() * 1e6);
    const course = await db.course.create({ data: { title: "R Course", slug: `r-course-${stamp}` } });
    createdCourseIds.push(course.id);
    const batch = await db.batch.create({ data: { name: "RB", code: `RB-${stamp}`, courseId: course.id } });
    const user = await makeUser("STUDENT");
    const student = await db.student.create({ data: { userId: user.id, fullName: "R Student", studentId: `RS-${stamp}` } });
    await db.enrollment.create({ data: { studentId: student.id, courseId: course.id, batchId: batch.id } });
    const assignment = await db.assignment.create({
      data: { courseId: course.id, title: "R Assignment", dueDate: new Date(Date.now() + dueInHours * 3600_000) },
    });
    return { course, student, user, assignment };
  }

  it("deadline reminder: inside 24h and unsubmitted -> 1; re-run dedupes; submitted -> 0", async () => {
    const { generateAssignmentDeadlineReminders } = await import("@/lib/reminders");
    const f = await fixture(12);
    const first = await generateAssignmentDeadlineReminders(new Date());
    assert.equal(first.created, 1);
    const second = await generateAssignmentDeadlineReminders(new Date());
    assert.equal(second.created, 0);
    // another student who HAS submitted gets nothing new for a second assignment
    const g = await fixture(6);
    await db.assignmentSubmission.create({
      data: { assignmentId: g.assignment.id, studentId: g.student.id, status: "SUBMITTED", submittedAt: new Date() },
    });
    const third = await generateAssignmentDeadlineReminders(new Date());
    assert.equal(third.created, 0);
    assert.equal(await db.notification.count({ where: { userId: g.user.id, dedupeKey: { startsWith: "reminder:assignment:" } } }), 0);
    assert.ok(f.assignment.id);
  });

  it("deadline reminder: due in 48h -> outside window, no reminder", async () => {
    const { generateAssignmentDeadlineReminders } = await import("@/lib/reminders");
    const f = await fixture(48);
    const res = await generateAssignmentDeadlineReminders(new Date());
    assert.equal(await db.notification.count({ where: { userId: f.user.id, dedupeKey: { startsWith: "reminder:assignment:" } } }), 0);
    assert.ok(res.candidates >= 0);
  });

  it("fee overdue: one per ISO week; UNPAID fees are not reminded", async () => {
    const { generateFeeOverdueReminders } = await import("@/lib/reminders");
    const u = await makeUser("STUDENT");
    const stamp = Date.now();
    const student = await db.student.create({ data: { userId: u.id, fullName: "F Student", studentId: `FS-${stamp}` } });
    const course = await db.course.create({ data: { title: "F Course", slug: `f-course-${stamp}` } });
    createdCourseIds.push(course.id);
    await db.fee.create({
      data: { studentId: student.id, courseId: course.id, totalFee: 100, finalFee: 100, amountPaid: 0, remainingBalance: 100, status: "OVERDUE", dueDate: new Date(Date.now() - 3 * 86400_000) },
    });
    await db.fee.create({
      data: { studentId: student.id, courseId: course.id, totalFee: 50, finalFee: 50, amountPaid: 0, remainingBalance: 50, status: "UNPAID", dueDate: new Date(Date.now() - 3 * 86400_000) },
    });
    const first = await generateFeeOverdueReminders(new Date());
    assert.equal(first.created, 1);
    const second = await generateFeeOverdueReminders(new Date());
    assert.equal(second.created, 0);
    const rows = await db.notification.findMany({ where: { userId: u.id, dedupeKey: { startsWith: "reminder:fee-overdue:" } } });
    assert.equal(rows.length, 1);
    assert.ok(!/100|PKR|Rs/.test(rows[0].title + rows[0].message), "no amounts in reminder payload");
  });
});

describe("announcement audience resolution", () => {
  it("resolves COURSE and BATCH audiences via enrollments and batch teachers", async () => {
    const stamp = Date.now();
    const course = await db.course.create({ data: { title: "T Course", slug: `t-course-${stamp}` } });
    createdCourseIds.push(course.id);
    const teacherUser = await makeUser("TEACHER");
    const teacher = await db.teacher.create({ data: { userId: teacherUser.id, fullName: "T Teacher" } });
    const batch = await db.batch.create({
      data: { name: "B1", code: `B-${stamp}`, courseId: course.id, teacherId: teacher.id },
    });
    const studentUser = await makeUser("STUDENT");
    const student = await db.student.create({ data: { userId: studentUser.id, fullName: "T Student", studentId: `ST-${stamp}` } });
    await db.enrollment.create({ data: { studentId: student.id, courseId: course.id, batchId: batch.id } });
    const outsider = await makeUser("STUDENT");

    const courseRes = await resolveAnnouncementRecipients({ audience: "COURSE", targetBatchId: null, targetCourseId: course.id });
    assert.deepEqual(courseRes.studentUserIds, [studentUser.id]);
    assert.deepEqual(courseRes.teacherUserIds, [teacherUser.id]);

    const batchRes = await resolveAnnouncementRecipients({ audience: "BATCH", targetBatchId: batch.id, targetCourseId: null });
    assert.deepEqual(batchRes.studentUserIds, [studentUser.id]);
    assert.deepEqual(batchRes.teacherUserIds, [teacherUser.id]);

    const studentsRes = await resolveAnnouncementRecipients({ audience: "STUDENTS", targetBatchId: null, targetCourseId: null });
    assert.ok(studentsRes.studentUserIds.includes(studentUser.id));
    assert.ok(studentsRes.studentUserIds.includes(outsider.id));
    assert.equal(studentsRes.teacherUserIds.length, 0);
  });

  it("publishing twice (both publish paths) notifies exactly once, with role-correct links", async () => {
    const studentUser = await makeUser("STUDENT");
    const announcement = await db.announcement.create({
      data: { title: "Big news", content: "Something happened", audience: "STUDENTS", createdBy: studentUser.id, status: "PUBLISHED" },
    });
    const first = await notifyAnnouncementPublished(announcement);
    assert.ok(first.created >= 1);
    const second = await notifyAnnouncementPublished(announcement); // publishAnnouncement path re-fire
    assert.equal(second.created, 0);
    const row = await db.notification.findFirst({ where: { userId: studentUser.id, dedupeKey: `announcement:${announcement.id}` } });
    assert.equal(row?.linkUrl, `/student/announcements/${announcement.id}`);
    await db.announcement.delete({ where: { id: announcement.id } });
  });
});
