/**
 * Zod 4 migration regression tests — node:test via tsx (pure, no database).
 *
 * Mission 2 (Phase 5) upgraded zod 3.25.76 -> 4.6.7 (closes
 * GHSA-mrhx-c7xc-m3w5). The mechanical API changes (.error.errors ->
 * .error.issues, errorMap -> error) are type-checked, but these tests pin
 * the VALIDATION SEMANTICS of the important exported schemas so a future
 * zod bump cannot silently change what the app accepts or the first
 * error message a user sees:
 * - accept/reject verdicts for realistic inputs
 * - normalization (trim/lowercase) and coercion behaviour
 * - custom first-issue messages, incl. the two migrated errorMap sites
 * - strict-object rejection and refine paths
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emailSchema, usernameSchema } from "@/lib/auth/identity";
import { strongPassword } from "@/lib/auth/password";
import { adminAccountSchema } from "@/lib/auth/accounts";
import { registrationSchema, approvalSchema } from "@/lib/admissions";
import { paymentMethodsSchema } from "@/lib/admission-policy";
import {
  questionFieldsSchema,
  validateQuestionFields,
} from "@/lib/quiz-questions";
import { pushSubscriptionSchema } from "@/lib/push-subscriptions";

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  assert.equal(result.success, false);
  return result.error!.issues[0].message;
}

describe("emailSchema (zod 4 string format semantics)", () => {
  it("accepts and normalizes a valid address", () => {
    assert.equal(emailSchema.parse("  User@Example.COM "), "user@example.com");
  });
  it("accepts internal-style domains used across the app", () => {
    assert.equal(emailSchema.safeParse("student@test.local").success, true);
  });
  it("rejects malformed addresses with the custom message", () => {
    assert.equal(firstMessage(emailSchema.safeParse("not-an-email")), "Valid email required");
    assert.equal(emailSchema.safeParse("").success, false);
    assert.equal(emailSchema.safeParse("missing@tld").success, false);
  });
});

describe("usernameSchema", () => {
  it("trims and lowercases", () => {
    assert.equal(usernameSchema.parse("  Naveed.M "), "naveed.m");
  });
  it("rejects illegal characters with the custom message", () => {
    assert.equal(
      firstMessage(usernameSchema.safeParse("bad name!")),
      "Use letters, numbers, dots, underscores or hyphens",
    );
  });
});

describe("strongPassword", () => {
  it("accepts a compliant password", () => {
    assert.equal(strongPassword.safeParse("Str0ng!Passw0rd").success, true);
  });
  it("rejects a short password with the length message first", () => {
    assert.equal(firstMessage(strongPassword.safeParse("Ab1!x")), "Use at least 12 characters");
  });
  it("rejects a password missing character classes", () => {
    assert.equal(
      firstMessage(strongPassword.safeParse("alllowercase123")),
      "Use uppercase, lowercase, a number, and a symbol",
    );
  });
});

describe("registrationSchema", () => {
  const valid = {
    fullName: "Test Student",
    email: "new.student@example.com",
    phone: "+92 300 1234567",
    password: "Str0ng!Passw0rd",
    confirmPassword: "Str0ng!Passw0rd",
  };
  it("accepts a valid registration", () => {
    assert.equal(registrationSchema.safeParse(valid).success, true);
  });
  it("rejects mismatched passwords at the confirmPassword path", () => {
    const r = registrationSchema.safeParse({ ...valid, confirmPassword: "Different!Pass1" });
    assert.equal(r.success, false);
    if (!r.success) {
      assert.equal(r.error.issues[0].message, "Passwords do not match");
      assert.deepEqual(r.error.issues[0].path, ["confirmPassword"]);
    }
  });
  it("rejects a bad email with the shared email message", () => {
    assert.equal(firstMessage(registrationSchema.safeParse({ ...valid, email: "nope" })), "Valid email required");
  });
});

describe("approvalSchema (migrated errorMap -> error)", () => {
  const valid = {
    id: "app-1",
    courseId: "course-1",
    batchId: "batch-1",
    amount: 1500,
    method: "CASH",
    reference: "TXN-12345",
    verified: true,
    installments: false,
  };
  it("accepts a valid approval (with number coercion)", () => {
    const r = approvalSchema.safeParse({ ...valid, amount: "1500" });
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.amount, 1500);
  });
  it("rejects unverified approvals with the exact migrated message", () => {
    assert.equal(
      firstMessage(approvalSchema.safeParse({ ...valid, verified: false })),
      "Verify the actual transaction before approval",
    );
  });
});

describe("adminAccountSchema (strict object)", () => {
  it("accepts exactly username + email", () => {
    assert.equal(
      adminAccountSchema.safeParse({ username: "new.admin", email: "admin@example.com" }).success,
      true,
    );
  });
  it("rejects unknown keys", () => {
    assert.equal(
      adminAccountSchema.safeParse({ username: "new.admin", email: "admin@example.com", role: "SUPER_ADMIN" }).success,
      false,
    );
  });
});

describe("questionFieldsSchema + validateQuestionFields", () => {
  it("coerces points and validates a 4-option MCQ end to end", () => {
    const parsed = questionFieldsSchema.parse({
      question: "2 + 2 = ?",
      type: "MULTIPLE_CHOICE",
      options: ["1", "2", "3", "4"],
      correctAnswer: "4",
      points: "5",
    });
    assert.equal(parsed.points, 5);
    assert.deepEqual(validateQuestionFields(parsed), {
      options: ["1", "2", "3", "4"],
      correctAnswer: "4",
    });
  });
  it("rejects zero points with the custom message", () => {
    assert.equal(
      firstMessage(
        questionFieldsSchema.safeParse({ question: "Q?", type: "SHORT_ANSWER", points: 0 }),
      ),
      "Points must be at least 1",
    );
  });
  it("flags an MCQ without exactly 4 options in the field validator", () => {
    const parsed = questionFieldsSchema.parse({
      question: "Pick one",
      type: "MULTIPLE_CHOICE",
      options: ["a", "b", "c"],
      correctAnswer: "a",
      points: 1,
    });
    assert.deepEqual(validateQuestionFields(parsed), {
      error: "Multiple choice questions need exactly 4 non-empty options.",
    });
  });
});

describe("paymentMethodsSchema", () => {
  it("accepts a configured method list", () => {
    assert.equal(
      paymentMethodsSchema.safeParse([{ name: "Bank", method: "BANK_TRANSFER", account: "PK00-123" }]).success,
      true,
    );
  });
  it("rejects an empty list and unknown methods", () => {
    assert.equal(paymentMethodsSchema.safeParse([]).success, false);
    assert.equal(
      paymentMethodsSchema.safeParse([{ name: "X", method: "BARTER", account: "abc" }]).success,
      false,
    );
  });
});

describe("pushSubscriptionSchema (zod 4 .url() semantics)", () => {
  const valid = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
    keys: { p256dh: "B".repeat(88), auth: "a".repeat(22) },
  };
  it("accepts a well-formed subscription", () => {
    assert.equal(pushSubscriptionSchema.safeParse(valid).success, true);
  });
  it("rejects non-https endpoints with the refine message", () => {
    assert.equal(
      firstMessage(pushSubscriptionSchema.safeParse({ ...valid, endpoint: "http://example.com/x" })),
      "endpoint must be https",
    );
  });
  it("rejects a non-URL endpoint", () => {
    assert.equal(pushSubscriptionSchema.safeParse({ ...valid, endpoint: "not a url" }).success, false);
  });
});
