import type { Prisma, Role, SupportCategory, SupportTicketStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { whatsAppLink } from "@/lib/support";

/**
 * Help & Support — read side. Every function re-checks ownership/scope
 * itself (same convention as src/lib/data/assignments.ts): student reads
 * are always constrained to the caller's own Student row, so a page can
 * 404 instead of leaking another student's ticket.
 */

// ---------------------------------------------------------------------------
// Contact info (admin Settings -> student Help page / Profile card)
// ---------------------------------------------------------------------------

export interface SupportContact {
  email: string;
  whatsapp: string;
  whatsappLink: string | null;
}

export async function getSupportContact(): Promise<SupportContact> {
  const [email, whatsapp] = await Promise.all([
    getSetting("supportEmail"),
    getSetting("supportWhatsApp"),
  ]);
  return { email: email.trim(), whatsapp: whatsapp.trim(), whatsappLink: whatsAppLink(whatsapp) };
}

// ---------------------------------------------------------------------------
// Student reads
// ---------------------------------------------------------------------------

export interface MyTicketItem {
  id: string;
  subject: string;
  category: SupportCategory;
  status: SupportTicketStatus;
  lastMessageAt: Date;
  createdAt: Date;
  messageCount: number;
}

export async function getMyTickets(studentId: string): Promise<MyTicketItem[]> {
  const rows = await db.supportTicket.findMany({
    where: { studentId },
    orderBy: { lastMessageAt: "desc" },
    include: { _count: { select: { messages: true } } },
  });
  return rows.map((t) => ({
    id: t.id,
    subject: t.subject,
    category: t.category,
    status: t.status,
    lastMessageAt: t.lastMessageAt,
    createdAt: t.createdAt,
    messageCount: t._count.messages,
  }));
}

// ---------------------------------------------------------------------------
// Thread reads (shared shape for both portals)
// ---------------------------------------------------------------------------

export interface SupportThreadMessage {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string;
  authorRole: Role;
  authorName: string;
  /** "student" = the ticket owner; "staff" = an admin/super admin. */
  side: "student" | "staff";
}

export interface SupportThread {
  id: string;
  subject: string;
  category: SupportCategory;
  status: SupportTicketStatus;
  createdAt: Date;
  lastMessageAt: Date;
  student: {
    id: string;
    fullName: string;
    studentCode: string;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
  };
  messages: SupportThreadMessage[];
}

const threadInclude = {
  student: {
    select: { id: true, fullName: true, studentId: true, email: true, phone: true, whatsapp: true, userId: true },
  },
  messages: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { id: true, username: true, role: true } } },
  },
};

type ThreadRow = Prisma.SupportTicketGetPayload<{ include: typeof threadInclude }>;

function toThread(t: ThreadRow): SupportThread {
  return {
    id: t.id,
    subject: t.subject,
    category: t.category,
    status: t.status,
    createdAt: t.createdAt,
    lastMessageAt: t.lastMessageAt,
    student: {
      id: t.student.id,
      fullName: t.student.fullName,
      studentCode: t.student.studentId,
      email: t.student.email,
      phone: t.student.phone,
      whatsapp: t.student.whatsapp,
    },
    messages: t.messages.map((m) => {
      const fromStudent = m.authorId === t.student.userId;
      return {
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        authorId: m.authorId,
        authorRole: m.author.role,
        authorName: fromStudent ? t.student.fullName : m.author.username,
        side: fromStudent ? ("student" as const) : ("staff" as const),
      };
    }),
  };
}

/** Student thread read — returns null for another student's ticket. */
export async function getMyTicketThread(studentId: string, ticketId: string): Promise<SupportThread | null> {
  const t = await db.supportTicket.findFirst({ where: { id: ticketId, studentId }, include: threadInclude });
  return t ? toThread(t) : null;
}

/** Admin thread read — any ticket. */
export async function getTicketThreadForAdmin(ticketId: string): Promise<SupportThread | null> {
  const t = await db.supportTicket.findFirst({ where: { id: ticketId }, include: threadInclude });
  return t ? toThread(t) : null;
}

// ---------------------------------------------------------------------------
// Admin inbox
// ---------------------------------------------------------------------------

export interface SupportInboxItem {
  id: string;
  subject: string;
  category: SupportCategory;
  status: SupportTicketStatus;
  lastMessageAt: Date;
  studentName: string;
  studentCode: string;
  messageCount: number;
  lastMessagePreview: string | null;
}

export async function getSupportInbox(status?: SupportTicketStatus): Promise<SupportInboxItem[]> {
  const rows = await db.supportTicket.findMany({
    where: status ? { status } : undefined,
    orderBy: { lastMessageAt: "desc" },
    include: {
      student: { select: { fullName: true, studentId: true } },
      _count: { select: { messages: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } },
    },
  });
  return rows.map((t) => ({
    id: t.id,
    subject: t.subject,
    category: t.category,
    status: t.status,
    lastMessageAt: t.lastMessageAt,
    studentName: t.student.fullName,
    studentCode: t.student.studentId,
    messageCount: t._count.messages,
    lastMessagePreview: t.messages[0]?.body ?? null,
  }));
}

export async function getSupportStatusCounts(): Promise<{ ALL: number; OPEN: number; ANSWERED: number; CLOSED: number }> {
  const grouped = await db.supportTicket.groupBy({ by: ["status"], _count: { _all: true } });
  const counts = { ALL: 0, OPEN: 0, ANSWERED: 0, CLOSED: 0 };
  for (const g of grouped) {
    counts[g.status] = g._count._all;
    counts.ALL += g._count._all;
  }
  return counts;
}
