import { z } from "zod";
import type { SupportCategory, SupportTicketStatus } from "@prisma/client";

/**
 * Help & Support — shared pure helpers (no DB, no session).
 *
 * Kept separate from src/lib/data/support.ts and src/lib/actions/support.ts
 * so the status rules, category labels and input bounds are unit-testable
 * in isolation (tests/support.test.ts) and identical in both portals.
 */

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  COURSE_ACCESS: "Course access",
  PAYMENT: "Payment",
  TECHNICAL: "Technical issue",
  QUIZ_ASSIGNMENT: "Quiz / Assignment",
  OTHER: "Other",
};

export const SUPPORT_CATEGORIES = Object.keys(
  SUPPORT_CATEGORY_LABELS
) as SupportCategory[];

export function supportCategoryLabel(category: SupportCategory): string {
  return SUPPORT_CATEGORY_LABELS[category] ?? "Other";
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

/**
 * Status semantics (agency model):
 * - OPEN     = the ball is with the admin team.
 * - ANSWERED = an admin replied; the ball is with the student.
 * - CLOSED   = resolved.
 *
 * A reply always moves the ball to the other side, regardless of the
 * current status — which is also what makes "replying to a CLOSED ticket
 * reopens it" fall out naturally:
 * - student reply -> OPEN (from OPEN, ANSWERED or CLOSED)
 * - admin reply   -> ANSWERED (from OPEN, ANSWERED or CLOSED)
 */
export function statusAfterReply(
  _current: SupportTicketStatus,
  author: "STUDENT" | "ADMIN"
): SupportTicketStatus {
  return author === "STUDENT" ? "OPEN" : "ANSWERED";
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

/**
 * Bounds (deliberate, keep in sync with tests/support.test.ts):
 * - subject: 3–120 chars after trimming — long enough to summarise an
 *   issue, short enough to stay a subject line in inbox lists.
 * - message body: 1–5000 chars after trimming — a full problem report
 *   with room for pasted error text, but not a document dump.
 */
export const SUPPORT_SUBJECT_MIN = 3;
export const SUPPORT_SUBJECT_MAX = 120;
export const SUPPORT_BODY_MAX = 5000;

export const createTicketSchema = z.object({
  category: z.enum(["COURSE_ACCESS", "PAYMENT", "TECHNICAL", "QUIZ_ASSIGNMENT", "OTHER"]),
  subject: z
    .string()
    .trim()
    .min(SUPPORT_SUBJECT_MIN, `Subject must be at least ${SUPPORT_SUBJECT_MIN} characters.`)
    .max(SUPPORT_SUBJECT_MAX, `Subject must be at most ${SUPPORT_SUBJECT_MAX} characters.`),
  message: z
    .string()
    .trim()
    .min(1, "Please describe your issue.")
    .max(SUPPORT_BODY_MAX, `Message must be at most ${SUPPORT_BODY_MAX} characters.`),
});

export const replySchema = z.object({
  ticketId: z.string().min(1),
  body: z
    .string()
    .trim()
    .min(1, "Please write a message.")
    .max(SUPPORT_BODY_MAX, `Message must be at most ${SUPPORT_BODY_MAX} characters.`),
});

// ---------------------------------------------------------------------------
// Contact links
// ---------------------------------------------------------------------------

/**
 * Build a wa.me link from a free-form WhatsApp number ("+92 300 1234567",
 * "0300-1234567", …). wa.me requires the full international format, so we
 * keep digits only; a leading "00" international prefix is dropped.
 * Returns null when there are not enough digits to be a real number.
 */
export function whatsAppLink(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 7 || digits.length > 15) return null;
  return `https://wa.me/${digits}`;
}
