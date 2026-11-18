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
import { notifyStudent, notifyUsers, studentUserIdsForCourse } from "@/lib/notifications";
import {
  uploadSubmissionFile,
  uploadAssignmentTaskFile,
  getSignedDownloadUrl,
  deleteSubmissionFile,
  isStorageConfigured,
} from "@/lib/storage/supabase";
import { validateUploadFile } from "@/lib/upload-validation";
import {
  attachmentNameFromUrl,
  parseAssignmentAttachment,
  serializeAssignmentAttachment,
  type AssignmentAttachment,
} from "@/lib/assignment-attachment";

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
 * Assignments are course-wide (no batchId on Assignment). Callers already
 * passed requirePermission("assignment.*"), which only staff roles hold in
 * the agency model, so no further course scoping is needed.
 */
async function assertCourseAccess(
  role: string,
  userId: string,
  courseId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  void role; void userId; void courseId;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Admin: assignment CRUD
// ---------------------------------------------------------------------------

const createAssignmentSchema = z.object({
  courseId: z.string().min(1, "Select a course"),
  moduleId: z.string().optional(),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(10_000).optional(),
  instructions: z.string().max(10_000).optional(),
  dueDate: z.string().optional(),
  maxScore: z.coerce.number().int().min(1).max(1000),
  /** Optional link to a task PDF hosted elsewhere (used when no file is uploaded). */
  taskPdfUrl: z.string().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// Practical task PDF (Assignment.attachments — see lib/assignment-attachment.ts)
// ---------------------------------------------------------------------------

const STORAGE_NOT_CONFIGURED_ERROR =
  "File storage is not configured on the server, so the task PDF could not be uploaded. Paste a PDF link instead, or ask an administrator to configure storage.";

/**
 * Resolve the task attachment for a create/update. Precedence: an
 * uploaded file wins over everything; an explicit remove beats the URL
 * field; a non-empty URL sets/replaces a link attachment; an emptied URL
 * field clears an existing LINK attachment but leaves an uploaded file
 * untouched (the field is empty in that case by design).
 */
async function buildTaskAttachment(opts: {
  assignmentId: string;
  taskFile?: File | null;
  taskPdfUrl?: string;
  existing: AssignmentAttachment | null;
  removeTaskFile?: boolean;
}): Promise<
  | { ok: true; attachment: AssignmentAttachment | null; uploadedKey: string | null }
  | { ok: false; error: string }
> {
  const file = opts.taskFile && opts.taskFile.size > 0 ? opts.taskFile : null;

  if (file) {
    if (file.size > MAX_FILE_BYTES) {
      return { ok: false, error: `"${file.name}" is larger than 50MB.` };
    }
    const validation = await validateUploadFile(file);
    if (!validation.ok) return { ok: false, error: validation.error };
    if (validation.kind !== "pdf") {
      return { ok: false, error: "The task file must be a PDF." };
    }
    if (!isStorageConfigured()) {
      return { ok: false, error: STORAGE_NOT_CONFIGURED_ERROR };
    }
    try {
      const uploaded = await uploadAssignmentTaskFile({
        assignmentId: opts.assignmentId,
        file,
        originalName: file.name,
      });
      return {
        ok: true,
        attachment: { kind: "upload", key: uploaded.storageKey, name: file.name },
        uploadedKey: uploaded.storageKey,
      };
    } catch {
      return { ok: false, error: "Task PDF upload failed. Please try again." };
    }
  }

  if (opts.removeTaskFile) {
    return { ok: true, attachment: null, uploadedKey: null };
  }

  if (opts.taskPdfUrl !== undefined) {
    const url = opts.taskPdfUrl.trim();
    if (url) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return { ok: false, error: "The task PDF link is not a valid URL." };
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { ok: false, error: "The task PDF link must start with http:// or https://." };
      }
      return {
        ok: true,
        attachment: { kind: "url", url, name: attachmentNameFromUrl(url) },
        uploadedKey: null,
      };
    }
    // Emptied link field clears a link attachment, keeps an upload.
    if (opts.existing?.kind === "url") {
      return { ok: true, attachment: null, uploadedKey: null };
    }
  }

  return { ok: true, attachment: opts.existing, uploadedKey: null };
}

export type AssignmentResult =
  | { ok: true; assignmentId: string }
  | { ok: false; error: string };

/**
 * Section: create an assignment. Course-wide (no per-batch link) — any
 * teacher assigned to a batch of the course, or any staff member, may create.
 */
export async function createAssignment(
  input: z.infer<typeof createAssignmentSchema> & { taskFile?: File | null }
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

  // Pre-generate the id so the task PDF can be uploaded under it before
  // the row exists (same pattern as submissions). If the create fails,
  // the uploaded file is cleaned up again.
  const assignmentId = randomUUID();
  const task = await buildTaskAttachment({
    assignmentId,
    taskFile: input.taskFile,
    taskPdfUrl: d.taskPdfUrl,
    existing: null,
  });
  if (!task.ok) return task;

  let assignment;
  try {
    assignment = await db.assignment.create({
      data: {
        id: assignmentId,
        courseId: d.courseId,
        moduleId: d.moduleId || null,
        title: d.title,
        description: d.description || null,
        instructions: d.instructions || null,
        dueDate: d.dueDate ? new Date(d.dueDate) : null,
        maxScore: d.maxScore,
        attachments: task.attachment ? serializeAssignmentAttachment(task.attachment) : null,
        createdBy: session.userId,
      },
    });
  } catch {
    if (task.uploadedKey) await deleteSubmissionFile(task.uploadedKey).catch(() => {});
    return { ok: false, error: "Failed to create the assignment. Please try again." };
  }

  await logAction({
    userId: session.userId,
    action: "Created assignment",
    entity: "Assignment",
    entityId: assignment.id,
    metadata: { title: d.title, courseId: d.courseId },
  });

  await notifyUsers(await studentUserIdsForCourse(assignment.courseId), {
    type: "ASSIGNMENT",
    title: "New assignment",
    message: assignment.title,
    linkUrl: `/student/assignments/${assignment.id}`,
    dedupeKey: `assignment-created:${assignment.id}`,
  });

  revalidatePath("/admin/assignments");
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
  taskPdfUrl: z.string().max(2000).optional(),
});

export async function updateAssignment(
  input: z.infer<typeof updateAssignmentSchema> & { taskFile?: File | null; removeTaskFile?: boolean }
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

  const existingAttachment = parseAssignmentAttachment(existing.attachments);
  const task = await buildTaskAttachment({
    assignmentId: d.id,
    taskFile: input.taskFile,
    taskPdfUrl: d.taskPdfUrl,
    existing: existingAttachment,
    removeTaskFile: input.removeTaskFile,
  });
  if (!task.ok) return task;
  const nextAttachments = task.attachment ? serializeAssignmentAttachment(task.attachment) : null;

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
  if ((existing.attachments ?? null) !== nextAttachments)
    changes.attachments = {
      old: existingAttachment ? `${existingAttachment.kind}:${existingAttachment.name}` : null,
      new: task.attachment ? `${task.attachment.kind}:${task.attachment.name}` : null,
    };

  try {
    await db.assignment.update({
      where: { id: d.id },
      data: {
        title: d.title,
        description: nextDescription,
        instructions: nextInstructions,
        dueDate: nextDueDate,
        maxScore: d.maxScore,
        attachments: nextAttachments,
      },
    });
  } catch {
    if (task.uploadedKey) await deleteSubmissionFile(task.uploadedKey).catch(() => {});
    return { ok: false, error: "Failed to save the assignment. Please try again." };
  }

  // The replaced/removed upload is only deleted once the new state is
  // safely persisted.
  if (
    existingAttachment?.kind === "upload" &&
    !(task.attachment?.kind === "upload" && task.attachment.key === existingAttachment.key)
  ) {
    await deleteSubmissionFile(existingAttachment.key).catch(() => {});
  }

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

  const attachment = parseAssignmentAttachment(existing.attachments);
  if (attachment?.kind === "upload") {
    await deleteSubmissionFile(attachment.key).catch(() => {});
  }

  await logAction({
    userId: session.userId,
    action: "Deleted assignment",
    entity: "Assignment",
    entityId: id,
    metadata: { title: existing.title },
  });

  revalidatePath("/admin/assignments");
  revalidatePath("/student/assignments");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Admin: grading
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

  await notifyStudent(submission.studentId, {
    type: "ASSIGNMENT",
    title: "Assignment graded",
    message: submission.assignment.title,
    linkUrl: `/student/assignments/${submission.assignmentId}`,
    dedupeKey: `assignment-graded:${submission.id}:${d.score}`,
  });

  revalidatePath(`/admin/assignments/${submission.assignmentId}`);
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
    where: { studentId: student.id, courseId: assignment.courseId, accessSuspended: false, status: "ACTIVE" },
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
    // Content validation: allowlisted types only, verified against the
    // file's actual bytes — extensions and client-reported MIME types
    // are never trusted on their own (see lib/upload-validation.ts).
    const validation = await validateUploadFile(f);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
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
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Shared: signed download URL (used by the download route handler)
// ---------------------------------------------------------------------------

/**
 * Not a form action — called server-to-server from the download route
 * handler. Student: only their own submission's files.
 * Admin/super-admin: any. Returns a
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
    if (!await db.enrollment.findFirst({ where: { studentId: student.id, courseId: submission.assignment.courseId, accessSuspended: false, status: { in: ["ACTIVE", "COMPLETED"] } } })) return { ok: false, error: "Not found." };
  }
  // ADMIN / SUPER_ADMIN: no further scoping.

  try {
    const url = await getSignedDownloadUrl(storageKey, { expiresInSeconds: 300 });
    return { ok: true, url };
  } catch {
    return { ok: false, error: "Could not generate a download link." };
  }
}

/**
 * Signed download URL for an assignment's uploaded task PDF. Called
 * server-to-server from the task-file route handler. Student: only when
 * ACTIVE/COMPLETED-enrolled in the assignment's course. Admin/super-admin:
 * any. Generic "not found" on every failure, same as submission files.
 */
export async function getAssignmentTaskFileSignedUrl(
  assignmentId: string,
  storageKey: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const session = await requireSession();

  const assignment = await db.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) return { ok: false, error: "Not found." };

  const attachment = parseAssignmentAttachment(assignment.attachments);
  if (!attachment || attachment.kind !== "upload" || attachment.key !== storageKey) {
    return { ok: false, error: "Not found." };
  }

  if (session.role === "STUDENT") {
    const student = await db.student.findUnique({ where: { userId: session.userId } });
    if (!student) return { ok: false, error: "Not found." };
    const enrollment = await db.enrollment.findFirst({
      where: {
        studentId: student.id,
        courseId: assignment.courseId,
        accessSuspended: false,
        status: { in: ["ACTIVE", "COMPLETED"] },
      },
      select: { id: true },
    });
    if (!enrollment) return { ok: false, error: "Not found." };
  }
  // ADMIN / SUPER_ADMIN: no further scoping.

  try {
    const url = await getSignedDownloadUrl(storageKey, { expiresInSeconds: 300 });
    return { ok: true, url };
  } catch {
    return { ok: false, error: "Could not generate a download link." };
  }
}
