"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff, requireStudentSelf } from "@/lib/auth/guards";
import { logAction } from "@/lib/audit";
import { notifyStudent, notifyUsers } from "@/lib/notifications";
import { createTicketSchema, replySchema, statusAfterReply } from "@/lib/support";

/**
 * Help & Support — write side.
 *
 * Guards: student operations use requireStudentSelf + an ownership check
 * on every ticket lookup (another student's ticket behaves as missing).
 * Admin operations use requireStaff(): the permission matrix has no
 * support/casework capability (announcement.* covers broadcasting, not
 * ticket work), so per the matrix's own convention staff features without
 * a dedicated key are gated to the ADMIN + SUPER_ADMIN roles.
 *
 * Notifications fire AFTER the ticket mutation commits and go through the
 * notification service, which never throws — a notification failure can
 * never fail or roll back a ticket action.
 */

export type SupportResult = { ok: true; ticketId?: string } | { ok: false; error: string };

async function adminUserIds(): Promise<string[]> {
  const rows = await db.user.findMany({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

function revalidateTicketPaths(ticketId: string) {
  revalidatePath("/student/support");
  revalidatePath(`/student/support/${ticketId}`);
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${ticketId}`);
}

// ---------------------------------------------------------------------------
// Student: create a ticket (first message included)
// ---------------------------------------------------------------------------

export async function createTicket(input: z.infer<typeof createTicketSchema>): Promise<SupportResult> {
  const { session, student } = await requireStudentSelf();
  const parsed = createTicketSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid ticket details." };
  }
  const d = parsed.data;

  const ticket = await db.$transaction(async (tx) => {
    const created = await tx.supportTicket.create({
      data: { studentId: student.id, subject: d.subject, category: d.category, status: "OPEN" },
    });
    const first = await tx.supportMessage.create({
      data: { ticketId: created.id, authorId: session.userId, body: d.message },
    });
    // lastMessageAt is the message's own DB timestamp, not a JS clock
    // value captured before the insert (which can precede it by ms).
    await tx.supportTicket.update({
      where: { id: created.id },
      data: { lastMessageAt: first.createdAt },
    });
    return created;
  });

  await logAction({
    userId: session.userId,
    action: "Opened support ticket",
    entity: "SupportTicket",
    entityId: ticket.id,
    metadata: { category: d.category },
  });

  await notifyUsers(await adminUserIds(), {
    type: "SUPPORT",
    title: "New support ticket",
    message: `${student.fullName} (${student.studentId}): ${d.subject}`,
    linkUrl: `/admin/support/${ticket.id}`,
    dedupeKey: `support-ticket:${ticket.id}`,
  });

  revalidateTicketPaths(ticket.id);
  return { ok: true, ticketId: ticket.id };
}

// ---------------------------------------------------------------------------
// Replies
// ---------------------------------------------------------------------------

export async function studentReply(input: z.infer<typeof replySchema>): Promise<SupportResult> {
  const { session, student } = await requireStudentSelf();
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid message." };
  }
  const d = parsed.data;

  const ticket = await db.supportTicket.findFirst({
    where: { id: d.ticketId, studentId: student.id },
    select: { id: true, subject: true, status: true },
  });
  if (!ticket) return { ok: false, error: "Ticket not found." };

  const message = await db.$transaction(async (tx) => {
    const created = await tx.supportMessage.create({
      data: { ticketId: ticket.id, authorId: session.userId, body: d.body },
    });
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: { status: statusAfterReply(ticket.status, "STUDENT"), lastMessageAt: created.createdAt },
    });
    return created;
  });

  await notifyUsers(await adminUserIds(), {
    type: "SUPPORT",
    title: "Support ticket reply",
    message: `${student.fullName} replied: ${ticket.subject}`,
    linkUrl: `/admin/support/${ticket.id}`,
    dedupeKey: `support-reply:${message.id}`,
  });

  revalidateTicketPaths(ticket.id);
  return { ok: true, ticketId: ticket.id };
}

export async function adminReply(input: z.infer<typeof replySchema>): Promise<SupportResult> {
  const session = await requireStaff();
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid message." };
  }
  const d = parsed.data;

  const ticket = await db.supportTicket.findUnique({
    where: { id: d.ticketId },
    select: { id: true, subject: true, status: true, studentId: true },
  });
  if (!ticket) return { ok: false, error: "Ticket not found." };

  const message = await db.$transaction(async (tx) => {
    const created = await tx.supportMessage.create({
      data: { ticketId: ticket.id, authorId: session.userId, body: d.body },
    });
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: { status: statusAfterReply(ticket.status, "ADMIN"), lastMessageAt: created.createdAt },
    });
    return created;
  });

  await logAction({
    userId: session.userId,
    action: "Replied to support ticket",
    entity: "SupportTicket",
    entityId: ticket.id,
  });

  await notifyStudent(ticket.studentId, {
    type: "SUPPORT",
    title: "Support replied to your ticket",
    message: ticket.subject,
    linkUrl: `/student/support/${ticket.id}`,
    dedupeKey: `support-reply:${message.id}`,
  });

  revalidateTicketPaths(ticket.id);
  return { ok: true, ticketId: ticket.id };
}

// ---------------------------------------------------------------------------
// Status changes
// ---------------------------------------------------------------------------

const setStatusSchema = z.object({
  ticketId: z.string().min(1),
  status: z.enum(["CLOSED", "OPEN"]),
});

/**
 * Admin close / reopen. ANSWERED is never set directly — it is only ever
 * the result of an admin reply. Reopening lands on OPEN: a reopened
 * ticket needs admin attention again.
 */
export async function setTicketStatus(input: z.infer<typeof setStatusSchema>): Promise<SupportResult> {
  const session = await requireStaff();
  const parsed = setStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid status change." };
  const d = parsed.data;

  const ticket = await db.supportTicket.findUnique({ where: { id: d.ticketId }, select: { id: true } });
  if (!ticket) return { ok: false, error: "Ticket not found." };

  await db.supportTicket.update({ where: { id: ticket.id }, data: { status: d.status } });
  await logAction({
    userId: session.userId,
    action: d.status === "CLOSED" ? "Closed support ticket" : "Reopened support ticket",
    entity: "SupportTicket",
    entityId: ticket.id,
  });

  revalidateTicketPaths(ticket.id);
  return { ok: true, ticketId: ticket.id };
}

/** Student closes their own ticket (e.g. the issue resolved itself). */
export async function closeMyTicket(input: { ticketId: string }): Promise<SupportResult> {
  const { session, student } = await requireStudentSelf();
  const ticketId = typeof input?.ticketId === "string" ? input.ticketId : "";
  const ticket = await db.supportTicket.findFirst({
    where: { id: ticketId, studentId: student.id },
    select: { id: true },
  });
  if (!ticket) return { ok: false, error: "Ticket not found." };

  await db.supportTicket.update({ where: { id: ticket.id }, data: { status: "CLOSED" } });
  await logAction({
    userId: session.userId,
    action: "Closed own support ticket",
    entity: "SupportTicket",
    entityId: ticket.id,
  });

  revalidateTicketPaths(ticket.id);
  return { ok: true, ticketId: ticket.id };
}
