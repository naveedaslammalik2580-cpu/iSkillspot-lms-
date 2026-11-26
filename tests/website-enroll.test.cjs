// Website enrollment endpoint tests — node:test, same source-loader
// harness as tests/login-flow.test.cjs (real TS source, real Prisma
// against a disposable database; only the framework request context is
// stubbed).
//
// Covers src/lib/website-enroll.ts (the logic behind POST/GET
// /api/enroll) and the approval-confirmation email body:
//  1. Course listing reflects admission settings + course eligibility.
//  2. Validation failures return the registration rules' messages.
//  3. A successful submission creates User (email pre-verified, NO
//     verification token) + Student (ON_HOLD) + PENDING Admission with
//     the course fee snapshot, queues the "application received" email,
//     and returns the payment payload from the admission settings.
//  4. Duplicate email -> 409, admissions closed -> 400, a course that is
//     not accepting admissions -> 400.
//  5. The DB-backed AuthThrottle blocks the 9th submission from the
//     same source inside the window (429).
//  6. The admission-confirmation email names the sign-in email and
//     carries the portal /login link (src/lib/admissions.ts
//     queueAdmissionConfirmation + emailTemplate defaults).
//
// Refuses to run against a non-test or non-local database.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const { context } = require("./source-loader.cjs");

const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(
  ["localhost", "127.0.0.1"].includes(url.hostname) && /test/.test(url.pathname),
  "Disposable local test database required",
);

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});
const env = {
  NODE_ENV: "development",
  // Assembled from parts; >= 32 chars as the auth secret policy requires.
  SESSION_SECRET: ["enroll", "test", "session", "secret", "0123456789abcdef"].join("-") + "-0123456789abcdef",
};
const c = context(db, env);
const enroll = c.load("src/lib/website-enroll.ts");
const admissions = c.load("src/lib/admissions.ts");
const emailLib = c.load("src/lib/email.ts");

const run = randomBytes(4).toString("hex");
const email = (label) => `enroll-${label}-${run}@test.local`;
const PASSWORD = "Website-Enroll-2026!";
const METHODS = [
  { name: "Easypaisa", method: "ONLINE", account: "0300-1234567 — Test Account" },
];
const WHATSAPP = "+923001234567";
const INSTRUCTIONS = "Pay the admission amount, then send the screenshot.";

let openCourse, closedCourse, draftCourse;
const createdUserIds = [];
const createdCourseIds = [];

async function setSettings(open) {
  const values = {
    admissionsOpen: String(open),
    admissionWhatsApp: WHATSAPP,
    admissionInstructions: INSTRUCTIONS,
    admissionPaymentMethods: JSON.stringify(METHODS),
    currency: "PKR",
    studentIdPrefix: "ISP",
  };
  for (const [key, value] of Object.entries(values))
    await db.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
}

async function makeCourse(label, data) {
  const course = await db.course.create({
    data: {
      title: `Enroll Test ${label} ${run}`,
      slug: `enroll-test-${label}-${run}`,
      status: "PUBLISHED",
      ...data,
    },
  });
  createdCourseIds.push(course.id);
  return course;
}

function payload(label, courseId) {
  return {
    fullName: `Test Student ${label}`,
    email: email(label),
    phone: "+92 300 1234567",
    password: PASSWORD,
    courseId,
  };
}

before(async () => {
  await setSettings(true);
  openCourse = await makeCourse("open", {
    admissionsOpen: true,
    defaultFee: 20000,
    admissionPayment: 5000,
  });
  closedCourse = await makeCourse("closed", {
    admissionsOpen: false,
    defaultFee: 20000,
    admissionPayment: 5000,
  });
  draftCourse = await makeCourse("draft", {
    status: "DRAFT",
    admissionsOpen: true,
    defaultFee: 20000,
    admissionPayment: 5000,
  });
});

after(async () => {
  await db.emailOutbox.deleteMany({
    where: { recipient: { contains: run } },
  });
  await db.admission.deleteMany({
    where: { userId: { in: createdUserIds } },
  });
  await db.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
  await db.student.deleteMany({ where: { userId: { in: createdUserIds } } });
  await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await db.course.deleteMany({ where: { id: { in: createdCourseIds } } });
  await db.setting.deleteMany({
    where: {
      key: {
        in: [
          "admissionsOpen",
          "admissionWhatsApp",
          "admissionInstructions",
          "admissionPaymentMethods",
        ],
      },
    },
  });
  await db.$disconnect();
});

describe("websiteEnrollCourses", () => {
  it("lists only eligible courses while admissions are open", async () => {
    await setSettings(true);
    const res = await enroll.websiteEnrollCourses();
    assert.equal(res.admissionsOpen, true);
    assert.equal(res.currency, "PKR");
    const ids = res.courses.map((x) => x.id);
    assert.ok(ids.includes(openCourse.id));
    assert.ok(!ids.includes(closedCourse.id));
    assert.ok(!ids.includes(draftCourse.id));
    const listed = res.courses.find((x) => x.id === openCourse.id);
    assert.equal(listed.name, openCourse.title);
    assert.equal(listed.requiredPayment, 5000);
  });

  it("reports closed with an empty list when admissions are closed", async () => {
    await setSettings(false);
    const res = await enroll.websiteEnrollCourses();
    assert.equal(res.admissionsOpen, false);
    assert.deepEqual(res.courses, []);
    await setSettings(true);
  });
});

describe("submitWebsiteEnrollment validation", () => {
  it("rejects a malformed email with the shared message", async () => {
    const res = await enroll.submitWebsiteEnrollment(
      { ...payload("bademail", openCourse.id), email: "not-an-email" },
      `validation-${run}`,
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Valid email required");
  });

  it("rejects a weak password with the shared policy message", async () => {
    const res = await enroll.submitWebsiteEnrollment(
      { ...payload("weakpw", openCourse.id), password: "short" },
      `validation-${run}`,
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Use at least 12 characters");
  });

  it("rejects a missing course choice", async () => {
    const res = await enroll.submitWebsiteEnrollment(
      { ...payload("nocourse", openCourse.id), courseId: "" },
      `validation-${run}`,
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Choose a course");
  });
});

describe("submitWebsiteEnrollment outcomes", () => {
  it("creates verified User + Student + PENDING Admission and returns payment details", async () => {
    const input = payload("success", openCourse.id);
    const res = await enroll.submitWebsiteEnrollment(input, `success-${run}`);
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.courseName, openCourse.title);
    assert.match(res.body.applicationId, /^ISP-/);
    assert.deepEqual(res.body.payment.methods, METHODS);
    assert.equal(res.body.payment.instructions, INSTRUCTIONS);
    assert.equal(res.body.payment.whatsapp, WHATSAPP);
    assert.equal(res.body.payment.requiredPayment, 5000);
    assert.equal(res.body.payment.totalFee, 20000);
    assert.equal(res.body.payment.currency, "PKR");
    assert.ok(res.body.payment.whatsappUrl.startsWith("https://wa.me/923001234567"));

    const user = await db.user.findUnique({
      where: { email: input.email },
      include: { student: true, admissions: true },
    });
    assert.ok(user);
    createdUserIds.push(user.id);
    assert.equal(user.role, "STUDENT");
    assert.equal(user.admissionRequired, true);
    assert.ok(user.emailVerifiedAt, "email must be pre-verified");
    assert.equal(user.student.fullName, input.fullName);
    assert.equal(user.student.phone, input.phone);
    assert.equal(user.student.whatsapp, input.phone);
    assert.equal(user.student.status, "ON_HOLD");
    assert.ok(user.student.studentId);
    assert.equal(user.admissions.length, 1);
    const app = user.admissions[0];
    assert.equal(app.status, "PENDING");
    assert.equal(app.courseId, openCourse.id);
    assert.equal(app.totalFee, 20000);
    assert.equal(app.requiredPayment, 5000);
    // No email-verification token is issued in the website flow.
    assert.equal(
      await db.authToken.count({ where: { userId: user.id } }),
      0,
    );
    // The "application received" email is queued, as in the LMS flow.
    const queued = await db.emailOutbox.findUnique({
      where: { dedupeKey: `submitted:${app.id}` },
    });
    assert.ok(queued);
    assert.equal(queued.recipient, input.email);
    assert.equal(queued.subject, "iSkillSpot application received");
  });

  it("rejects a duplicate email with 409", async () => {
    const input = payload("success", openCourse.id); // same email as above
    const res = await enroll.submitWebsiteEnrollment(input, `dup-${run}`);
    assert.equal(res.status, 409);
    assert.match(res.body.error, /already registered/);
  });

  it("rejects a course that is not accepting admissions", async () => {
    const res = await enroll.submitWebsiteEnrollment(
      payload("closedcourse", closedCourse.id),
      `closed-course-${run}`,
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "This course is not accepting admissions.");
    assert.equal(
      await db.user.count({
        where: { email: email("closedcourse") },
      }),
      0,
    );
  });

  it("rejects submissions while admissions are closed", async () => {
    await setSettings(false);
    try {
      const res = await enroll.submitWebsiteEnrollment(
        payload("whileclosed", openCourse.id),
        `while-closed-${run}`,
      );
      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Public admissions are currently closed.");
      assert.equal(
        await db.user.count({ where: { email: email("whileclosed") } }),
        0,
      );
    } finally {
      await setSettings(true);
    }
  });

  it("throttles the 9th submission from the same source (429)", async () => {
    const source = `throttle-${run}`;
    for (let i = 1; i <= 8; i++) {
      const res = await enroll.submitWebsiteEnrollment(
        payload(`throttle${i}`, openCourse.id),
        source,
      );
      assert.equal(res.status, 201, `attempt ${i} should succeed`);
      const user = await db.user.findUnique({
        where: { email: email(`throttle${i}`) },
        select: { id: true },
      });
      createdUserIds.push(user.id);
    }
    const ninth = await enroll.submitWebsiteEnrollment(
      payload("throttle9", openCourse.id),
      source,
    );
    assert.equal(ninth.status, 429);
    assert.match(ninth.body.error, /Too many attempts/);
    assert.equal(
      await db.user.count({ where: { email: email("throttle9") } }),
      0,
    );
  });
});

describe("approval confirmation email", () => {
  it("names the sign-in email and links to the portal login", async () => {
    const recipient = email("confirm");
    await db.$transaction(async (tx) => {
      await admissions.queueAdmissionConfirmation(
        tx,
        `appt-${run}`,
        recipient,
        "Test Student",
        "Graphic Design",
        "Batch 01",
      );
    });
    const row = await db.emailOutbox.findUnique({
      where: { dedupeKey: `approved:appt-${run}:initial` },
    });
    assert.ok(row);
    assert.equal(row.subject, "Your iSkillSpot admission is confirmed");
    const html = emailLib.decryptEmail(row.encryptedBody);
    assert.ok(html.includes(`Sign-in email: ${recipient}`));
    assert.ok(html.includes("http://localhost:3000/login"));
    assert.ok(html.includes("Sign In to Student Portal"));
    await db.emailOutbox.delete({ where: { id: row.id } });
  });
});
