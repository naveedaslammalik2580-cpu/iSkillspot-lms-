const { PrismaClient } = require("@prisma/client");
const assert = require("node:assert/strict");
exports.prepare = async function (connection) {
  const url = new URL(connection);
  assert.ok(
    url.hostname === "127.0.0.1" &&
      url.pathname.startsWith("/iskillspot_auth_test_") &&
      url.pathname.endsWith("_admissions_upgrade"),
  );
  const db = new PrismaClient({ datasourceUrl: connection, log: [] });
  const models = [
    "user",
    "student",
    "course",
    "batch",
    "enrollment",
    "fee",
    "payment",
    "admission",
    "emailOutbox",
    "module",
    "lesson",
    "lessonProgress",
    "assignment",
    "assignmentSubmission",
    "attendance",
    "grade",
    "certificate",
    "notification",
  ];
  const snapshot = async () => {
    const result = {};
    for (const model of models)
      result[model] = await db[model].findMany({ orderBy: { id: "asc" } });
    result.tokens =
      await db.$queryRaw`SELECT id,"userId",digest,purpose,version,"expiresAt","usedAt","createdAt" FROM "AuthToken" ORDER BY id`;
    return JSON.stringify(result);
  };
  try {
    const course = await db.course.create({
      data: {
        title: "Upgrade Fixture",
        slug: "upgrade-fixture",
        status: "PUBLISHED",
        defaultFee: 500,
        admissionsOpen: true,
        admissionPayment: 100,
      },
    });
    const batch = await db.batch.create({
      data: {
        courseId: course.id,
        name: "Existing batch",
        code: "UPGRADE-BATCH",
      },
    });
    const user = await db.user.create({
      data: {
        username: "upgrade.student",
        email: "upgrade@example.invalid",
        passwordHash: "preserved-upgrade-fixture-hash",
        role: "STUDENT",
        emailVerifiedAt: new Date(),
        student: {
          create: { studentId: "UPGRADE-001", fullName: "Existing Student" },
        },
      },
      include: { student: true },
    });
    const pending = await db.user.create({
      data: {
        username: "upgrade.pending",
        email: "pending-upgrade@example.invalid",
        passwordHash: "preserved-pending-fixture-hash",
        role: "STUDENT",
        admissionRequired: true,
        emailVerifiedAt: new Date(),
        student: {
          create: {
            studentId: "UPGRADE-002",
            fullName: "Pending Student",
            status: "ON_HOLD",
          },
        },
      },
    });
    const studentId = user.student.id;
    await db.enrollment.create({
      data: {
        studentId,
        courseId: course.id,
        batchId: batch.id,
        progress: 40,
        accessSuspended: true,
      },
    });
    const fee = await db.fee.create({
      data: {
        studentId,
        courseId: course.id,
        totalFee: 500,
        finalFee: 500,
        amountPaid: 100,
        remainingBalance: 400,
        status: "PARTIAL",
      },
    });
    const payment = await db.payment.create({
      data: {
        studentId,
        feeId: fee.id,
        amount: 100,
        transactionReference: "UPGRADE-TXN",
        referenceKey: "UPGRADE-TXN",
      },
    });
    await db.admission.create({
      data: {
        applicationId: "UPGRADE-APPROVED",
        userId: user.id,
        courseId: course.id,
        batchId: batch.id,
        status: "APPROVED",
        totalFee: 500,
        requiredPayment: 100,
        paymentId: payment.id,
        installmentApproved: true,
      },
    });
    await db.admission.create({
      data: {
        applicationId: "UPGRADE-PENDING",
        userId: pending.id,
        courseId: course.id,
        status: "PENDING",
        totalFee: 500,
        requiredPayment: 100,
      },
    });
    await db.emailOutbox.create({
      data: {
        dedupeKey: "upgrade-existing-mail",
        recipient: user.email,
        subject: "Existing approval",
        encryptedBody: "existing-encrypted-fixture-content",
        status: "FAILED",
        attempts: 1,
      },
    });
    const module = await db.module.create({
      data: { courseId: course.id, title: "Existing module" },
    });
    const lesson = await db.lesson.create({
      data: {
        moduleId: module.id,
        title: "Existing lesson",
        isPublished: true,
      },
    });
    await db.lessonProgress.create({
      data: { studentId, lessonId: lesson.id, completed: true },
    });
    const assignment = await db.assignment.create({
      data: { courseId: course.id, title: "Existing assignment" },
    });
    await db.assignmentSubmission.create({
      data: {
        studentId,
        assignmentId: assignment.id,
        status: "GRADED",
        score: 80,
        submissionText: "Existing work",
      },
    });
    await db.attendance.create({
      data: {
        studentId,
        batchId: batch.id,
        date: new Date("2026-11-01"),
        status: "PRESENT",
      },
    });
    await db.grade.create({
      data: {
        studentId,
        courseId: course.id,
        type: "ASSIGNMENT",
        title: "Existing grade",
        score: 80,
        percentage: 80,
      },
    });
    await db.certificate.create({
      data: {
        studentId,
        courseId: course.id,
        certificateNumber: "UPGRADE-CERT",
        verificationCode: "UPGRADE-VERIFY",
      },
    });
    await db.notification.create({
      data: {
        userId: user.id,
        title: "Existing notice",
        message: "Preserve this record",
      },
    });
    await db.$executeRaw`INSERT INTO "AuthToken"(id,"userId",digest,purpose,version,"expiresAt") VALUES('upgrade-existing-token',${user.id},'upgrade-digest','RESET_PASSWORD',${user.sessionVersion},CURRENT_TIMESTAMP+INTERVAL '30 minutes')`;
    const before = await snapshot();
    return async function verify() {
      try {
        assert.equal(
          await snapshot(),
          before,
          "Existing PR #6 accounts, admissions, access flags, queue and academic records changed",
        );
        assert.equal(
          (
            await db.authToken.findUnique({
              where: { id: "upgrade-existing-token" },
            })
          ).requestedById,
          null,
        );
        assert.equal(await db.passwordResetToken.count(), 0);
      } finally {
        await db.$disconnect();
      }
    };
  } catch (e) {
    await db.$disconnect();
    throw e;
  }
};
