import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { admissionSettings } from "@/lib/admissions";
import {
  emailSchema,
  assertIdentityAvailable,
  AccountError,
} from "@/lib/auth/identity";
import { strongPassword, hashPassword } from "@/lib/auth/password";
import { rateLimited } from "@/lib/auth/throttle";
import { generateStudentId } from "@/lib/ids";
import { logAction } from "@/lib/audit";
import { queueEmail, emailTemplate } from "@/lib/email";
import { validMoney, whatsappUrl } from "@/lib/admission-policy";

/**
 * Website enrollment (marketing site -> LMS).
 *
 * The public website's enroll form is a parallel entry point to the LMS's
 * own /register + /admission pages. It deliberately differs in two ways the
 * institute asked for:
 * - the account's email is accepted as verified at creation (no
 *   VERIFY_EMAIL token is issued and no verification email is sent), and
 * - a duplicate email is reported honestly instead of silently accepted.
 * Everything else mirrors the in-LMS flow exactly: the same validation
 * rules as `registrationSchema`, the same Student profile shape as
 * `registerStudent`, and the same PENDING Admission (course, totalFee,
 * requiredPayment) that `selectAdmissionCourse` produces, including the
 * queued "application received" email and the audit entries.
 */

// Same field rules as registrationSchema in src/lib/admissions.ts, minus
// confirmPassword (the website form has a single password field).
export const websiteEnrollSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  email: emailSchema,
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{8,25}$/, "Enter a valid phone number"),
  password: strongPassword,
  courseId: z.string().trim().min(1, "Choose a course"),
});

export type WebsiteEnrollCourse = {
  id: string;
  name: string;
  requiredPayment: number;
};

export type WebsiteEnrollResult =
  | {
      status: 201;
      body: {
        ok: true;
        applicationId: string;
        courseName: string;
        payment: {
          methods: { name: string; method: string; account: string }[];
          instructions: string;
          requiredPayment: number;
          totalFee: number;
          currency: string;
          whatsapp: string;
          whatsappUrl: string | null;
        };
      };
    }
  | { status: number; body: { ok: false; error: string } };

class EnrollError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const fail = (status: number, error: string): WebsiteEnrollResult => ({
  status,
  body: { ok: false, error },
});

// Enrollment can only complete when the same configuration the in-LMS
// course selection demands is present: admissions open, at least one
// payment method, and the official WhatsApp number.
function enrollmentConfigured(settings: {
  open: boolean;
  methods: unknown[];
  whatsapp: string;
}) {
  return settings.open && settings.methods.length > 0 && !!settings.whatsapp;
}

/**
 * Courses the website form may offer: exactly the courses
 * `selectAdmissionCourse` would accept — published, open for admissions,
 * with a valid total fee and a valid admission payment no greater than it.
 */
export async function websiteEnrollCourses(): Promise<{
  admissionsOpen: boolean;
  currency: string;
  courses: WebsiteEnrollCourse[];
}> {
  const settings = await admissionSettings();
  if (!enrollmentConfigured(settings))
    return { admissionsOpen: false, currency: settings.currency, courses: [] };
  const rows = await db.course.findMany({
    where: {
      status: "PUBLISHED",
      admissionsOpen: true,
      defaultFee: { not: null },
      admissionPayment: { not: null },
    },
    select: {
      id: true,
      title: true,
      defaultFee: true,
      admissionPayment: true,
    },
    orderBy: { title: "asc" },
  });
  const courses = rows
    .filter(
      (c) =>
        c.defaultFee != null &&
        validMoney(c.defaultFee) &&
        c.admissionPayment != null &&
        validMoney(c.admissionPayment) &&
        c.admissionPayment <= c.defaultFee,
    )
    .map((c) => ({
      id: c.id,
      name: c.title,
      requiredPayment: c.admissionPayment!,
    }));
  return { admissionsOpen: true, currency: settings.currency, courses };
}

export async function submitWebsiteEnrollment(
  raw: unknown,
  clientKey: string,
): Promise<WebsiteEnrollResult> {
  const parsed = websiteEnrollSchema.safeParse(raw);
  if (!parsed.success) return fail(400, parsed.error.issues[0].message);
  const d = parsed.data;
  // DB-backed throttle (AuthThrottle), same mechanism and message as the
  // public registration action: a handful of attempts per 15 minutes,
  // counted per email address and per client source.
  const [byEmail, bySource] = await Promise.all([
    rateLimited(`enroll:email:${d.email}`),
    rateLimited(`enroll:source:${clientKey}`),
  ]);
  if (byEmail || bySource)
    return fail(429, "Too many attempts. Try again in 15 minutes.");
  // Hash even duplicate submissions to reduce account-existence timing
  // differences (same reasoning as registerStudent).
  const passwordHash = await hashPassword(d.password);
  try {
    const out = await db.$transaction(
      async (tx) => {
        const settings = await admissionSettings(tx);
        if (!settings.open)
          throw new EnrollError(400, "Public admissions are currently closed.");
        if (!settings.methods.length || !settings.whatsapp)
          throw new EnrollError(
            400,
            "Admissions are unavailable. Contact the institute.",
          );
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(752091, 3)`;
        if (
          await tx.user.findFirst({
            where: { email: { equals: d.email, mode: "insensitive" } },
            select: { id: true },
          })
        )
          throw new EnrollError(
            409,
            "This email is already registered. Please sign in to the student portal instead.",
          );
        const course = await tx.course.findFirst({
          where: { id: d.courseId, status: "PUBLISHED", admissionsOpen: true },
        });
        if (
          !course ||
          course.defaultFee == null ||
          !validMoney(course.defaultFee) ||
          course.admissionPayment == null ||
          !validMoney(course.admissionPayment) ||
          course.admissionPayment > course.defaultFee
        )
          throw new EnrollError(
            400,
            "This course is not accepting admissions.",
          );
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
            // Website flow: no email verification step. The address is
            // treated as verified so the admin can approve the admission
            // (approval requires a verified email).
            emailVerifiedAt: new Date(),
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
            courseId: course.id,
            status: "PENDING",
            totalFee: course.defaultFee,
            requiredPayment: course.admissionPayment,
          },
        });
        await queueEmail(tx, {
          dedupeKey: `submitted:${application.id}`,
          recipient: user.email,
          subject: "iSkillSpot application received",
          html: emailTemplate(
            d.fullName,
            "Application received",
            `Application ${application.applicationId}\nCourse: ${course.title}\nYour admission is awaiting payment verification and admin approval.`,
            "View Admission Status",
            "/admission",
          ),
        });
        await logAction(
          {
            userId: user.id,
            action:
              "Student registered via website; email accepted without verification",
            entity: "Admission",
            entityId: application.id,
          },
          tx,
        );
        await logAction(
          {
            userId: user.id,
            action: "Admission application submitted",
            entity: "Admission",
            entityId: application.id,
          },
          tx,
        );
        return { settings, course, application };
      },
      { timeout: 20000 },
    );
    return {
      status: 201,
      body: {
        ok: true,
        applicationId: out.application.applicationId,
        courseName: out.course.title,
        payment: {
          methods: out.settings.methods,
          instructions: out.settings.instructions,
          requiredPayment: out.course.admissionPayment!,
          totalFee: out.course.defaultFee!,
          currency: out.settings.currency,
          whatsapp: out.settings.whatsapp,
          whatsappUrl: whatsappUrl(
            out.settings.whatsapp,
            d.fullName,
            out.application.applicationId,
            out.course.title,
          ),
        },
      },
    };
  } catch (e) {
    if (e instanceof EnrollError) return fail(e.status, e.message);
    // assertIdentityAvailable lost a race with a concurrent registration.
    if (e instanceof AccountError)
      return fail(
        409,
        "This email is already registered. Please sign in to the student portal instead.",
      );
    throw e;
  }
}
