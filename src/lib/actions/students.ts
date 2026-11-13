"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { hashPassword, generateTempPassword } from "@/lib/auth/password";
import {
  generateStudentId,
  generateUsername,
} from "@/lib/ids";
import { logAction } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { getSetting } from "@/lib/settings";

const createStudentSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  fatherName: z.string().optional(),
  email: z.string().email("Valid email required"),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  courseId: z.string().min(1, "Select a course"),
  batchId: z.string().min(1, "Select a batch"),
  admissionDate: z.string().optional(),
  totalFee: z.coerce.number().min(0, "Fee cannot be negative").optional(),
  discount: z.coerce.number().min(0).optional(),
});

export type CreateStudentResult =
  | { ok: true; studentId: string; username: string; tempPassword: string; id: string }
  | { ok: false; error: string };

/**
 * Section 26 workflow: create student record + user account + enrollment +
 * batch assignment + optional fee, generate unique Student ID and temp
 * password, force password change, and audit the action — all atomically.
 */
export async function createStudentAction(
  formData: FormData
): Promise<CreateStudentResult> {
  const session = await requirePermission("student.create");

  const parsed = createStudentSchema.safeParse(
    Object.fromEntries(formData.entries())
  );
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  // Validate batch belongs to course.
  const batch = await db.batch.findUnique({ where: { id: d.batchId } });
  if (!batch || batch.courseId !== d.courseId) {
    return { ok: false, error: "Selected batch does not belong to the chosen course." };
  }

  // Ensure email not already used.
  const existing = await db.user.findUnique({ where: { email: d.email } });
  if (existing) {
    return { ok: false, error: "A user with this email already exists." };
  }

  const studentId = await generateStudentId();
  const username = await generateUsername(d.fullName);
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const totalFee = d.totalFee ?? 0;
  const discount = d.discount ?? 0;
  const finalFee = Math.max(0, totalFee - discount);

  try {
    const student = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          email: d.email,
          passwordHash,
          role: "STUDENT",
          status: "ACTIVE",
          mustChangePassword: true,
        },
      });

      const student = await tx.student.create({
        data: {
          userId: user.id,
          studentId,
          fullName: d.fullName,
          fatherName: d.fatherName || null,
          email: d.email,
          phone: d.phone || null,
          whatsapp: d.whatsapp || null,
          address: d.address || null,
          city: d.city || null,
          gender: d.gender || null,
          dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth) : null,
          admissionDate: d.admissionDate ? new Date(d.admissionDate) : new Date(),
          status: "ACTIVE",
        },
      });

      await tx.enrollment.create({
        data: {
          studentId: student.id,
          courseId: d.courseId,
          batchId: d.batchId,
        },
      });

      if (totalFee > 0) {
        await tx.fee.create({
          data: {
            studentId: student.id,
            courseId: d.courseId,
            totalFee,
            discount,
            finalFee,
            amountPaid: 0,
            remainingBalance: finalFee,
            status: "UNPAID",
          },
        });
      }

      return student;
    });

    await logAction({
      userId: session.userId,
      action: "Created student",
      entity: "Student",
      entityId: student.id,
      metadata: { studentId, username },
    });

    await notifyUser(student.userId, {
      type: "SYSTEM",
      title: "Welcome to iSkillSpot",
      message: "Your student account is ready. Open your dashboard to see your courses, batches and announcements.",
      linkUrl: "/student/dashboard",
      dedupeKey: `welcome:${student.userId}`,
    });

    revalidatePath("/admin/students");
    return { ok: true, id: student.id, studentId, username, tempPassword };
  } catch (e) {
    return { ok: false, error: "Failed to create student. Please try again." };
  }
}

const updateStudentSchema = z.object({
  id: z.string(),
  fullName: z.string().min(2),
  fatherName: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  status: z.enum(["ACTIVE", "COMPLETED", "ON_HOLD", "DROPPED", "SUSPENDED"]),
  notes: z.string().optional(),
});

export async function updateStudentAction(formData: FormData) {
  const session = await requirePermission("student.edit");
  const parsed = updateStudentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  await db.student.update({
    where: { id: d.id },
    data: {
      fullName: d.fullName,
      fatherName: d.fatherName || null,
      phone: d.phone || null,
      whatsapp: d.whatsapp || null,
      address: d.address || null,
      city: d.city || null,
      status: d.status,
      notes: d.notes || null,
    },
  });

  // Keep account status in sync when suspended.
  if (d.status === "SUSPENDED" || d.status === "DROPPED") {
    const student = await db.student.findUnique({ where: { id: d.id } });
    if (student) {
      await db.user.update({ where: { id: student.userId }, data: { status: "SUSPENDED" } });
    }
  }

  await logAction({ userId: session.userId, action: "Updated student", entity: "Student", entityId: d.id });
  revalidatePath(`/admin/students/${d.id}`);
  revalidatePath("/admin/students");
  return { ok: true };
}

export async function resetStudentPasswordAction(studentId: string) {
  const session = await requirePermission("student.edit");
  const student = await db.student.findUnique({ where: { id: studentId } });
  if (!student) return { ok: false, error: "Student not found." };

  const temp = generateTempPassword();
  const hash = await hashPassword(temp);
  await db.user.update({
    where: { id: student.userId },
    data: { passwordHash: hash, mustChangePassword: true },
  });

  await logAction({ userId: session.userId, action: "Reset password", entity: "Student", entityId: studentId });
  return { ok: true, tempPassword: temp };
}

export async function toggleStudentAccountAction(studentId: string, activate: boolean) {
  const session = await requirePermission("student.edit");
  const student = await db.student.findUnique({ where: { id: studentId } });
  if (!student) return { ok: false, error: "Student not found." };
  await db.user.update({
    where: { id: student.userId },
    data: { status: activate ? "ACTIVE" : "INACTIVE" },
  });
  await logAction({
    userId: session.userId,
    action: activate ? "Activated student account" : "Deactivated student account",
    entity: "Student",
    entityId: studentId,
  });
  revalidatePath(`/admin/students/${studentId}`);
  return { ok: true };
}
