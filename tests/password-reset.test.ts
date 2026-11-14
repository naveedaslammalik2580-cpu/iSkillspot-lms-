/**
 * Password recovery tests — node:test via tsx.
 *
 * Exercises the REAL recovery service (src/lib/auth/password-reset.ts)
 * and the staff link service (src/lib/auth/accounts.ts) against a
 * disposable database (refuses non-"test" database names):
 * - tokens are stored ONLY as SHA-256 hashes, expire in 30 minutes
 * - single use: replay after a successful reset fails
 * - issuing a new token supersedes the previous one
 * - expired tokens cannot be consumed
 * - a successful reset changes the password, clears the forced-change
 *   flags and bumps sessionVersion (the session-revocation mechanism)
 * - ineligible (deactivated) accounts cannot complete a reset
 * - issuance is capped per hour (email-bombing guard)
 * - staff link-sending enforces the role hierarchy server-side
 * - with no email provider configured, delivery honestly reports
 *   "not-configured" and no live token is left behind
 *
 * Every test uses its own fixture account so the per-hour issuance cap
 * and token superseding never leak between tests.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

process.env.APP_URL = "http://localhost:3100";
delete process.env.SMTP_HOST;
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;

import { db } from "@/lib/db";
import {
  hashResetToken,
  issuePasswordResetToken,
  verifyPasswordResetToken,
  consumePasswordResetToken,
  RESET_TOKEN_TTL_MINUTES,
} from "@/lib/auth/password-reset";
import { sendAccountResetLink } from "@/lib/auth/accounts";
import { verifyPassword } from "@/lib/auth/password";
import { emailProviderConfigured, sendEmail } from "@/lib/email";
import type { SessionPayload } from "@/lib/auth/token";

const userIds: string[] = [];
const NEW_PASSWORD = "BrandNew#Pass2026";

async function mkUser(role: "SUPER_ADMIN" | "ADMIN" | "TEACHER" | "STUDENT") {
  const s = Math.random().toString(36).slice(2, 10);
  const u = await db.user.create({
    data: { username: `pr_${s}`, email: `pr_${s}@test.local`, passwordHash: "x", role, status: "ACTIVE" },
  });
  userIds.push(u.id);
  return u;
}

async function mkStudentUser() {
  const u = await mkUser("STUDENT");
  const s = Math.random().toString(36).slice(2, 8);
  await db.student.create({
    data: { userId: u.id, studentId: `PR-${s}`, fullName: "Reset Test Student" },
  });
  return u;
}

function sessionOf(u: { id: string; username: string; role: SessionPayload["role"]; sessionVersion: number }): SessionPayload {
  return { userId: u.id, username: u.username, role: u.role, mustChangePassword: false, sessionVersion: u.sessionVersion };
}

before(async () => {
  const row = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  assert.match(row[0].current_database, /test/, "refusing to run tests against a non-test database");
});

after(async () => {
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("token storage and lifecycle", () => {
  it("stores only the SHA-256 hash, with a ~30 minute expiry", async () => {
    const user = await mkStudentUser();
    const issued = await issuePasswordResetToken(user.id, null);
    assert.ok(issued);
    const row = await db.passwordResetToken.findFirst({ where: { userId: user.id } });
    assert.ok(row);
    assert.equal(row.tokenHash, hashResetToken(issued.token));
    assert.notEqual(row.tokenHash, issued.token);
    assert.equal(row.tokenHash, createHash("sha256").update(issued.token).digest("hex"));
    const ttlMs = row.expiresAt.getTime() - Date.now();
    assert.ok(ttlMs > (RESET_TOKEN_TTL_MINUTES - 2) * 60_000 && ttlMs <= RESET_TOKEN_TTL_MINUTES * 60_000);
    assert.equal(row.usedAt, null);
  });

  it("verifies a live token and rejects garbage", async () => {
    const user = await mkStudentUser();
    const issued = await issuePasswordResetToken(user.id, null);
    assert.ok(issued);
    assert.deepEqual(await verifyPasswordResetToken(issued.token), { userId: user.id });
    assert.equal(await verifyPasswordResetToken("not-a-real-token"), null);
    assert.equal(await verifyPasswordResetToken(""), null);
  });

  it("a new token supersedes the previous one", async () => {
    const user = await mkStudentUser();
    const first = await issuePasswordResetToken(user.id, null);
    const second = await issuePasswordResetToken(user.id, null);
    assert.ok(first && second);
    assert.equal(await verifyPasswordResetToken(first.token), null);
    assert.deepEqual(await verifyPasswordResetToken(second.token), { userId: user.id });
    const consumed = await consumePasswordResetToken(first.token, NEW_PASSWORD);
    assert.equal(consumed.ok, false);
  });

  it("expired tokens verify as null and cannot be consumed", async () => {
    const user = await mkStudentUser();
    const token = "expired-fixture-token-0123456789abcdef";
    await db.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() - 60_000) },
    });
    assert.equal(await verifyPasswordResetToken(token), null);
    const consumed = await consumePasswordResetToken(token, NEW_PASSWORD);
    assert.deepEqual(consumed, { ok: false, reason: "expired" });
  });

  it("issuance is capped per account per hour", async () => {
    const user = await mkStudentUser();
    for (let i = 0; i < 5; i++) {
      assert.ok(await issuePasswordResetToken(user.id, null), `issue #${i + 1} should succeed`);
    }
    assert.equal(await issuePasswordResetToken(user.id, null), null);
  });
});

describe("consuming a token", () => {
  it("resets the password, clears forced-change flags and bumps sessionVersion", async () => {
    const user = await mkStudentUser();
    await db.user.update({ where: { id: user.id }, data: { mustChangePassword: true, passwordExpiresAt: new Date(Date.now() + 3600_000) } });
    const issued = await issuePasswordResetToken(user.id, null);
    assert.ok(issued);
    const result = await consumePasswordResetToken(issued.token, NEW_PASSWORD);
    assert.deepEqual(result, { ok: true, userId: user.id });

    const after = await db.user.findUnique({ where: { id: user.id } });
    assert.ok(after);
    assert.equal(await verifyPassword(NEW_PASSWORD, after.passwordHash), true);
    assert.equal(after.mustChangePassword, false);
    assert.equal(after.passwordExpiresAt, null);
    assert.ok(after.sessionVersion > user.sessionVersion, "sessionVersion must increase (revokes existing sessions)");

    const row = await db.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(issued.token) } });
    assert.ok(row?.usedAt, "token must be marked used");
  });

  it("replay of the same link fails and changes nothing", async () => {
    const user = await mkStudentUser();
    const issued = await issuePasswordResetToken(user.id, null);
    assert.ok(issued);
    assert.equal((await consumePasswordResetToken(issued.token, NEW_PASSWORD)).ok, true);
    const replay = await consumePasswordResetToken(issued.token, "Another#Pass2026");
    assert.deepEqual(replay, { ok: false, reason: "used" });
    const after = await db.user.findUnique({ where: { id: user.id } });
    assert.equal(await verifyPassword(NEW_PASSWORD, after!.passwordHash), true, "password must be unchanged by the replay");
  });

  it("a deactivated account cannot complete a reset", async () => {
    const user = await mkStudentUser();
    const issued = await issuePasswordResetToken(user.id, null);
    assert.ok(issued);
    await db.user.update({ where: { id: user.id }, data: { status: "INACTIVE" } });
    const result = await consumePasswordResetToken(issued.token, NEW_PASSWORD);
    assert.deepEqual(result, { ok: false, reason: "ineligible" });
  });

  it("an unknown token is rejected as invalid", async () => {
    const result = await consumePasswordResetToken("never-issued-token", NEW_PASSWORD);
    assert.deepEqual(result, { ok: false, reason: "invalid" });
  });
});

describe("staff-initiated reset links", () => {
  it("email provider honestly reports not-configured when unset", async () => {
    assert.equal(emailProviderConfigured(), false);
    const res = await sendEmail({ to: "x@test.local", subject: "t", text: "t", html: "<p>t</p>" });
    assert.deepEqual(res, { delivered: false, reason: "not-configured" });
  });

  it("ADMIN may send a link to a STUDENT; unconfigured email leaves no live token", async () => {
    const admin = await mkUser("ADMIN");
    const student = await mkStudentUser();
    const result = await sendAccountResetLink(sessionOf(admin), student.id, "STUDENT");
    assert.equal(result, "not-configured");
    assert.equal(await db.passwordResetToken.count({ where: { userId: student.id, usedAt: null } }), 0);
  });

  it("SUPER_ADMIN may send a link to an ADMIN account", async () => {
    const superAdmin = await mkUser("SUPER_ADMIN");
    const admin = await mkUser("ADMIN");
    const result = await sendAccountResetLink(sessionOf(superAdmin), admin.id, "ADMIN");
    assert.equal(result, "not-configured"); // authorized; only delivery is unavailable
  });

  it("ADMIN cannot send a link to another ADMIN", async () => {
    const admin = await mkUser("ADMIN");
    const otherAdmin = await mkUser("ADMIN");
    await assert.rejects(sendAccountResetLink(sessionOf(admin), otherAdmin.id, "ADMIN"));
  });

  it("SUPER_ADMIN cannot be targeted through recovery", async () => {
    const superAdmin = await mkUser("SUPER_ADMIN");
    const otherSuper = await mkUser("SUPER_ADMIN");
    await assert.rejects(sendAccountResetLink(sessionOf(superAdmin), otherSuper.id));
  });

  it("TEACHER cannot initiate resets for anyone", async () => {
    const teacher = await mkUser("TEACHER");
    await db.teacher.create({ data: { userId: teacher.id, fullName: "Reset Test Teacher", email: teacher.email } });
    const student = await mkStudentUser();
    await assert.rejects(sendAccountResetLink(sessionOf(teacher), student.id, "STUDENT"));
  });

  it("nobody can send a reset link to themselves", async () => {
    const admin = await mkUser("ADMIN");
    await assert.rejects(sendAccountResetLink(sessionOf(admin), admin.id, "ADMIN"));
  });

  it("role mismatch via expectedRole is rejected", async () => {
    const admin = await mkUser("ADMIN");
    const student = await mkStudentUser();
    await assert.rejects(sendAccountResetLink(sessionOf(admin), student.id, "TEACHER"));
  });
});
