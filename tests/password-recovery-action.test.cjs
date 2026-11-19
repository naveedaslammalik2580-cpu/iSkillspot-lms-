// Action-layer authorization tests for sendResetLinkAction — node:test.
//
// Mission 2 (§2B) added an explicit requirePermission("account.manage")
// at the top of sendResetLinkAction (src/lib/actions/password-recovery.ts);
// previously the action only checked for any session and the permission
// was enforced one layer down inside sendAccountResetLink. These tests
// exercise the REAL action through the project's source-loader harness
// (real TS source, real Prisma against a disposable database, real JWT
// verification; only the framework request context — cookies — is
// stubbed, exactly as in tests/auth.test.cjs):
//
// - no session            -> redirect to /login (NEXT_REDIRECT)
// - STUDENT session       -> redirect to /forbidden (NEXT_REDIRECT)
// - ADMIN / SUPER_ADMIN   -> guard passes; with no email provider
//   configured the action reaches the delivery layer and returns the
//   honest "Email is not configured…" result for a manageable target
// - ADMIN -> SUPER_ADMIN target -> the downstream manageable-target
//   hierarchy still rejects it (generic failure result), proving the
//   action-layer check did not weaken the service-layer checks
//
// Refuses to run against a non-test or non-local database.
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { SignJWT } = require("jose");
const { PrismaClient } = require("@prisma/client");
const { context } = require("./source-loader.cjs");

const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(
  ["localhost", "127.0.0.1"].includes(url.hostname) && /test/.test(url.pathname),
  "Disposable local test database required",
);

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const env = {
  NODE_ENV: "development",
  SESSION_SECRET: randomBytes(48).toString("hex"),
  // Deliberately no SMTP_HOST / RESEND_API_KEY / EMAIL_FROM: the email
  // provider is unconfigured, so an authorized call must surface the
  // action's "not-configured" result rather than queue anything.
};
const c = context(db, env);
const recovery = c.load("src/lib/actions/password-recovery.ts");

const userIds = [];
async function mkUser(role) {
  const s = randomBytes(5).toString("hex");
  const u = await db.user.create({
    data: {
      username: `pra_${s}`,
      email: `pra_${s}@test.local`,
      passwordHash: "x",
      role,
      status: "ACTIVE",
    },
  });
  userIds.push(u.id);
  if (role === "STUDENT") {
    await db.student.create({
      data: { userId: u.id, studentId: `PRA-${s}`, fullName: "Recovery Action Student", status: "ACTIVE" },
    });
  }
  return u;
}

async function signInAs(u) {
  const token = await new SignJWT({
    userId: u.id,
    username: u.username,
    role: u.role,
    mustChangePassword: false,
    sessionVersion: u.sessionVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(env.SESSION_SECRET));
  c.jar.set("isp_session", { value: token });
}

let superAdmin, admin, studentActor, studentTarget, superAdminTarget;
test.before(async () => {
  superAdmin = await mkUser("SUPER_ADMIN");
  admin = await mkUser("ADMIN");
  studentActor = await mkUser("STUDENT");
  studentTarget = await mkUser("STUDENT");
  superAdminTarget = await mkUser("SUPER_ADMIN");
});
test.after(async () => {
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

function isRedirectTo(err, path) {
  return (
    err &&
    typeof err.digest === "string" &&
    err.digest.startsWith("NEXT_REDIRECT") &&
    err.digest.includes(path)
  );
}

test("sendResetLinkAction: no session redirects to /login", async () => {
  c.jar.delete("isp_session");
  await assert.rejects(
    () => recovery.sendResetLinkAction(studentTarget.id),
    (err) => isRedirectTo(err, "/login"),
  );
});

test("sendResetLinkAction: STUDENT session redirects to /forbidden", async () => {
  await signInAs(studentActor);
  await assert.rejects(
    () => recovery.sendResetLinkAction(studentTarget.id),
    (err) => isRedirectTo(err, "/forbidden"),
  );
});

test("sendResetLinkAction: ADMIN passes the guard and reaches the delivery layer", async () => {
  await signInAs(admin);
  const result = await recovery.sendResetLinkAction(studentTarget.id);
  assert.deepEqual(result, {
    ok: false,
    error: "Email is not configured. Use the authorized temporary-password reset instead.",
  });
});

test("sendResetLinkAction: SUPER_ADMIN passes the guard and reaches the delivery layer", async () => {
  await signInAs(superAdmin);
  const result = await recovery.sendResetLinkAction(studentTarget.id);
  assert.deepEqual(result, {
    ok: false,
    error: "Email is not configured. Use the authorized temporary-password reset instead.",
  });
});

test("sendResetLinkAction: downstream hierarchy still blocks ADMIN acting on a SUPER_ADMIN", async () => {
  await signInAs(admin);
  const result = await recovery.sendResetLinkAction(superAdminTarget.id);
  assert.deepEqual(result, {
    ok: false,
    error: "Unable to queue a reset link for this account.",
  });
});
