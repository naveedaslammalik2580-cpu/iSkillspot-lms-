// Login-flow tests for Mission 3 — removal of the mandatory
// password-change gate. node:test, same source-loader harness as
// tests/password-recovery-action.test.cjs (real TS source, real Prisma
// against a disposable database, real JWT verification; only the
// framework request context — cookies — is stubbed).
//
// Covered (Mission 3 brief §6):
//  1. ADMIN with mustChangePassword=true logs in and is redirected to
//     the admin dashboard — NOT to any change-password page.
//  2. STUDENT with mustChangePassword=true logs in and is redirected to
//     the student home — NOT to /student/change-password.
//  3./4. Normal (unflagged) ADMIN and STUDENT logins land on the same
//     dashboards.
//  5. No session -> guards redirect to /login.
//  6. STUDENT session is rejected from staff guards (/forbidden).
//  7. ADMIN is rejected from a SUPER_ADMIN-only permission
//     ("settings.manage") — an existing RBAC boundary.
//  8. Forgot-password / reset-link flows: covered by the existing
//     tests/password-reset.test.ts and
//     tests/password-recovery-action.test.cjs in this same suite
//     (not duplicated here).
// Plus:
//  - Flagged sessions pass requireStaff / requireStudentSelf with no
//    redirect at all (the guard-level gate is gone — no loop possible).
//  - Middleware passes flagged ADMIN/STUDENT cookies through with no
//    redirect (the edge-level gate is gone).
//  - The PRESERVED temp-password expiry lockout still rejects a flagged
//    account whose passwordExpiresAt is in the past (Mission 3 decision:
//    expiry semantics unchanged — only the forced-change gate was
//    removed).
//
// Refuses to run against a non-test or non-local database.
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { SignJWT } = require("jose");
const { PrismaClient } = require("@prisma/client");
const { NextRequest } = require("next/server");
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
};
const c = context(db, env);
const authActions = c.load("src/lib/actions/auth.ts");
const guards = c.load("src/lib/auth/guards.ts");
const passwordLib = c.load("src/lib/auth/password.ts");
const { middleware } = c.load("src/middleware.ts");

const PASSWORD = "M3-login-test-pass";
const userIds = [];
let passwordHash;

async function mkUser(role, { flagged = false, expired = false } = {}) {
  const s = randomBytes(5).toString("hex");
  const u = await db.user.create({
    data: {
      username: `m3_${s}`,
      email: `m3_${s}@test.local`,
      passwordHash,
      role,
      status: "ACTIVE",
      mustChangePassword: flagged,
      passwordExpiresAt: expired ? new Date(Date.now() - 60_000) : null,
    },
  });
  userIds.push(u.id);
  if (role === "STUDENT") {
    await db.student.create({
      data: { userId: u.id, studentId: `M3-${s}`, fullName: "Mission Three Student", status: "ACTIVE" },
    });
  }
  return u;
}

async function signInAs(u) {
  const token = await new SignJWT({
    userId: u.id,
    username: u.username,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
    sessionVersion: u.sessionVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(env.SESSION_SECRET));
  c.jar.set("isp_session", { value: token });
  return token;
}

function loginForm(identifier) {
  const fd = new FormData();
  fd.set("identifier", identifier);
  fd.set("password", PASSWORD);
  return fd;
}

function isRedirectTo(err, path) {
  return (
    err &&
    typeof err.digest === "string" &&
    err.digest.startsWith("NEXT_REDIRECT") &&
    err.digest.includes(path)
  );
}

let flaggedAdmin, normalAdmin, expiredAdmin, flaggedStudent, normalStudent;
test.before(async () => {
  passwordHash = await passwordLib.hashPassword(PASSWORD);
  flaggedAdmin = await mkUser("ADMIN", { flagged: true });
  normalAdmin = await mkUser("ADMIN");
  expiredAdmin = await mkUser("ADMIN", { flagged: true, expired: true });
  flaggedStudent = await mkUser("STUDENT", { flagged: true });
  normalStudent = await mkUser("STUDENT");
});
test.after(async () => {
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

// --- §6.1 / §6.2: flagged accounts log straight into their dashboards ---

test("login: flagged ADMIN lands on /admin/dashboard, never change-password", async () => {
  c.jar.delete("isp_session");
  await assert.rejects(
    () => authActions.loginAction({}, loginForm(flaggedAdmin.username)),
    (err) =>
      isRedirectTo(err, "/admin/dashboard") && !err.digest.includes("change-password"),
  );
  // A real session was created before the redirect.
  assert.ok(c.jar.get("isp_session")?.value, "session cookie set");
});

test("login: flagged STUDENT lands on /student/courses, never change-password", async () => {
  c.jar.delete("isp_session");
  await assert.rejects(
    () => authActions.loginAction({}, loginForm(flaggedStudent.username)),
    (err) =>
      isRedirectTo(err, "/student/courses") && !err.digest.includes("change-password"),
  );
  assert.ok(c.jar.get("isp_session")?.value, "session cookie set");
});

// --- §6.3 / §6.4: normal accounts ---

test("login: normal ADMIN lands on /admin/dashboard", async () => {
  c.jar.delete("isp_session");
  await assert.rejects(
    () => authActions.loginAction({}, loginForm(normalAdmin.username)),
    (err) => isRedirectTo(err, "/admin/dashboard"),
  );
});

test("login: normal STUDENT lands on /student/courses", async () => {
  c.jar.delete("isp_session");
  await assert.rejects(
    () => authActions.loginAction({}, loginForm(normalStudent.username)),
    (err) => isRedirectTo(err, "/student/courses"),
  );
});

// --- Preserved behavior: expired temporary passwords still lock out ---

test("login: flagged ADMIN with EXPIRED temp password is still rejected (expiry lockout preserved)", async () => {
  c.jar.delete("isp_session");
  const result = await authActions.loginAction({}, loginForm(expiredAdmin.username));
  assert.deepEqual(result, { error: "Invalid credentials." });
  assert.equal(c.jar.get("isp_session"), undefined, "no session created");
});

// --- Guard level: flagged sessions are no longer blocked (no loop) ---

test("guards: flagged ADMIN passes requireStaff with no redirect", async () => {
  await signInAs(flaggedAdmin);
  const session = await guards.requireStaff();
  assert.equal(session.userId, flaggedAdmin.id);
  assert.equal(session.role, "ADMIN");
});

test("guards: flagged STUDENT passes requireStudentSelf with no redirect", async () => {
  await signInAs(flaggedStudent);
  const { session, student } = await guards.requireStudentSelf();
  assert.equal(session.userId, flaggedStudent.id);
  assert.equal(student.userId, flaggedStudent.id);
});

// --- §6.5 / §6.6 / §6.7: access control unchanged ---

test("guards: no session redirects to /login", async () => {
  c.jar.delete("isp_session");
  await assert.rejects(
    () => guards.requireStaff(),
    (err) => isRedirectTo(err, "/login"),
  );
});

test("guards: STUDENT is rejected from staff routes (/forbidden)", async () => {
  await signInAs(normalStudent);
  await assert.rejects(
    () => guards.requireStaff(),
    (err) => isRedirectTo(err, "/forbidden"),
  );
});

test("guards: ADMIN is rejected from SUPER_ADMIN-only settings.manage (/forbidden)", async () => {
  await signInAs(normalAdmin);
  await assert.rejects(
    () => guards.requirePermission("settings.manage"),
    (err) => isRedirectTo(err, "/forbidden"),
  );
});

// --- Middleware level: flagged cookies pass through, no forced redirect ---

test("middleware: flagged ADMIN cookie passes /admin/dashboard through (no redirect)", async () => {
  const token = await signInAs(flaggedAdmin);
  const req = new NextRequest("http://localhost/admin/dashboard", {
    headers: { cookie: `isp_session=${token}` },
  });
  const res = await middleware(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("location"), null);
});

test("middleware: flagged STUDENT cookie passes /student/courses through (no redirect)", async () => {
  const token = await signInAs(flaggedStudent);
  const req = new NextRequest("http://localhost/student/courses", {
    headers: { cookie: `isp_session=${token}` },
  });
  const res = await middleware(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("location"), null);
});
