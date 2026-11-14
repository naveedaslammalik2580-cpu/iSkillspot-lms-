"use server";

import { publicLimit } from "@/lib/auth/public-limit";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSession, requireStaff } from "@/lib/auth/guards";
import { createSession } from "@/lib/auth/session";
import { rateLimited } from "@/lib/auth/throttle";
import { emailSchema, AccountError } from "@/lib/auth/identity";
import { authorizeActor } from "@/lib/auth/account-policy";
import { logAction } from "@/lib/audit";
import {
  registrationSchema,
  registerStudent,
  requestAuthEmail,
  consumeAuthToken,
  selectAdmissionCourse,
  approveAdmission,
  queueAdmissionConfirmation,
} from "@/lib/admissions";
import { emailTemplate, queueEmail } from "@/lib/email";
import {
  paymentMethodsSchema,
  whatsappUrl,
  validMoney,
} from "@/lib/admission-policy";

export type AdmissionActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
};
const generic = {
  ok: true,
  message:
    "If this address is eligible, an email will arrive shortly. Check spam or sign in to resume your application.",
};
const errorState = (e: unknown): AdmissionActionState => ({
  error:
    e instanceof AccountError
      ? e.message
      : e instanceof z.ZodError
        ? e.errors[0].message
        : "Unable to complete this request. Please try again.",
});
export async function registerStudentAction(
  _: AdmissionActionState,
  form: FormData,
): Promise<AdmissionActionState> {
  const parsed = registrationSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return errorState(parsed.error);
  if (await publicLimit("register", parsed.data.email))
    return { error: "Too many attempts. Try again in 15 minutes." };
  try {
    await registerStudent(parsed.data);
    return generic;
  } catch (e) {
    return errorState(e);
  }
}
export async function requestAuthEmailAction(
  _: AdmissionActionState,
  form: FormData,
): Promise<AdmissionActionState> {
  const email = emailSchema.safeParse(form.get("email"));
  if (!email.success) return errorState(email.error);
  if (await publicLimit("email", email.data)) return generic;
  try {
    await requestAuthEmail(
      email.data,
      form.get("purpose") === "RESET_PASSWORD"
        ? "RESET_PASSWORD"
        : "VERIFY_EMAIL",
    );
  } catch {
    /* Identical result avoids enumeration on provider/configuration failures. */
  }
  return generic;
}
export async function verifyEmailAction(
  _: AdmissionActionState,
  form: FormData,
): Promise<AdmissionActionState> {
  if (await publicLimit("verify"))
    return { error: "Too many attempts. Try again in 15 minutes." };
  let user;
  try {
    user = await consumeAuthToken(
      String(form.get("token") || ""),
      "VERIFY_EMAIL",
    );
  } catch (e) {
    return errorState(e);
  }
  // Verification links only establish a restricted registration session.
  if (user.admissionRequired) {
    await createSession({
      userId: user.id,
      username: user.username,
      role: user.role,
      sessionVersion: user.sessionVersion,
      mustChangePassword: user.mustChangePassword,
    });
    redirect("/admission");
  }
  redirect("/login?verified=1");
}
export async function selectCourseAction(
  _: AdmissionActionState,
  form: FormData,
): Promise<AdmissionActionState> {
  const session = await requireSession({ allowAdmission: true });
  try {
    await selectAdmissionCourse(
      session,
      String(form.get("id")),
      String(form.get("courseId")),
      String(form.get("batchId") || ""),
    );
  } catch (e) {
    return errorState(e);
  }
  revalidatePath("/admission");
  return {
    ok: true,
    message: "Course selected. Follow the payment instructions below.",
  };
}
export async function newApplicationAction() {
  const session = await requireSession({ allowAdmission: true });
  if (session.role !== "STUDENT") redirect("/forbidden");
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${session.userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: session.userId },
    });
    if (
      user.status !== "ACTIVE" ||
      user.sessionVersion !== session.sessionVersion
    )
      throw new AccountError("Sign in again.");
    if (
      !(await tx.admission.findFirst({
        where: {
          userId: session.userId,
          status: { in: ["DRAFT", "PENDING", "INFORMATION_REQUESTED"] },
        },
      }))
    ) {
      await tx.admission.create({
        data: {
          userId: session.userId,
          applicationId: `ISP-${randomBytes(8).toString("hex").toUpperCase()}`,
        },
      });
    }
  });
  revalidatePath("/admission");
  redirect("/admission");
}
export async function reviewAdmissionAction(
  _: AdmissionActionState,
  form: FormData,
): Promise<AdmissionActionState> {
  const session = await requireStaff();
  const id = String(form.get("id") || "");
  const decision = form.get("decision");
  try {
    if (decision === "APPROVE") {
      await approveAdmission(session, {
        id,
        courseId: String(form.get("courseId")),
        batchId: String(form.get("batchId")),
        amount: Number(form.get("amount")),
        method: String(form.get("method")) as "BANK_TRANSFER",
        reference: String(form.get("reference") || ""),
        verified: (form.get("verified") === "on") as true,
        installments: form.get("installments") === "on",
      });
    } else {
      const note = z
        .string()
        .trim()
        .min(5, "Enter a reason or information request")
        .max(1000)
        .parse(form.get("note"));
      if (decision !== "REJECTED" && decision !== "INFORMATION_REQUESTED")
        throw new AccountError("Choose a review action.");
      await db.$transaction(async (tx) => {
        await authorizeActor(tx, session, "student.create");
        await tx.$queryRaw`SELECT id FROM "Admission" WHERE id=${id} FOR UPDATE`;
        const app = await tx.admission.findUniqueOrThrow({
          where: { id },
          include: { user: { include: { student: true } } },
        });
        if (!["PENDING", "INFORMATION_REQUESTED"].includes(app.status))
          throw new AccountError("This application has already been reviewed.");
        await tx.admission.update({
          where: { id },
          data: {
            status: decision,
            reviewNote: note,
            reviewedBy: session.userId,
            reviewedAt: new Date(),
          },
        });
        await logAction(
          {
            userId: session.userId,
            action: `Admission ${decision.toLowerCase()}`,
            entity: "Admission",
            entityId: id,
            metadata: { note },
          },
          tx,
        );
        await queueEmail(tx, {
          dedupeKey: `review:${id}:${randomBytes(8).toString("hex")}`,
          recipient: app.user.email,
          subject: "iSkillSpot admission update",
          html: emailTemplate(
            app.user.student?.fullName || "student",
            decision === "REJECTED"
              ? "Admission not approved"
              : "Further information needed",
            note,
            "View Admission Status",
            "/admission",
          ),
        });
      });
    }
  } catch (e) {
    return errorState(e);
  }
  revalidatePath("/admin/admissions");
  revalidatePath(`/admin/admissions/${id}`);
  revalidatePath("/admission");
  return {
    ok: true,
    message: "Admission updated. The email is queued for delivery.",
  };
}
export async function resendAdmissionAction(
  _: AdmissionActionState,
  form: FormData,
): Promise<AdmissionActionState> {
  const session = await requireStaff(),
    id = String(form.get("id"));
  if (await rateLimited(`admission-resend:${id}`))
    return { error: "Please try again later." };
  try {
    await db.$transaction(async (tx) => {
      await authorizeActor(tx, session, "student.create");
      const app = await tx.admission.findUniqueOrThrow({
        where: { id },
        include: {
          user: { include: { student: true } },
          course: true,
          batch: true,
        },
      });
      if (app.status !== "APPROVED" || !app.course || !app.batch)
        throw new AccountError("Approve admission first.");
      await queueAdmissionConfirmation(
        tx,
        id,
        app.user.email,
        app.user.student!.fullName,
        app.course.title,
        app.batch.name,
        randomBytes(8).toString("hex"),
      );
      await logAction(
        {
          userId: session.userId,
          action: "Admission confirmation resend queued",
          entity: "Admission",
          entityId: id,
        },
        tx,
      );
    });
    return { ok: true, message: "Confirmation queued for delivery." };
  } catch (e) {
    return errorState(e);
  }
}
export async function saveAdmissionSettingsAction(
  _: AdmissionActionState,
  form: FormData,
): Promise<AdmissionActionState> {
  const session = await requireStaff();
  try {
    if (session.role !== "SUPER_ADMIN")
      throw new AccountError("Only Super Admin can change admission settings.");
    const methods = paymentMethodsSchema.parse(
      JSON.parse(String(form.get("methods"))),
    );
    const whatsapp = z.string().max(30).parse(form.get("whatsapp"));
    if (!whatsappUrl(whatsapp, "", "", ""))
      throw new AccountError(
        "Enter the official WhatsApp number with country code.",
      );
    const instructions = z.string().max(2000).parse(form.get("instructions"));
    await db.$transaction(async (tx) => {
      await authorizeActor(tx, session, "settings.manage");
      for (const [key, value] of Object.entries({
        admissionsOpen: String(form.get("open") === "on"),
        admissionWhatsApp: whatsapp,
        admissionInstructions: instructions,
        admissionPaymentMethods: JSON.stringify(methods),
      })) {
        await tx.setting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        });
      }
      const courses = await tx.course.findMany({
        select: { id: true, defaultFee: true },
      });
      for (const course of courses) {
        const open = form.get(`open:${course.id}`) === "on",
          required = Number(form.get(`payment:${course.id}`));
        if (
          open &&
          (course.defaultFee == null ||
            !validMoney(course.defaultFee) ||
            !validMoney(required) ||
            required > course.defaultFee)
        )
          throw new AccountError(
            "Open courses need a valid database fee and admission payment no greater than that fee.",
          );
        await tx.course.update({
          where: { id: course.id },
          data: {
            admissionsOpen: open,
            admissionPayment: validMoney(required) ? required : null,
          },
        });
      }
      await logAction(
        {
          userId: session.userId,
          action: "Admission settings updated",
          entity: "Setting",
        },
        tx,
      );
    });
    revalidatePath("/admin/settings");
    return { ok: true, message: "Admission settings saved." };
  } catch (e) {
    return errorState(e);
  }
}
export async function setEnrollmentAccessAction(
  _: AdmissionActionState,
  form: FormData,
): Promise<AdmissionActionState> {
  const session = await requireStaff();
  try {
    await db.$transaction(async (tx) => {
      await authorizeActor(tx, session, "enrollment.manage");
      const id = String(form.get("id")),
        suspended = form.get("suspended") === "true";
      await tx.enrollment.update({
        where: { id },
        data: { accessSuspended: suspended },
      });
      await logAction(
        {
          userId: session.userId,
          action: suspended
            ? "Course access suspended"
            : "Course access restored",
          entity: "Enrollment",
          entityId: id,
        },
        tx,
      );
    });
    revalidatePath("/admin/admissions");
    return { ok: true, message: "Course access updated." };
  } catch (e) {
    return errorState(e);
  }
}
