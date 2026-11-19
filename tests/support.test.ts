/**
 * Help & Support tests (pure — no database).
 *
 * Covers the shared helpers in src/lib/support.ts: the ticket status
 * transition rules, category labels, the create/reply input bounds, and
 * the WhatsApp link builder. The DB-backed flows (actions, pages,
 * notifications) are covered by browser E2E.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  createTicketSchema,
  replySchema,
  statusAfterReply,
  supportCategoryLabel,
  whatsAppLink,
} from "@/lib/support";
import type { SupportTicketStatus } from "@prisma/client";

describe("statusAfterReply", () => {
  const currents: SupportTicketStatus[] = ["OPEN", "ANSWERED", "CLOSED"];

  it("a student reply always lands on OPEN (waiting for admin)", () => {
    for (const current of currents) {
      assert.equal(statusAfterReply(current, "STUDENT"), "OPEN", `from ${current}`);
    }
  });

  it("an admin reply always lands on ANSWERED (waiting for student)", () => {
    for (const current of currents) {
      assert.equal(statusAfterReply(current, "ADMIN"), "ANSWERED", `from ${current}`);
    }
  });

  it("replying to a CLOSED ticket reopens it (both directions)", () => {
    assert.equal(statusAfterReply("CLOSED", "STUDENT"), "OPEN");
    assert.equal(statusAfterReply("CLOSED", "ADMIN"), "ANSWERED");
  });
});

describe("support categories", () => {
  it("has exactly the five categories, each with a human label", () => {
    assert.deepEqual(SUPPORT_CATEGORIES, [
      "COURSE_ACCESS",
      "PAYMENT",
      "TECHNICAL",
      "QUIZ_ASSIGNMENT",
      "OTHER",
    ]);
    assert.equal(supportCategoryLabel("COURSE_ACCESS"), "Course access");
    assert.equal(supportCategoryLabel("PAYMENT"), "Payment");
    assert.equal(supportCategoryLabel("TECHNICAL"), "Technical issue");
    assert.equal(supportCategoryLabel("QUIZ_ASSIGNMENT"), "Quiz / Assignment");
    assert.equal(supportCategoryLabel("OTHER"), "Other");
    for (const c of SUPPORT_CATEGORIES) {
      assert.ok(SUPPORT_CATEGORY_LABELS[c].length > 0);
    }
  });
});

describe("createTicketSchema", () => {
  const valid = { category: "PAYMENT" as const, subject: "Paid but course is locked", message: "I paid on Monday via bank transfer." };

  it("accepts a valid ticket and trims whitespace", () => {
    const r = createTicketSchema.safeParse({ ...valid, subject: "  Paid but course is locked  " });
    assert.ok(r.success);
    if (r.success) assert.equal(r.data.subject, "Paid but course is locked");
  });

  it("rejects a subject shorter than 3 characters", () => {
    assert.equal(createTicketSchema.safeParse({ ...valid, subject: "hi" }).success, false);
    assert.equal(createTicketSchema.safeParse({ ...valid, subject: "   " }).success, false);
  });

  it("rejects a subject longer than 120 characters", () => {
    assert.equal(createTicketSchema.safeParse({ ...valid, subject: "x".repeat(121) }).success, false);
    assert.equal(createTicketSchema.safeParse({ ...valid, subject: "x".repeat(120) }).success, true);
  });

  it("rejects an empty or over-long message", () => {
    assert.equal(createTicketSchema.safeParse({ ...valid, message: "" }).success, false);
    assert.equal(createTicketSchema.safeParse({ ...valid, message: "   " }).success, false);
    assert.equal(createTicketSchema.safeParse({ ...valid, message: "x".repeat(5001) }).success, false);
    assert.equal(createTicketSchema.safeParse({ ...valid, message: "x".repeat(5000) }).success, true);
  });

  it("rejects an unknown category", () => {
    assert.equal(createTicketSchema.safeParse({ ...valid, category: "BILLING" }).success, false);
  });
});

describe("replySchema", () => {
  it("accepts a normal reply", () => {
    assert.equal(replySchema.safeParse({ ticketId: "t1", body: "Thanks, that worked." }).success, true);
  });

  it("rejects an empty body and a missing ticket id", () => {
    assert.equal(replySchema.safeParse({ ticketId: "t1", body: "  " }).success, false);
    assert.equal(replySchema.safeParse({ ticketId: "", body: "hello" }).success, false);
  });
});

describe("whatsAppLink", () => {
  it("builds a wa.me link from an international number with punctuation", () => {
    assert.equal(whatsAppLink("+92 300 1234567"), "https://wa.me/923001234567");
    assert.equal(whatsAppLink("+92-300-1234567"), "https://wa.me/923001234567");
  });

  it("drops a 00 international prefix", () => {
    assert.equal(whatsAppLink("0092 300 1234567"), "https://wa.me/923001234567");
  });

  it("returns null for empty or non-number input", () => {
    assert.equal(whatsAppLink(""), null);
    assert.equal(whatsAppLink(null), null);
    assert.equal(whatsAppLink(undefined), null);
    assert.equal(whatsAppLink("call me maybe"), null);
    assert.equal(whatsAppLink("123"), null);
  });
});
