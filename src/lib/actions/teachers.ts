"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { hashPassword, generateTempPassword, temporaryPasswordExpiry } from "@/lib/auth/password";
import { logAction } from "@/lib/audit";
import { emailSchema, usernameSchema, assertIdentityAvailable } from "@/lib/auth/identity";
import { authorizeActor, manageableTarget } from "@/lib/auth/account-policy";
import { resetAccountPassword, sendAccountResetLink, setAccountActive } from "@/lib/auth/accounts";

// Schema note: Teacher has no employeeId field (spec allowed for this — "if
// present"). It isn't, so this module doesn't expose one.

const createTeacherSchema = z.object({
  fullName: z.string().min(2, "Full name is required").max(200),
  email: emailSchema,
  username: usernameSchema,
  phone: z.string().optional(),
  specialization: z.string().max(500).optional(),
});

export type TeacherResult =
  | { ok: true; teacherId: string; tempPassword: string }
  | { ok: false; error: string };

function uniqueFieldError(e: Prisma.PrismaClientKnownRequestError): string {
  const target = Array.isArray(e.meta?.target) ? (e.meta!.target as string[]) : [];
  if (target.includes("username")) return "A user with this username already exists.";
  if (target.includes("email")) return "A user with this email already exists.";
  return "A user with these details already exists.";
}

/**
 * Creates both the User (role TEACHER) and Teacher row in one transaction,
 * matching createStudentAction's account+profile pattern. Temp password is
 * shown once to the admin, same as the add-student flow.
 */
export async function createTeacher(
  input: z.infer<typeof createTeacherSchema>
): Promise<TeacherResult> {
  const session = await requirePermission("teacher.manage");

  const parsed = createTeacherSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  try {
    const teacher = await db.$transaction(async (tx) => {
      await authorizeActor(tx, session, "teacher.manage");
      await assertIdentityAvailable(tx, d.email, d.username);
      const user = await tx.user.create({
        data: {
          username: d.username,
          email: d.email,
          passwordHash,
          role: "TEACHER",
          status: "ACTIVE",
          mustChangePassword: true,
          passwordExpiresAt: temporaryPasswordExpiry(),
        },
      });
      const profile = await tx.teacher.create({
        data: {
          userId: user.id,
          fullName: d.fullName,
          phone: d.phone || null,
          email: d.email,
          specialization: d.specialization || null,
          status: "ACTIVE",
        },
      });
      await logAction({ userId: session.userId, action: "Created teacher", entity: "Teacher", entityId: profile.id,
        metadata: { fullName: d.fullName, username: d.username } }, tx);
      return profile;
    });

    revalidatePath("/admin/teachers");
    return { ok: true, teacherId: teacher.id, tempPassword };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: uniqueFieldError(e) };
    }
    return { ok: false, error: "Failed to create teacher. Please try again." };
  }
}

const updateTeacherSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().min(2, "Full name is required").max(200),
  phone: z.string().optional(),
  specialization: z.string().max(500).optional(),
});

/**
 * Edits profile fields only — email/username/role are User-level and out of
 * scope here. Status changes go through deactivateTeacher instead, which
 * carries the active-batches safety check; letting a plain edit flip status
 * would bypass that.
 */
export async function updateTeacher(
  input: z.infer<typeof updateTeacherSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requirePermission("teacher.manage");

  const parsed = updateTeacherSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const updated = await db.$transaction(async tx => {
      await authorizeActor(tx, session, "teacher.manage");
      const existing = await tx.teacher.findUnique({ where: { id: d.id } });
      if (!existing) return false;
      const target = await manageableTarget(tx, session, existing.userId);
      if (target.role !== "TEACHER") throw new Error("Invalid linked account role");

      const nextPhone = d.phone || null;
      const nextSpecialization = d.specialization || null;

      const changes: Record<string, { old: unknown; new: unknown }> = {};
      if (existing.fullName !== d.fullName) changes.fullName = { old: existing.fullName, new: d.fullName };
      if (existing.phone !== nextPhone) changes.phone = { old: existing.phone, new: nextPhone };
      if (existing.specialization !== nextSpecialization)
        changes.specialization = { old: existing.specialization, new: nextSpecialization };

      await tx.teacher.update({
        where: { id: d.id },
        data: { fullName: d.fullName, phone: nextPhone, specialization: nextSpecialization },
      });

      if (Object.keys(changes).length > 0) {
        await logAction({
          userId: session.userId,
          action: "Updated teacher",
          entity: "Teacher",
          entityId: d.id,
          metadata: { changes },
        }, tx);
      }
      return true;
  });
  if (!updated) return { ok: false, error: "Teacher not found." };

  revalidatePath("/admin/teachers");
  revalidatePath(`/admin/teachers/${d.id}`);
  return { ok: true };
}

/**
 * Deactivate, don't delete. Refuses if the teacher has any ONGOING batches
 * (BatchStatus has no "ACTIVE" value — ONGOING is the equivalent) —
 * reassign those first.
 */
export async function deactivateTeacher(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requirePermission("teacher.manage");

  const existing = await db.teacher.findUnique({
    where: { id },
    include: { batches: { where: { status: "ONGOING" }, select: { id: true } } },
  });
  if (!existing) return { ok: false, error: "Teacher not found." };

  if (existing.batches.length > 0) {
    return {
      ok: false,
      error: `Cannot deactivate: this teacher has ${existing.batches.length} ongoing batch(es). Reassign them first.`,
    };
  }

  try { await setAccountActive(session, existing.userId, false, "TEACHER"); }
  catch { return { ok: false, error: "Unable to deactivate this account. Check its role and ongoing batches." }; }

  revalidatePath("/admin/teachers");
  revalidatePath(`/admin/teachers/${id}`);
  return { ok: true };
}

export async function resetTeacherPassword(
  id: string
): Promise<{ ok: true; tempPassword: string } | { ok: false; error: string }> {
  const session = await requirePermission("teacher.manage");

  const existing = await db.teacher.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Teacher not found." };

  try {
    const result = await resetAccountPassword(session, existing.userId, "TEACHER");
    return { ok: true, tempPassword: result.tempPassword };
  } catch { return { ok: false, error: "Unable to reset this account password." }; }
}

export async function sendTeacherResetLinkAction(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requirePermission("teacher.manage");

  const existing = await db.teacher.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Teacher not found." };

  try {
    const result = await sendAccountResetLink(session, existing.userId, "TEACHER");
    if (result === "not-configured") {
      return { ok: false, error: "Email is not configured on the server, so no link was sent. Use the temporary-password reset instead." };
    }
    if (result === "failed") return { ok: false, error: "The reset email could not be sent. Please try again." };
    return { ok: true };
  } catch { return { ok: false, error: "Unable to send a reset link for this account." }; }
}
