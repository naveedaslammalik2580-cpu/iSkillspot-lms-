import { issueAuthToken } from "@/lib/auth/tokens";
export {
  issueAuthToken,
  requestAuthEmail,
  consumeAuthToken,
} from "@/lib/auth/tokens";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { strongPassword, hashPassword } from "@/lib/auth/password";
import {
  emailSchema,
  assertIdentityAvailable,
  AccountError,
} from "@/lib/auth/identity";
import { generateStudentId } from "@/lib/ids";
import { logAction } from "@/lib/audit";
import { queueEmail, emailTemplate } from "@/lib/email";
import { authorizeActor } from "@/lib/auth/account-policy";
import type { SessionPayload } from "@/lib/auth/token";
import {
  paymentReferenceKey,
  validMoney,
  paymentMethodsSchema,
} from "@/lib/admission-policy";
import { recomputeFeeStatus } from "@/lib/actions/fees";
import { assertPaymentReferenceUnused } from "@/lib/payment-reference";

export const registrationSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(120),
    email: emailSchema,
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{8,25}$/, "Enter a valid phone number"),
    password: strongPassword,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export async function admissionSettings(tx: Prisma.TransactionClient = db) {
  const rows = await tx.setting.findMany({
    where: {
      key: {
        in: [
          "admissionsOpen",
          "admissionWhatsApp",
          "admissionInstructions",
          "admissionPaymentMethods",
          "currency",
        ],
      },
    },
  });
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  let methods: z.infer<typeof paymentMethodsSchema> = [];
  try {
    methods = paymentMethodsSchema.parse(
      JSON.parse(s.admissionPaymentMethods || "[]"),
    );
  } catch {
    /* Closed until configured. */
  }
  return {
    open: s.admissionsOpen === "true",
    whatsapp: s.admissionWhatsApp || "",
    instructions: s.admissionInstructions || "",
    methods,
    currency: s.currency || "PKR",
  };
}

export async function registerStudent(
  input: z.infer<typeof registrationSchema>,
) {
  const d = registrationSchema.parse(input);
  // Hash even duplicate submissions to reduce account-existence timing differences.
  const passwordHash = await hashPassword(d.password);
  return db.$transaction(async (tx) => {
    if (!(await admissionSettings(tx)).open)
      throw new AccountError("Public admissions are currently closed.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(752091, 3)`;
    if (
      await tx.user.findFirst({
        where: { email: { equals: d.email, mode: "insensitive" } },
      })
    )
      return;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(752091, 2)`;
    const studentId = await generateStudentId(tx);
    const username = `student.${randomBytes(12).toString("hex")}`;
    await assertIdentityAvailable(tx, d.email, username);
    const user = await tx.user.create({
      data: {
        email: d.email,
        username,
        passwordHash,
        role: "STUDENT",
        admissionRequired: true,
        student: {
          create: {
            studentId,
            fullName: d.fullName,
            phone: d.phone,
            whatsapp: d.phone,
            email: d.email,
            status: "ON_HOLD",
          },
        },
      },
    });
    const application = await tx.admission.create({
      data: {
        userId: user.id,
        applicationId: `ISP-${randomBytes(8).toString("hex").toUpperCase()}`,
      },
    });
    await issueAuthToken(tx, user, "VERIFY_EMAIL");
    await logAction(
      {
        userId: user.id,
        action: "Student registered; verification required",
        entity: "Admission",
        entityId: application.id,
      },
      tx,
    );
  });
}

export async function selectAdmissionCourse(
  session: SessionPayload,
  applicationId: string,
  courseId: string,
  batchId?: string,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${session.userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: session.userId },
    });
    if (
      user.role !== "STUDENT" ||
      user.status !== "ACTIVE" ||
      user.sessionVersion !== session.sessionVersion ||
      !user.emailVerifiedAt
    )
      throw new AccountError("Verify your email first.");
    const app = await tx.admission.findFirst({
      where: {
        id: applicationId,
        userId: user.id,
        status: { in: ["DRAFT", "INFORMATION_REQUESTED"] },
      },
    });
    if (!app) throw new AccountError("This application cannot be changed.");
    const settings = await admissionSettings(tx);
    if (!settings.open || !settings.methods.length || !settings.whatsapp)
      throw new AccountError(
        "Admissions are unavailable. Contact the institute.",
      );
    const course = await tx.course.findFirst({
      where: { id: courseId, status: "PUBLISHED", admissionsOpen: true },
    });
    if (
      !course ||
      course.defaultFee == null ||
      !validMoney(course.defaultFee) ||
      course.admissionPayment == null ||
      !validMoney(course.admissionPayment) ||
      course.admissionPayment > course.defaultFee
    )
      throw new AccountError("This course is not accepting admissions.");
    if (
      batchId &&
      !(await tx.batch.findFirst({
        where: {
          id: batchId,
          courseId,
          status: { in: ["UPCOMING", "ONGOING"] },
        },
      }))
    )
      throw new AccountError("Choose an available batch.");
    if (
      (await tx.admission.findFirst({
        where: {
          id: { not: app.id },
          userId: user.id,
          courseId,
          status: { in: ["PENDING", "INFORMATION_REQUESTED", "APPROVED"] },
        },
      })) ||
      (await tx.enrollment.findFirst({
        where: {
          student: { userId: user.id },
          courseId,
          status: { in: ["ACTIVE", "COMPLETED"] },
        },
      }))
    )
      throw new AccountError(
        "You already have an application or enrollment for this course.",
      );
    await tx.admission.update({
      where: { id: app.id },
      data: {
        courseId,
        batchId: batchId || null,
        status: "PENDING",
        totalFee: course.defaultFee,
        requiredPayment: course.admissionPayment,
      },
    });
    await queueEmail(tx, {
      dedupeKey: `submitted:${app.id}`,
      recipient: user.email,
      subject: "iSkillSpot application received",
      html: emailTemplate(
        user.username,
        "Application received",
        `Application ${app.applicationId}\nCourse: ${course.title}\nYour admission is awaiting payment verification and admin approval.`,
        "View Admission Status",
        "/admission",
      ),
    });
    await logAction(
      {
        userId: user.id,
        action: "Admission application submitted",
        entity: "Admission",
        entityId: app.id,
      },
      tx,
    );
  });
}

export const approvalSchema = z.object({
  id: z.string().min(1),
  courseId: z.string().min(1),
  batchId: z.string().min(1),
  amount: z.coerce.number().refine(validMoney, "Enter a valid amount"),
  method: z.enum([
    "CASH",
    "BANK_TRANSFER",
    "CHEQUE",
    "CARD",
    "ONLINE",
    "OTHER",
  ]),
  reference: z
    .string()
    .trim()
    .min(3, "Enter the verified transaction reference")
    .max(200),
  verified: z.literal(true, {
    errorMap: () => ({
      message: "Verify the actual transaction before approval",
    }),
  }),
  installments: z.boolean(),
});

export async function approveAdmission(
  session: SessionPayload,
  input: z.infer<typeof approvalSchema>,
) {
  const d = approvalSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      await authorizeActor(tx, session, "student.create");
      // Serialize approvals with all payment write paths, including legacy payments.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(752091, 9)`;
      await tx.$queryRaw`SELECT id FROM "Admission" WHERE id=${d.id} FOR UPDATE`;
      const app = await tx.admission.findUniqueOrThrow({
        where: { id: d.id },
        include: { user: { include: { student: true } } },
      });
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${app.userId} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: app.userId },
        include: { student: true },
      });
      if (
        !["PENDING", "INFORMATION_REQUESTED"].includes(app.status) ||
        app.paymentId
      )
        throw new AccountError("This application has already been reviewed.");
      if (
        user.role !== "STUDENT" ||
        !user.emailVerifiedAt ||
        user.status !== "ACTIVE" ||
        !user.student ||
        ["SUSPENDED", "DROPPED"].includes(user.student.status)
      )
        throw new AccountError(
          "An active student with a verified email is required.",
        );
      const batch = await tx.batch.findFirst({
        where: {
          id: d.batchId,
          courseId: d.courseId,
          status: { in: ["UPCOMING", "ONGOING"] },
        },
        include: { course: true },
      });
      if (
        !batch ||
        batch.course.status !== "PUBLISHED" ||
        !batch.course.admissionsOpen
      )
        throw new AccountError(
          "Confirm an available course and matching batch.",
        );
      // Course changes are explicit and use the current database fee; unchanged selections retain the quoted fee.
      const total =
        app.courseId === d.courseId ? app.totalFee : batch.course.defaultFee;
      const required =
        app.courseId === d.courseId
          ? app.requiredPayment
          : batch.course.admissionPayment;
      if (
        total == null ||
        required == null ||
        !validMoney(total) ||
        !validMoney(required) ||
        required > total ||
        d.amount > total ||
        d.amount < required ||
        (d.amount < total && !d.installments)
      )
        throw new AccountError(
          "Confirm full payment or approve installments meeting the required admission payment.",
        );
      const studentId = user.student.id;
      if (
        (await tx.enrollment.findFirst({
          where: { studentId, courseId: d.courseId },
        })) ||
        (await tx.fee.findFirst({ where: { studentId, courseId: d.courseId } }))
      )
        throw new AccountError(
          "An enrollment or fee already exists. Review the existing student record.",
        );
      const referenceKey = paymentReferenceKey(d.reference);
      await assertPaymentReferenceUnused(tx, referenceKey);
      const fee = await tx.fee.create({
        data: {
          studentId,
          courseId: d.courseId,
          totalFee: total,
          finalFee: total,
          remainingBalance: total,
        },
      });
      const payment =
        d.amount > 0
          ? await tx.payment.create({
              data: {
                studentId,
                feeId: fee.id,
                amount: d.amount,
                paymentMethod: d.method,
                transactionReference: referenceKey,
                referenceKey,
                recordedBy: session.userId,
                notes: `Verified admission ${app.applicationId}`,
              },
            })
          : null;
      await recomputeFeeStatus(tx, fee.id);
      await tx.enrollment.create({
        data: { studentId, courseId: d.courseId, batchId: batch.id },
      });
      await tx.student.update({
        where: { id: studentId },
        data: {
          status: "ACTIVE",
          ...(user.admissionRequired ? { admissionDate: new Date() } : {}),
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { admissionRequired: false },
      });
      await tx.admission.update({
        where: { id: app.id },
        data: {
          status: "APPROVED",
          courseId: d.courseId,
          batchId: batch.id,
          totalFee: total,
          requiredPayment: required,
          installmentApproved: d.installments,
          paymentId: payment?.id,
          reviewedBy: session.userId,
          reviewedAt: new Date(),
          reviewNote: null,
        },
      });
      await logAction(
        {
          userId: session.userId,
          action: "Admission approved; transaction manually verified",
          entity: "Admission",
          entityId: app.id,
          metadata: {
            studentId,
            courseId: d.courseId,
            batchId: batch.id,
            paymentId: payment?.id,
            amount: d.amount,
            installments: d.installments,
          },
        },
        tx,
      );
      await queueAdmissionConfirmation(
        tx,
        app.id,
        user.email,
        user.student.fullName,
        batch.course.title,
        batch.name,
      );
      return app.id;
    },
    { timeout: 20000 },
  );
}

export async function queueAdmissionConfirmation(
  tx: Prisma.TransactionClient,
  id: string,
  email: string,
  name: string,
  course: string,
  batch: string,
  suffix = "initial",
) {
  return queueEmail(tx, {
    dedupeKey: `approved:${id}:${suffix}`,
    recipient: email,
    subject: "Your iSkillSpot admission is confirmed",
    html: emailTemplate(
      name,
      "Welcome to iSkillSpot",
      `Your admission is confirmed.\nApproved course: ${course}\nAssigned batch: ${batch}\nYour student portal is now active. Sign in with your registered email and password.`,
    ),
  });
}
