const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { spawn } = require("node:child_process");
const net = require("node:net");
const { PrismaClient } = require("@prisma/client");
const { context } = require("./source-loader.cjs");
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  process.env.AUTH_TEST_ISOLATED !== "1" ||
  url.hostname !== "127.0.0.1" ||
  !url.pathname.startsWith("/iskillspot_auth_test_")
)
  throw new Error("Disposable runner database required");
const db = new PrismaClient({ log: [] }),
  c = context(db),
  service = c.load("src/lib/admissions.ts"),
  mail = c.load("src/lib/email.ts");
const policy = c.load("src/lib/admission-policy.ts"),
  pw = c.load("src/lib/auth/password.ts");
let passed = 0,
  step = "setup";
async function check(name, work) {
  step = name;
  await work();
  passed++;
  console.log("PASS:", name);
}
const secret = () => "Zp8!" + randomBytes(16).toString("hex");
const form = (o) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, String(v));
  return f;
};
const redirected = (promise, target) =>
  assert.rejects(promise, (e) => e.digest?.split(";")[2] === target);
const payload = (u) => ({
  userId: u.id,
  username: u.username,
  role: u.role,
  sessionVersion: u.sessionVersion,
  mustChangePassword: false,
});
async function tokenFor(userId, purpose = "VERIFY_EMAIL") {
  const row = await db.emailOutbox.findFirst({
    where: {
      dedupeKey: { startsWith: "token:" },
      recipient: (await db.user.findUniqueOrThrow({ where: { id: userId } }))
        .email,
    },
    orderBy: { createdAt: "desc" },
  });
  const html = mail.decryptEmail(row.encryptedBody);
  const raw = html.match(/token=([A-Za-z0-9_-]{43})/)[1];
  assert.ok(await db.authToken.findFirst({ where: { userId, purpose } }));
  return raw;
}
async function register(email) {
  const password = secret();
  await service.registerStudent({
    fullName: "Admission Test Student",
    email,
    phone: "+923001234567",
    password,
    confirmPassword: password,
  });
  return {
    user: await db.user.findUniqueOrThrow({
      where: { email },
      include: { student: true, admissions: true },
    }),
    password,
  };
}
async function freePort() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}

(async () => {
  try {
    await db.authThrottle.updateMany({ data: { expiresAt: new Date(0) } });
    for (const [key, value] of Object.entries({
      admissionsOpen: "true",
      admissionWhatsApp: "+923001234567",
      admissionPaymentMethods: JSON.stringify([
        {
          name: "Fixture Bank",
          method: "BANK_TRANSFER",
          account: "Fixture account 0000",
        },
      ]),
      admissionInstructions: "Pay only to the official account.",
    }))
      await db.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    const course = await db.course.create({
      data: {
        title: "Admission Fixture Course",
        slug: "admission-fixture",
        status: "PUBLISHED",
        defaultFee: 10000,
        admissionPayment: 3000,
        admissionsOpen: true,
      },
    });
    const batch = await db.batch.create({
      data: {
        name: "Admission Fixture Batch",
        code: "ADMIT-FIXTURE",
        courseId: course.id,
      },
    });
    const unrelated = await db.course.create({
      data: {
        title: "Unrelated Private Course",
        slug: "admission-unrelated",
        status: "PUBLISHED",
        defaultFee: 6000,
        admissionPayment: 2000,
        admissionsOpen: true,
      },
    });
    const otherBatch = await db.batch.create({
      data: {
        name: "Other Batch",
        code: "ADMIT-OTHER",
        courseId: unrelated.id,
      },
    });
    const module = await db.module.create({
      data: { courseId: course.id, title: "Fixture module" },
    });
    const lesson = await db.lesson.create({
      data: { moduleId: module.id, title: "Fixture lesson", isPublished: true },
    });
    const resource = await db.lessonResource.create({
      data: {
        lessonId: lesson.id,
        title: "Fixture resource",
        fileUrl: "https://example.invalid/resource",
      },
    });
    const admin = await db.user.create({
      data: {
        username: "admit.admin",
        email: "admit-admin@example.invalid",
        passwordHash: await pw.hashPassword(secret()),
        role: "ADMIN",
      },
    });
    const adminSession = payload(admin),
      staff = context(db);
    await staff.load("src/lib/auth/session.ts").createSession(adminSession);
    let applicant;
    await check(
      "weak/common/unsupported/mismatched passwords rejected without creating an account",
      async () => {
        for (const password of [
          "weak",
          "Password123!",
          "Qwerty123456!",
          "Aa8!" + String.fromCharCode(0) + "LongLong",
          "Aa8!" + "é".repeat(40),
        ])
          await assert.rejects(
            service.registerStudent({
              fullName: "Fixture",
              email: "weak-admit@example.invalid",
              phone: "+923001234567",
              password,
              confirmPassword: password,
            }),
          );
        const password = secret();
        await assert.rejects(
          service.registerStudent({
            fullName: "Fixture",
            email: "weak-admit@example.invalid",
            phone: "+923001234567",
            password,
            confirmPassword: secret(),
          }),
        );
        assert.equal(
          await db.user.count({
            where: { email: "weak-admit@example.invalid" },
          }),
          0,
        );
      },
    );
    await check(
      "registration creates only STUDENT, restricted account, one profile, random application and bcrypt hash",
      async () => {
        applicant = await register("admit-student@example.invalid");
        const u = applicant.user;
        assert.equal(u.role, "STUDENT");
        assert.equal(u.admissionRequired, true);
        assert.equal(u.student.status, "ON_HOLD");
        assert.equal(u.admissions.length, 1);
        assert.match(u.admissions[0].applicationId, /^ISP-[A-F0-9]{16}$/);
        assert.ok(await pw.verifyPassword(applicant.password, u.passwordHash));
        assert.equal(
          await db.enrollment.count({ where: { studentId: u.student.id } }),
          0,
        );
      },
    );
    await check(
      "duplicate registration is generic and cannot overwrite password or role",
      async () => {
        const password = secret();
        await service.registerStudent({
          fullName: "Attacker",
          email: "ADMIT-STUDENT@EXAMPLE.INVALID",
          phone: "+923001234567",
          password,
          confirmPassword: password,
          role: "SUPER_ADMIN",
        });
        assert.equal(
          await db.user.count({
            where: { email: "admit-student@example.invalid" },
          }),
          1,
        );
        assert.equal(
          (await db.user.findUnique({ where: { id: applicant.user.id } }))
            .passwordHash,
          applicant.user.passwordHash,
        );
      },
    );
    const pending = context(db);
    await pending
      .load("src/lib/auth/session.ts")
      .createSession(payload(applicant.user));
    await check(
      "pending sessions resume but backend academic and resource access are restricted",
      async () => {
        assert.ok(await pending.load("src/lib/auth/session.ts").getSession());
        await redirected(
          pending.load("src/lib/auth/guards.ts").requireStudentSelf(),
          "/admission",
        );
        await redirected(
          pending
            .load("src/lib/actions/learning.ts")
            .getLessonResourceAccess(resource.id),
          "/admission",
        );
        await assert.rejects(
          service.selectAdmissionCourse(
            payload(applicant.user),
            applicant.user.admissions[0].id,
            course.id,
          ),
        );
      },
    );
    await check(
      "verification token stored only as digest, cooldown, invalid/expired/reused tokens rejected",
      async () => {
        const raw = await tokenFor(applicant.user.id);
        assert.equal(await db.authToken.count({ where: { digest: raw } }), 0);
        const before = await db.authToken.count({
          where: { userId: applicant.user.id },
        });
        await service.requestAuthEmail(applicant.user.email, "VERIFY_EMAIL");
        assert.equal(
          await db.authToken.count({ where: { userId: applicant.user.id } }),
          before,
        );
        await assert.rejects(
          service.consumeAuthToken("invalid", "VERIFY_EMAIL"),
        );
        await db.authToken.updateMany({
          where: { userId: applicant.user.id },
          data: { expiresAt: new Date(0) },
        });
        await assert.rejects(service.consumeAuthToken(raw, "VERIFY_EMAIL"));
        await db.$transaction((tx) =>
          service.issueAuthToken(tx, applicant.user, "VERIFY_EMAIL"),
        );
        const fresh = await tokenFor(applicant.user.id);
        await service.consumeAuthToken(fresh, "VERIFY_EMAIL");
        await assert.rejects(service.consumeAuthToken(fresh, "VERIFY_EMAIL"));
        assert.ok(
          (await db.user.findUnique({ where: { id: applicant.user.id } }))
            .emailVerifiedAt,
        );
      },
    );
    await check(
      "database course fees selected, forged batch rejected, payment instructions and WhatsApp accurate",
      async () => {
        const id = applicant.user.admissions[0].id;
        await assert.rejects(
          service.selectAdmissionCourse(
            payload(applicant.user),
            id,
            course.id,
            otherBatch.id,
          ),
        );
        await service.selectAdmissionCourse(
          payload(applicant.user),
          id,
          course.id,
          batch.id,
        );
        const app = await db.admission.findUnique({ where: { id } });
        assert.equal(app.totalFee, 10000);
        assert.equal(app.requiredPayment, 3000);
        assert.equal(app.status, "PENDING");
        const settings = await service.admissionSettings();
        assert.equal(settings.methods[0].account, "Fixture account 0000");
        const wa = new URL(
          policy.whatsappUrl(
            settings.whatsapp,
            "Fixture Student",
            app.applicationId,
            course.title,
          ),
        );
        assert.ok(wa.searchParams.get("text").includes(app.applicationId));
        assert.ok(wa.searchParams.get("text").includes(course.title));
        assert.equal(policy.whatsappUrl("invalid", "", "", ""), null);
      },
    );
    const approval = {
      id: applicant.user.admissions[0].id,
      courseId: course.id,
      batchId: batch.id,
      amount: 3000,
      method: "BANK_TRANSFER",
      reference: "ADMISSION-TXN-001",
      verified: true,
      installments: true,
    };
    await check(
      "student and teacher cannot approve; unverified payment and insufficient installments rejected",
      async () => {
        await assert.rejects(
          service.approveAdmission(payload(applicant.user), approval),
        );
        const teacher = await db.user.findFirstOrThrow({
          where: { role: "TEACHER" },
        });
        await assert.rejects(
          service.approveAdmission(payload(teacher), approval),
        );
        for (const override of [
          { verified: false },
          { amount: 2999 },
          { installments: false },
          { batchId: otherBatch.id },
        ])
          await assert.rejects(
            service.approveAdmission(adminSession, {
              ...approval,
              ...override,
            }),
          );
        assert.equal(
          await db.payment.count({
            where: { studentId: applicant.user.student.id },
          }),
          0,
        );
      },
    );
    await check(
      "concurrent approval creates exactly one payment, fee, enrollment and audit; account activates",
      async () => {
        const result = await Promise.allSettled([
          service.approveAdmission(adminSession, approval),
          service.approveAdmission(adminSession, approval),
        ]);
        assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
        const sid = applicant.user.student.id;
        assert.equal(await db.payment.count({ where: { studentId: sid } }), 1);
        assert.equal(
          await db.enrollment.count({ where: { studentId: sid } }),
          1,
        );
        const fee = await db.fee.findFirst({ where: { studentId: sid } });
        assert.equal(fee.amountPaid, 3000);
        assert.equal(fee.remainingBalance, 7000);
        assert.equal(fee.status, "PARTIAL");
        assert.equal(
          (await db.user.findUnique({ where: { id: applicant.user.id } }))
            .admissionRequired,
          false,
        );
        assert.equal(
          await db.auditLog.count({
            where: {
              entityId: approval.id,
              action: "Admission approved; transaction manually verified",
            },
          }),
          1,
        );
      },
    );
    await check(
      "branded confirmation uses official login, no password; email failure preserves approval and resend queues",
      async () => {
        const out = await db.emailOutbox.findUnique({
            where: { dedupeKey: `approved:${approval.id}:initial` },
          }),
          html = mail.decryptEmail(out.encryptedBody);
        assert.ok(html.includes("Sign In to Student Portal"));
        assert.ok(html.includes("https://lms.example.invalid/login"));
        assert.ok(html.includes(batch.name));
        assert.ok(!html.includes(applicant.password));
        const delivery = await mail.deliverEmails(20);
        assert.ok(delivery.failed > 0);
        assert.equal(
          (await db.admission.findUnique({ where: { id: approval.id } }))
            .status,
          "APPROVED",
        );
        const res = await staff
          .load("src/lib/actions/admissions.ts")
          .resendAdmissionAction({}, form({ id: approval.id }));
        assert.equal(res.ok, true);
        assert.equal(
          await db.emailOutbox.count({
            where: { dedupeKey: { startsWith: `approved:${approval.id}:` } },
          }),
          2,
        );
      },
    );
    await check(
      "approved student sees only enrolled course; suspension removes academic, financial, notification access and restores safely",
      async () => {
        const sid = applicant.user.student.id,
          learning = c.load("src/lib/data/learning.ts");
        assert.equal((await learning.getStudentCourses(sid)).length, 1);
        assert.equal(await learning.getStudentCourse(sid, unrelated.id), null);
        assert.ok(await learning.getStudentLesson(sid, lesson.id));
        await db.notification.create({
          data: {
            userId: applicant.user.id,
            title: "Fixture course notice",
            message: "Fixture",
            type: "LESSON",
            linkUrl: `/student/courses/${course.id}`,
          },
        });
        const enrollment = await db.enrollment.findFirst({
          where: { studentId: sid },
        });
        await staff
          .load("src/lib/actions/admissions.ts")
          .setEnrollmentAccessAction(
            {},
            form({ id: enrollment.id, suspended: "true" }),
          );
        assert.equal((await learning.getStudentCourses(sid)).length, 0);
        assert.equal(await learning.getStudentLesson(sid, lesson.id), null);
        assert.equal(
          (await c.load("src/lib/data/fees.ts").getFeesForStudent(sid)).length,
          0,
        );
        assert.equal(
          (
            await c
              .load("src/lib/data/notifications.ts")
              .getRecentNotifications(applicant.user.id)
          ).filter((n) => n.type === "LESSON").length,
          0,
        );
        await staff
          .load("src/lib/actions/admissions.ts")
          .setEnrollmentAccessAction(
            {},
            form({ id: enrollment.id, suspended: "false" }),
          );
        assert.equal((await learning.getStudentCourses(sid)).length, 1);
        assert.equal(await db.payment.count({ where: { studentId: sid } }), 1);
      },
    );
    await check(
      "duplicate transaction on a different application rolls back all financial and enrollment changes",
      async () => {
        const other = await register("admit-second@example.invalid");
        await service.consumeAuthToken(
          await tokenFor(other.user.id),
          "VERIFY_EMAIL",
        );
        await service.selectAdmissionCourse(
          payload(other.user),
          other.user.admissions[0].id,
          course.id,
        );
        await assert.rejects(
          service.approveAdmission(adminSession, {
            ...approval,
            id: other.user.admissions[0].id,
            reference: " admission-txn-001 ",
          }),
        );
        assert.equal(
          await db.fee.count({ where: { studentId: other.user.student.id } }),
          0,
        );
        assert.equal(
          await db.enrollment.count({
            where: { studentId: other.user.student.id },
          }),
          0,
        );
      },
    );
    await check(
      "same account supports another approved enrollment without a duplicate profile",
      async () => {
        await pending
          .load("src/lib/actions/admissions.ts")
          .newApplicationAction()
          .catch((e) => {
            assert.equal(e.digest?.split(";")[2], "/admission");
          });
        const app = await db.admission.findFirst({
          where: { userId: applicant.user.id, status: "DRAFT" },
        });
        await service.selectAdmissionCourse(
          payload(applicant.user),
          app.id,
          unrelated.id,
        );
        await service.approveAdmission(adminSession, {
          ...approval,
          id: app.id,
          courseId: unrelated.id,
          batchId: otherBatch.id,
          amount: 6000,
          reference: "ADMISSION-TXN-002",
          installments: false,
        });
        assert.equal(
          await db.student.count({ where: { userId: applicant.user.id } }),
          1,
        );
        assert.equal(
          await db.enrollment.count({
            where: { studentId: applicant.user.student.id },
          }),
          2,
        );
      },
    );
    await check(
      "information request and rejection persist reasons, queue email and keep pending account restricted",
      async () => {
        const other = await db.user.findUniqueOrThrow({
            where: { email: "admit-second@example.invalid" },
            include: { admissions: true },
          }),
          id = other.admissions[0].id;
        const action = staff.load(
          "src/lib/actions/admissions.ts",
        ).reviewAdmissionAction;
        assert.equal(
          (
            await action(
              {},
              form({
                id,
                decision: "INFORMATION_REQUESTED",
                note: "Please confirm the sender account.",
              }),
            )
          ).ok,
          true,
        );
        assert.equal(
          (await db.admission.findUnique({ where: { id } })).status,
          "INFORMATION_REQUESTED",
        );
        assert.equal(
          (
            await action(
              {},
              form({
                id,
                decision: "REJECTED",
                note: "Actual transaction could not be verified.",
              }),
            )
          ).ok,
          true,
        );
        const app = await db.admission.findUnique({ where: { id } });
        assert.equal(app.status, "REJECTED");
        assert.match(app.reviewNote, /could not/);
        assert.equal(
          (await db.user.findUnique({ where: { id: other.id } }))
            .admissionRequired,
          true,
        );
      },
    );
    await check(
      "audit failure rolls back payment, fee, enrollment and account activation atomically",
      async () => {
        const fixture = await register("admit-rollback@example.invalid");
        await service.consumeAuthToken(
          await tokenFor(fixture.user.id),
          "VERIFY_EMAIL",
        );
        const id = fixture.user.admissions[0].id;
        await service.selectAdmissionCourse(
          payload(fixture.user),
          id,
          course.id,
        );
        await db.$executeRawUnsafe(`CREATE FUNCTION admission_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='Admission approved; transaction manually verified' AND EXISTS (SELECT 1 FROM "Admission" a JOIN "User" u ON u.id=a."userId" WHERE a.id=NEW."entityId" AND u.email='admit-rollback@example.invalid') THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END $$`);
        await db.$executeRawUnsafe(
          'CREATE TRIGGER admission_test_audit_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION admission_test_audit_failure()',
        );
        try {
          await assert.rejects(
            service.approveAdmission(adminSession, {
              ...approval,
              id,
              reference: "ROLLBACK-TXN-001",
            }),
          );
          assert.equal(
            await db.payment.count({
              where: { studentId: fixture.user.student.id },
            }),
            0,
          );
          assert.equal(
            await db.fee.count({
              where: { studentId: fixture.user.student.id },
            }),
            0,
          );
          assert.equal(
            await db.enrollment.count({
              where: { studentId: fixture.user.student.id },
            }),
            0,
          );
          assert.equal(
            (await db.user.findUnique({ where: { id: fixture.user.id } }))
              .admissionRequired,
            true,
          );
        } finally {
          await db.$executeRawUnsafe(
            'DROP TRIGGER admission_test_audit_failure ON "AuditLog"',
          );
          await db.$executeRawUnsafe(
            "DROP FUNCTION admission_test_audit_failure()",
          );
        }
      },
    );
    await check(
      "recovery is generic, single-use, preserves pending restriction and revokes previous sessions",
      async () => {
        await service.requestAuthEmail(applicant.user.email, "RESET_PASSWORD");
        const raw = await tokenFor(applicant.user.id, "RESET_PASSWORD");
        const next = secret();
        await service.consumeAuthToken(raw, "RESET_PASSWORD", next);
        await assert.rejects(
          service.consumeAuthToken(raw, "RESET_PASSWORD", next),
        );
        assert.equal(
          await pending.load("src/lib/auth/session.ts").getSession(),
          null,
        );
        applicant.password = next;
        const before = await db.emailOutbox.count();
        await service.requestAuthEmail(
          "unknown@example.invalid",
          "RESET_PASSWORD",
        );
        assert.equal(await db.emailOutbox.count(), before);
      },
    );
    await check(
      "public registration throttles shared sources and account keys",
      async () => {
        const action = c.load("src/lib/actions/admissions.ts"),
          password = secret();
        let last;
        for (let i = 0; i < 9; i++)
          last = await action.registerStudentAction(
            {},
            form({
              fullName: "Fixture",
              email: applicant.user.email,
              phone: "+923001234567",
              password,
              confirmPassword: password,
            }),
          );
        assert.match(last.error, /Too many/);
      },
    );
    await check(
      "email provider adapter accepts an intercepted success, uses idempotency and clears encrypted body",
      async () => {
        // Transport contract test only. No external provider or real mailbox is contacted.
        const sender = context(db, {
          ...process.env,
          RESEND_API_KEY: "isolated-test-key",
          EMAIL_FROM: "Fixture <fixture@example.invalid>",
        }).load("src/lib/email.ts");
        const row = await db.$transaction((tx) =>
          sender.queueEmail(tx, {
            dedupeKey: "transport-fixture",
            recipient: "fixture@example.invalid",
            subject: "Fixture",
            html: "<p>Fixture</p>",
          }),
        );
        const original = global.fetch;
        let calls = 0;
        global.fetch = async (url, options) => {
          assert.equal(url, "https://api.resend.com/emails");
          assert.ok(options.headers["Idempotency-Key"]);
          assert.ok(JSON.parse(options.body).html);
          calls++;
          return new Response(JSON.stringify({ id: "fixture-provider-id" }), {
            status: 200,
          });
        };
        try {
          await sender.deliverEmails(50);
          assert.ok(calls > 0);
          const sent = await db.emailOutbox.findUnique({
            where: { id: row.id },
          });
          assert.equal(sent.status, "SENT");
          assert.equal(sent.encryptedBody, "");
        } finally {
          global.fetch = original;
        }
      },
    );
    // Isolated production server exercises real Next Server Actions, cookies and rendering.
    await db.authThrottle.updateMany({ data: { expiresAt: new Date(0) } });
    const port = await freePort(),
      origin = `http://localhost:${port}`;
    const server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--port",
        String(port),
        "--hostname",
        "127.0.0.1",
      ],
      {
        env: { ...process.env, NODE_ENV: "production" },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    server.stdout.resume();
    server.stderr.resume();
    let browser;
    try {
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(origin + "/login")).status === 200) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 250));
      }
      browser = await require("playwright").chromium.launch({
        channel: "msedge",
        headless: true,
      });
      const bc = await browser.newContext({
          viewport: { width: 390, height: 844 },
        }),
        page = await bc.newPage();
      let browserErrors = 0;
      page.on("pageerror", () => browserErrors++);
      let browserPassword, actionId;
      page.on("request", (request) => {
        if (request.headers()["next-action"])
          actionId = request.headers()["next-action"];
      });
      await check(
        "mobile registration validates password UI, public STUDENT-only form and email verification step",
        async () => {
          await page.goto(origin + "/register");
          assert.equal(await page.locator('select[name="role"]').count(), 0);
          await page.locator("#fullName").fill("Browser Admission Student");
          await page.locator("#email").fill("browser-admit@example.invalid");
          await page.locator("#phone").fill("+923001234567");
          const password = secret();
          browserPassword = password;
          await page.locator("#password").fill(password);
          await page.locator("#confirmPassword").fill(password);
          await page.getByRole("button", { name: "Show passwords" }).click();
          assert.equal(
            await page.locator("#password").getAttribute("type"),
            "text",
          );
          await page.getByRole("button", { name: "Hide passwords" }).click();
          await page.screenshot({
            path: ".auth-work/admissions/registration-mobile.png",
            fullPage: true,
          });
          await page
            .getByRole("button", { name: "Continue to email verification" })
            .click();
          await page
            .getByRole("heading", { name: "Check your inbox" })
            .waitFor();
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
            true,
          );
        },
      );
      let browserUser;
      await check(
        "browser verifies email, selects database course and sees official payment instructions",
        async () => {
          browserUser = await db.user.findUniqueOrThrow({
            where: { email: "browser-admit@example.invalid" },
            include: { student: true, admissions: true },
          });
          const raw = await tokenFor(browserUser.id);
          await page.goto(origin + "/verify-email?token=" + raw);
          await page
            .getByRole("button", { name: "Verify email and continue" })
            .click();
          await page.waitForURL(origin + "/admission");
          await page.locator("#courseId").selectOption(course.id);
          await page.locator("#batchId").selectOption(batch.id);
          await page
            .getByRole("button", { name: "Continue to payment instructions" })
            .click();
          await page
            .getByRole("heading", { name: "Payment instructions" })
            .waitFor();
          await page.screenshot({
            path: ".auth-work/admissions/payment-mobile.png",
            fullPage: true,
          });
          assert.ok(
            (
              await page
                .getByRole("link", {
                  name: "Send Payment Screenshot on WhatsApp",
                })
                .getAttribute("href")
            ).includes("wa.me/923001234567"),
          );
          await page.goto(origin + "/student/dashboard");
          await page.waitForURL(origin + "/admission");
          await page.goto(origin + "/login");
          await page.locator("#identifier").fill(browserUser.email);
          await page.locator("#password").fill(browserPassword);
          await page
            .getByRole("button", { name: "Sign in", exact: true })
            .click();
          await page.waitForURL(origin + "/admission");
          const api = await page.request.get(
            origin + "/api/lessons/resources?resourceId=" + resource.id,
            { maxRedirects: 0 },
          );
          assert.ok([307, 303].includes(api.status()));
          assert.equal(
            new URL(api.headers().location, origin).pathname,
            "/admission",
          );
        },
      );
      await check(
        "browser ADMIN review approves actual payment and student reaches enrolled dashboard",
        async () => {
          const ac = await browser.newContext(),
            ap = await ac.newPage(),
            adminPassword = secret();
          await db.user.update({
            where: { id: admin.id },
            data: { passwordHash: await pw.hashPassword(adminPassword) },
          });
          await ap.goto(origin + "/login");
          await ap.locator("#identifier").fill(admin.email);
          await ap.locator("#password").fill(adminPassword);
          await ap
            .getByRole("button", { name: "Sign in", exact: true })
            .click();
          await ap.waitForURL(origin + "/admin/dashboard");
          await ap.goto(
            origin + "/admin/admissions/" + browserUser.admissions[0].id,
          );
          await ap.locator("#batchId").selectOption(batch.id);
          await ap.locator("#amount").fill("10000");
          await ap.locator("#reference").fill("BROWSER-TXN-001");
          await ap.locator('[name="verified"]').check();
          await ap.screenshot({
            path: ".auth-work/admissions/review-desktop.png",
            fullPage: true,
          });
          await ap
            .getByRole("button", { name: "Save admission decision" })
            .click();
          await ap
            .getByRole("heading", { name: "Confirmation email", exact: true })
            .waitFor();
          await page.goto(origin + "/login");
          await page.locator("#identifier").fill(browserUser.email);
          await page.locator("#password").fill(browserPassword);
          await page
            .getByRole("button", { name: "Sign in", exact: true })
            .click();
          await page.waitForURL(origin + "/student/dashboard");
          await page.screenshot({
            path: ".auth-work/admissions/approved-dashboard-mobile.png",
            fullPage: true,
          });
          await page.goto(origin + "/student/courses");
          assert.ok(
            (await page.locator("main").innerText()).includes(course.title),
          );
          assert.ok(
            !(await page.locator("main").innerText()).includes(unrelated.title),
          );
          await page.goto(origin + "/student/courses/" + unrelated.id);
          assert.ok(
            (await page.locator("body").innerText()).match(/not found|404/i),
          );
          await ac.close();
        },
      );
      await check("forged cross-origin server action is rejected", async () => {
        assert.ok(actionId);
        const denied = await page.request.post(origin + "/admission", {
          headers: {
            origin: "https://forged.example.invalid",
            "next-action": actionId,
          },
          data: "[]",
        });
        assert.ok([403, 500].includes(denied.status()));
      });
      await check(
        "browser forms render without uncaught client errors",
        async () => {
          assert.equal(browserErrors, 0);
        },
      );
      await bc.close();
    } finally {
      if (browser) await browser.close();
      server.kill();
    }
    console.log("Admissions integration/browser checks passed:", passed);
  } catch (e) {
    console.error("FAILED:", step, "error:", e.message);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
})();
