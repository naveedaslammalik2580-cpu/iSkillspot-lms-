"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  requirePermission,
  requireSession,
  requireStudentSelf,
  assertTeacherOwnsCourse,
  AuthError,
} from "@/lib/auth/guards";
import { logAction } from "@/lib/audit";
import {
  uploadSubmissionFile,
  getSignedDownloadUrl,
  deleteSubmissionFile,
} from "@/lib/storage/supabase";

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB per file
const MAX_TOTAL_BYTES = 200 * 1024 * 1024; // 200MB per submission

function safeParseKeys(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Assignments are course-wide (no batchId on Assignment). Admin/super-admin
 * already passed requirePermission; teachers must additionally own >=1 batch
 * of the assignment's course (see assertTeacherOwnsCourse in guards.ts).
 */
async function assertCourseAccess(
  role: string,
  userId: string,
  courseId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (role !== "TEACHER") return { ok: true };
  const teacher = await db.teacher.findUnique({ where: { userId } });
  if (!teacher) return { ok: false, error: "Teacher profile not found." };
  try {
    await assertTeacherOwnsCourse(teacher.id, courseId);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof AuthError ? e.message : "Not authorized for this course.",
    };
  }
}

// ---------------------------------------------------------------------------
// Teacher / admin: assignment CRUD
// ---------------------------------------------------------------------------

const createAssignmentSchema = z.object({
  courseId: z.string().min(1, "Select a course"),
  moduleId: z.string().optional(),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(10_000).optional(),
  instructions: z.string().max(10_000).optional(),
  dueDate: z.string().optional(),
  maxScore: z.coerce.number().int().min(1).max(1000),
});

export type AssignmentResult =
  | { ok: true; assignmentId: string }
  | { ok: false; error: string };

/**
 * Section: create an assignment. Course-wide (no per-batch link) — any
 * teacher assigned to a batch of the course, or any staff member, may create.
 */
export async function createAssignment(
  input: z.infer<typeof createAssignmentSchema>
): Promise<AssignmentResult> {
  const session = await requirePermission("assignment.manage");

  const parsed = createAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const course = await db.course.findUnique({ where: { id: d.courseId } });
  if (!course) return { ok: false, error: "Course not found." };

  if (d.moduleId) {
    const mod = await db.module.findUnique({ where: { id: d.moduleId } });
    if (!mod || mod.courseId !== d.courseId) {
      return { ok: false, error: "Selected module does not belong to the chosen course." };
    }
  }

  const scope = await assertCourseAccess(session.role, session.userId, d.courseId);
  if (!scope.ok) return scope;

  const assignment = await db.assignment.create({
    data: {
      courseId: d.courseId,
      moduleId: d.moduleId || null,
      title: d.title,
      description: d.description || null,
      instructions: d.instructions || null,
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      maxScore: d.maxScore,
      createdBy: session.userId,
    },
  });

  await logAction({
    userId: session.userId,
    action: "Created assignment",
    entity: "Assignment",
    entityId: assignment.id,
    metadata: { title: d.title, courseId: d.courseId },
  });

  revalidatePath("/admin/assignments");
  revalidatePath("/teacher/assignments");
  revalidatePath("/student/assignments");
  return { ok: true, assignmentId: assignment.id };
}

const updateAssignmentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(10_000).optional(),
  instructions: z.string().max(10_000).optional(),
  dueDate: z.string().optional(),
  maxScore: z.coerce.number().int().min(1).max(1000),
});

export async function updateAssignment(
  input: z.infer<typeof updateAssignmentSchema>
): Promise<AssignmentResult> {
  const session = await requirePermission("assignment.manage");

  const parsed = updateAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const existing = await db.assignment.findUnique({ where: { id: d.id } });
  if (!existing) return { ok: false, error: "Assignment not found." };

  const scope = await assertCourseAccess(session.role, session.userId, existing.courseId);
  if (!scope.ok) return scope;

  const nextDueDate = d.dueDate ? new Date(d.dueDate) : null;
  const nextDescription = d.description || null;
  const nextInstructions = d.instructions || null;

  const changes: Record<string, { old: unknown; new: unknown }> = {};
  if (existing.title !== d.title) changes.title = { old: existing.title, new: d.title };
  if (existing.description !== nextDescription)
    changes.description = { old: existing.description, new: nextDescription };
  if (existing.instructions !== nextInstructions)
    changes.instructions = { old: existing.instructions, new: nextInstructions };
  if ((existing.dueDate?.toISOString() ?? null) !== (nextDueDate?.toISOString() ?? null))
    changes.dueDate = { old: existing.dueDate, new: nextDueDate };
  if (existing.maxScore !== d.maxScore)
    changes.maxScore = { old: existing.maxScore, new: d.maxScore };

  await db.assignment.update({
    where: { id: d.id },
    data: {
      title: d.title,
      description: nextDescription,
      instructions: nextInstructions,
      dueDate: nextDueDate,
      maxScore: d.maxScore,
    },
  });

  if (Object.keys(changes).length > 0) {
    await logAction({
      userId: session.userId,
      action: "Updated assignment",
      entity: "Assignment",
      entityId: d.id,
      metadata: { changes },
    });
  }

  revalidatePath("/admin/assignments");
  revalidatePath(`/admin/assignments/${d.id}`);
  revalidatePath("/teacher/assignments");
  revalidatePath(`/teacher/assignments/${d.id}`);
  revalidatePath("/student/assignments");
  return { ok: true, assignmentId: d.id };
}

export async function deleteAssignment(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requirePermission("assignment.manage");

  const existing = await db.assignment.findUnique({
    where: { id },
    include: { _count: { select: { submissions: true } } },
  });
  if (!existing) return { ok: false, error: "Assignment not found." };

  const scope = await assertCourseAccess(session.role, session.userId, existing.courseId);
  if (!scope.ok) return scope;

  if (existing._count.submissions > 0) {
    return { ok: false, error: "Cannot delete an assignment with submissions." };
  }

  await db.assignment.delete({ where: { id } });

  await logAction({
    userId: session.userId,
    action: "Deleted assignment",
    entity: "Assignment",
    entityId: id,
    metadata: { title: existing.title },
  });

  revalidatePath("/admin/assignments");
  revalidatePath("/teacher/assignments");
  revalidatePath("/student/assignments");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Teacher / admin: grading
// ---------------------------------------------------------------------------

const gradeSchema = z.object({
  submissionId: z.string().min(1),
  score: z.coerce.number().min(0),
  feedback: z.string().max(5_000).optional(),
});

export async function gradeSubmission(
  input: z.infer<typeof gradeSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requirePermission("assignment.grade");

  const parsed = gradeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const submission = await db.assignmentSubmission.findUnique({
    where: { id: d.submissionId },
    include: { assignment: true },
  });
  if (!submission) return { ok: false, error: "Submission not found." };

  const scope = await assertCourseAccess(session.role, session.userId, submission.assignment.courseId);
  if (!scope.ok) return scope;

  if (d.score > submission.assignment.maxScore) {
    return { ok: false, error: `Score cannot exceed ${submission.assignment.maxScore}.` };
  }

  const wasLate = submission.status === "LATE";

  await db.assignmentSubmission.update({
    where: { id: d.submissionId },
    data: {
      score: d.score,
      feedback: d.feedback || null,
      status: "GRADED",
      gradedBy: session.userId,
      gradedAt: new Date(),
    },
  });

  await logAction({
    userId: session.userId,
    action: "Graded submission",
    entity: "AssignmentSubmission",
    entityId: d.submissionId,
    // wasLate isn't a separate schema field — recorded here since grading is
    // the point after which the submission's own status no longer shows it.
    metadata: { assignmentId: submission.assignmentId, studentId: submission.studentId, score: d.score, wasLate },
  });

  revalidatePath(`/admin/assignments/${submission.assignmentId}`);
  revalidatePath(`/teacher/assignments/${submission.assignmentId}`);
  revalidatePath("/student/assignments");
  revalidatePath(`/student/assignments/${submission.assignmentId}`);
  return { ok: true };
}

export async function reopenSubmission(
  submissionId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requirePermission("assignment.grade");

  const submission = await db.assignmentSubmission.findUnique({
    where: { id: submissionId },
    include: { assignment: true },
  });
  if (!submission) return { ok: false, error: "Submission not found." };

  const scope = await assertCourseAccess(session.role, session.userId, submission.assignment.courseId);
  if (!scope.ok) return scope;

  if (submission.status !== "GRADED") {
    return { ok: false, error: "This submission is not graded." };
  }

  const isLate =
    submission.submittedAt !== null &&
    submission.assignment.dueDate !== null &&
    submission.submittedAt > submission.assignment.dueDate;

  await db.assignmentSubmission.update({
    where: { id: submissionId },
    data: {
      status: isLate ? "LATE" : "SUBMITTED",
      score: null,
      feedback: null,
      gradedBy: null,
      gradedAt: null,
    },
  });

  await logAction({
    userId: session.userId,
    action: "Reopened submission",
    entity: "AssignmentSubmission",
    entityId: submissionId,
    metadata: { assignmentId: submission.assignmentId, studentId: submission.studentId },
  });

  revalidatePath(`/admin/assignments/${submission.assignmentId}`);
  revalidatePath(`/teacher/assignments/${submission.assignmentId}`);
  revalidatePath("/student/assignments");
  revalidatePath(`/student/assignments/${submission.assignmentId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Student: submission
// ---------------------------------------------------------------------------

export async function createOrUpdateSubmission(input: {
  assignmentId: string;
  submissionText?: string;
  files: File[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { session, student } = await requireStudentSelf();

  const assignmentId = input.assignmentId;
  if (!assignmentId) return { ok: false, error: "Not found." };

  const assignment = await db.assignment.findUnique({ where: { id: assignmentId } });
  // Don't leak whether the assignment exists to a student who can't see it.
  if (!assignment) return { ok: false, error: "Not found." };

  const enrollment = await db.enrollment.findFirst({
    where: { studentId: student.id, courseId: assignment.courseId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!enrollment) return { ok: false, error: "Not found." };

  const files = (input.files ?? []).filter((f) => f && f.size > 0);
  const submissionText = input.submissionText?.trim().slice(0, 10_000) || null;

  if (files.length === 0 && !submissionText) {
    return { ok: false, error: "Add a file or a note before submitting." };
  }
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      return { ok: false, error: `"${f.name}" is larger than 50MB.` };
    }
  }
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return { ok: false, error: "Total upload size exceeds 200MB." };
  }

  const existing = await db.assignmentSubmission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId: student.id } },
  });
  if (existing?.status === "GRADED") {
    return { ok: false, error: "This submission is already graded and cannot be updated." };
  }

  const now = new Date();
  const isLate = assignment.dueDate !== null && now > assignment.dueDate;
  const status: "SUBMITTED" | "LATE" = isLate ? "LATE" : "SUBMITTED";
  const submissionId = existing?.id ?? randomUUID();

  // Upload first — Supabase Storage isn't part of the Prisma transaction. If
  // anything fails partway, clean up whatever was already uploaded so we
  // don't leave orphan blobs.
  const uploaded: { storageKey: string }[] = [];
  if (files.length > 0) {
    try {
      for (const file of files) {
        const result = await uploadSubmissionFile({ submissionId, file, originalName: file.name });
        uploaded.push(result);
      }
    } catch {
      for (const u of uploaded) await deleteSubmissionFile(u.storageKey).catch(() => {});
      return { ok: false, error: "File upload failed. Please try again." };
    }
  }

  const oldKeys = existing?.fileUrl ? safeParseKeys(existing.fileUrl) : [];
  const nextFileUrl =
    uploaded.length > 0 ? JSON.stringify(uploaded.map((u) => u.storageKey)) : existing?.fileUrl ?? null;

  try {
    if (existing) {
      await db.assignmentSubmission.update({
        where: { id: existing.id },
        data: { fileUrl: nextFileUrl, submissionText, submittedAt: now, status },
      });
    } else {
      await db.assignmentSubmission.create({
        data: {
          id: submissionId,
          assignmentId,
          studentId: student.id,
          fileUrl: nextFileUrl,
          submissionText,
          submittedAt: now,
          status,
        },
      });
    }
  } catch {
    // DB write failed after upload succeeded — clean up the new files only;
    // the old row (and its files) are still intact and unreferenced by us.
    for (const u of uploaded) await deleteSubmissionFile(u.storageKey).catch(() => {});
    return { ok: false, error: "Failed to save submission. Please try again." };
  }

  // Only remove the old files once the new row is safely persisted.
  if (uploaded.length > 0) {
    for (const key of oldKeys) await deleteSubmissionFile(key).catch(() => {});
  }

  await logAction({
    userId: session.userId,
    action: existing ? "Updated submission" : "Created submission",
    entity: "AssignmentSubmission",
    entityId: submissionId,
    metadata: { assignmentId, studentId: student.id, status, fileCount: uploaded.length },
  });

  revalidatePath(`/student/assignments/${assignmentId}`);
  revalidatePath("/student/assignments");
  revalidatePath(`/admin/assignments/${assignmentId}`);
  revalidatePath(`/teacher/assignments/${assignmentId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Shared: signed download URL (used by the download route handler)
// ---------------------------------------------------------------------------

/**
 * Not a form action — called server-to-server from the download route
 * handler. Student: only their own submission's files. Teacher: only
 * submissions for courses they teach. Admin/super-admin: any. Returns a
 * generic "not found" (never "forbidden") so file existence isn't leaked.
 */
export async function getSubmissionFileSignedUrl(
  submissionId: string,
  storageKey: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const session = await requireSession();

  const submission = await db.assignmentSubmission.findUnique({
    where: { id: submissionId },
    include: { assignment: true },
  });
  if (!submission) return { ok: false, error: "Not found." };

  const keys = submission.fileUrl ? safeParseKeys(submission.fileUrl) : [];
  if (!keys.includes(storageKey)) return { ok: false, error: "Not found." };

  if (session.role === "STUDENT") {
    const student = await db.student.findUnique({ where: { userId: session.userId } });
    if (!student || student.id !== submission.studentId) return { ok: false, error: "Not found." };
  } else if (session.role === "TEACHER") {
    const teacher = await db.teacher.findUnique({ where: { userId: session.userId } });
    if (!teacher) return { ok: false, error: "Not found." };
    try {
      await assertTeacherOwnsCourse(teacher.id, submission.assignment.courseId);
    } catch {
      return { ok: false, error: "Not found." };
    }
  }
  // ADMIN / SUPER_ADMIN: no further scoping.

  try {
    const url = await getSignedDownloadUrl(storageKey, { expiresInSeconds: 300 });
    return { ok: true, url };
  } catch {
    return { ok: false, error: "Could not generate a download link." };
  }
}
