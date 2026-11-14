"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { logAction } from "@/lib/audit";
import { notifyStudent } from "@/lib/notifications";
import { generateCertificateNumber, generateVerificationCode } from "@/lib/ids";

const issueCertificateSchema = z.object({
  studentId: z.string().min(1, "Select a student"),
  courseId: z.string().min(1, "Select a course"),
  notes: z.string().max(1000).optional(),
});

export type IssueCertificateResult =
  | { ok: true; certificateId: string; verificationCode: string }
  | { ok: false; error: string };

export async function issueCertificate(
  input: z.infer<typeof issueCertificateSchema>
): Promise<IssueCertificateResult> {
  const session = await requirePermission("certificate.manage");

  const parsed = issueCertificateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const student = await db.student.findUnique({ where: { id: d.studentId } });
  if (!student) return { ok: false, error: "Student not found." };
  const course = await db.course.findUnique({ where: { id: d.courseId } });
  if (!course) return { ok: false, error: "Course not found." };

  const enrollment = await db.enrollment.findFirst({
    where: { studentId: d.studentId, courseId: d.courseId },
    select: { id: true },
  });
  if (!enrollment) {
    return { ok: false, error: "This student is not enrolled in that course." };
  }

  const existing = await db.certificate.findFirst({
    where: { studentId: d.studentId, courseId: d.courseId, status: "ISSUED" },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "A certificate is already issued for this student and course." };
  }

  try {
    const certificate = await db.certificate.create({
      data: {
        studentId: d.studentId,
        courseId: d.courseId,
        certificateNumber: generateCertificateNumber(),
        verificationCode: generateVerificationCode(),
        issueDate: new Date(),
        issuedBy: session.userId,
        notes: d.notes || null,
        status: "ISSUED",
      },
    });

    await notifyStudent(certificate.studentId, {
      type: "CERTIFICATE",
      title: "Certificate issued",
      message: "Your certificate is ready. Open it to view, download, or share the verification link.",
      linkUrl: `/student/certificates/${certificate.id}`,
      dedupeKey: `certificate:${certificate.id}`,
    });

    await logAction({
      userId: session.userId,
      action: "Issued certificate",
      entity: "Certificate",
      entityId: certificate.id,
      metadata: { studentId: d.studentId, courseId: d.courseId, certificateNumber: certificate.certificateNumber },
    });

    revalidatePath("/admin/certificates");
    return { ok: true, certificateId: certificate.id, verificationCode: certificate.verificationCode };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "A certificate with that number or code already exists. Please try again." };
    }
    return { ok: false, error: "Failed to issue certificate. Please try again." };
  }
}

const revokeCertificateSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(10, "Reason must be at least 10 characters").max(500),
});

export async function revokeCertificate(
  input: z.infer<typeof revokeCertificateSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requirePermission("certificate.manage");

  const parsed = revokeCertificateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const existing = await db.certificate.findUnique({ where: { id: d.id } });
  if (!existing) return { ok: false, error: "Certificate not found." };
  if (existing.status === "REVOKED") return { ok: false, error: "This certificate is already revoked." };

  await db.certificate.update({
    where: { id: d.id },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      revokedBy: session.userId,
      revokeReason: d.reason,
    },
  });

  await logAction({
    userId: session.userId,
    action: "Revoked certificate",
    entity: "Certificate",
    entityId: d.id,
    metadata: { reason: d.reason, certificateNumber: existing.certificateNumber },
  });

  revalidatePath("/admin/certificates");
  revalidatePath(`/admin/certificates/${d.id}`);
  return { ok: true };
}
