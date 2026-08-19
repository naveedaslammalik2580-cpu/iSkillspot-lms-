"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { hashPassword, generateTempPassword } from "@/lib/auth/password";
import { logAction } from "@/lib/audit";

// Schema note: Teacher has no employeeId field (spec allowed for this — "if
// present"). It isn't, so this module doesn't expose one.

const createTeacherSchema = z.object({
  fullName: z.string().min(2, "Full name is required").max(200),
  email: z.string().email("Valid email required"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, "Username may only contain letters, numbers, dots, underscores, and hyphens"),
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
      const user = await tx.user.create({
        data: {
          username: d.username,
          email: d.email,
          passwordHash,
          role: "TEACHER",
          status: "ACTIVE",
          mustChangePassword: true,
        },
      });
      return tx.teacher.create({
        data: {
          userId: user.id,
          fullName: d.fullName,
          phone: d.phone || null,
          email: d.email,
          specialization: d.specialization || null,
          status: "ACTIVE",
        },
      });
    });

    await logAction({
      userId: session.userId,
      action: "Created teacher",
      entity: "Teacher",
      entityId: teacher.id,
      metadata: { fullName: d.fullName, username: d.username },
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

  const existing = await db.teacher.findUnique({ where: { id: d.id } });
  if (!existing) return { ok: false, error: "Teacher not found." };

  const nextPhone = d.phone || null;
  const nextSpecialization = d.specialization || null;

  const changes: Record<string, { old: unknown; new: unknown }> = {};
  if (existing.fullName !== d.fullName) changes.fullName = { old: existing.fullName, new: d.fullName };
  if (existing.phone !== nextPhone) changes.phone = { old: existing.phone, new: nextPhone };
  if (existing.specialization !== nextSpecialization)
    changes.specialization = { old: existing.specialization, new: nextSpecialization };

  await db.teacher.update({
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
    });
  }

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

  await db.$transaction([
    db.teacher.update({ where: { id }, data: { status: "INACTIVE" } }),
    db.user.update({ where: { id: existing.userId }, data: { status: "INACTIVE" } }),
  ]);

  await logAction({
    userId: session.userId,
    action: "Deactivated teacher",
    entity: "Teacher",
    entityId: id,
  });

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

  const tempPassword = generateTempPassword();
  const hash = await hashPassword(tempPassword);
  await db.user.update({
    where: { id: existing.userId },
    data: { passwordHash: hash, mustChangePassword: true },
  });

  // Never log the password itself — only that a reset happened.
  await logAction({
    userId: session.userId,
    action: "Reset teacher password",
    entity: "Teacher",
    entityId: id,
  });

  return { ok: true, tempPassword };
}
