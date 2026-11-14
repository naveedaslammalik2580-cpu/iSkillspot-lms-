/**
 * Cross-module regression tests — node:test via tsx.
 *
 * Covers the invariants other modules depend on, at the deepest layer
 * that can be exercised without an HTTP session (session-bound server
 * actions themselves are covered by browser E2E):
 * - Fee/payment math through the REAL recomputeFeeStatus used by the
 *   record/void payment actions (same transaction path).
 * - Certificate verification semantics used by the public /verify page
 *   (exact-code lookup; ISSUED vs REVOKED vs unknown).
 * - Notification read-side ownership scoping (a user only ever reads
 *   their own notifications through the data layer).
 *
 * Disposable database only (refuses non-"test" database names). All
 * fixtures are created here and removed via cascade afterwards.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { recomputeFeeStatus } from "@/lib/actions/fees";
import { generateVerificationCode } from "@/lib/ids";
import { notifyUsers } from "@/lib/notifications";
import { getNotificationsPage, getRecentNotifications, getUnreadCount } from "@/lib/data/notifications";

const userIds: string[] = [];
const courseIds: string[] = [];
let studentId: string;
let courseId: string;
let userA: string;
let userB: string;

before(async () => {
  const row = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  assert.match(row[0].current_database, /test/, "refusing to run tests against a non-test database");

  const suffix = Math.random().toString(36).slice(2, 10);
  const mkUser = async (role: "STUDENT" | "ADMIN") => {
    const s = Math.random().toString(36).slice(2, 10);
    const u = await db.user.create({
      data: { username: `rg_${s}`, email: `rg_${s}@test.local`, passwordHash: "x", role, status: "ACTIVE" },
    });
    userIds.push(u.id);
    return u;
  };
  const owner = await mkUser("STUDENT");
  userA = owner.id;
  userB = (await mkUser("STUDENT")).id;

  const student = await db.student.create({
    data: { userId: owner.id, studentId: `RG-${suffix}`, fullName: "Regression Student" },
  });
  studentId = student.id;

  const course = await db.course.create({ data: { title: "Regression Course", slug: `rg-${suffix}`, status: "PUBLISHED" } });
  courseId = course.id;
  courseIds.push(courseId);
});

after(async () => {
  await db.course.deleteMany({ where: { id: { in: courseIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

async function makeFee(finalFee: number, dueDate: Date | null = null) {
  return db.fee.create({
    data: { studentId, courseId, totalFee: finalFee, discount: 0, finalFee, amountPaid: 0, remainingBalance: finalFee, dueDate, status: "UNPAID" },
  });
}

async function pay(feeId: string, amount: number, voided = false) {
  return db.payment.create({
    data: { feeId, studentId, amount, paymentDate: new Date(), voidedAt: voided ? new Date() : null, voidReason: voided ? "regression void" : null },
  });
}

describe("fee/payment calculations (recomputeFeeStatus — the production code path)", () => {
  it("sums active payments, derives remaining balance and PAID status", async () => {
    const fee = await makeFee(1000);
    await pay(fee.id, 400);
    await pay(fee.id, 600);
    await db.$transaction((tx) => recomputeFeeStatus(tx, fee.id));
    const after = await db.fee.findUniqueOrThrow({ where: { id: fee.id } });
    assert.equal(after.amountPaid, 1000);
    assert.equal(after.remainingBalance, 0);
    assert.equal(after.status, "PAID");
  });

  it("voided payments stop counting (void restores the balance)", async () => {
    const fee = await makeFee(1000);
    await pay(fee.id, 400);
    await pay(fee.id, 600, true); // voided
    await db.$transaction((tx) => recomputeFeeStatus(tx, fee.id));
    const after = await db.fee.findUniqueOrThrow({ where: { id: fee.id } });
    assert.equal(after.amountPaid, 400);
    assert.equal(after.remainingBalance, 600);
    assert.equal(after.status, "PARTIAL");
  });

  it("clamps remaining balance at zero and marks overdue unpaid fees", async () => {
    const fee = await makeFee(500, new Date(Date.now() - 86400000));
    await pay(fee.id, 700); // data-level overpayment: clamp must hold
    await db.$transaction((tx) => recomputeFeeStatus(tx, fee.id));
    const after = await db.fee.findUniqueOrThrow({ where: { id: fee.id } });
    assert.equal(after.remainingBalance, 0);

    const overdue = await makeFee(500, new Date(Date.now() - 86400000));
    await db.$transaction((tx) => recomputeFeeStatus(tx, overdue.id));
    const o = await db.fee.findUniqueOrThrow({ where: { id: overdue.id } });
    assert.equal(o.status, "OVERDUE");
    assert.equal(o.remainingBalance, 500);
  });

  it("never recomputes a WAIVED fee", async () => {
    const fee = await makeFee(800);
    await db.fee.update({ where: { id: fee.id }, data: { status: "WAIVED" } });
    await pay(fee.id, 800);
    await db.$transaction((tx) => recomputeFeeStatus(tx, fee.id));
    const after = await db.fee.findUniqueOrThrow({ where: { id: fee.id } });
    assert.equal(after.status, "WAIVED");
    assert.equal(after.amountPaid, 0); // untouched by recompute
  });
});

describe("certificate verification semantics (public /verify page rules)", () => {
  it("exact code finds the certificate; ISSUED verifies, REVOKED does not, unknown finds nothing", async () => {
    const issuedCode = generateVerificationCode();
    const revokedCode = generateVerificationCode();
    await db.certificate.create({
      data: { studentId, courseId, certificateNumber: `CERT-T-${issuedCode}`, verificationCode: issuedCode, status: "ISSUED", issueDate: new Date() },
    });
    await db.certificate.create({
      data: { studentId, courseId, certificateNumber: `CERT-T-${revokedCode}`, verificationCode: revokedCode, status: "REVOKED", issueDate: new Date() },
    });

    const found = await db.certificate.findUnique({ where: { verificationCode: issuedCode } });
    assert.ok(found);
    assert.equal(found.status === "ISSUED", true); // page rule: valid

    const revoked = await db.certificate.findUnique({ where: { verificationCode: revokedCode } });
    assert.equal(revoked?.status, "REVOKED"); // page rule: shown as revoked, not valid

    const missing = await db.certificate.findUnique({ where: { verificationCode: "ZZZZZZZZZZZZ" } });
    assert.equal(missing, null);
  });

  it("verification codes are 12 chars from the unambiguous alphabet and effectively unique", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const code = generateVerificationCode();
      assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/);
      codes.add(code);
    }
    assert.equal(codes.size, 500);
  });
});

describe("notification ownership scoping (data layer)", () => {
  it("a user reads only their own notifications", async () => {
    await notifyUsers([userA], {
      type: "SYSTEM",
      title: "For A only",
      message: "ownership regression",
      dedupeKey: `regression-ownership:${userA}`,
    });
    assert.equal(await getUnreadCount(userA), 1);
    assert.equal(await getUnreadCount(userB), 0);
    const recentB = await getRecentNotifications(userB);
    assert.equal(recentB.some((n) => n.title === "For A only"), false);
    const pageB = await getNotificationsPage(userB, {});
    assert.equal(pageB.rows.length, 0);
    const pageA = await getNotificationsPage(userA, {});
    assert.equal(pageA.rows.length, 1);
  });
});
