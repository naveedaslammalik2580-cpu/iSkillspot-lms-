# Login investigation — 2026-11-13

## Confirmed cause

The email supplied for this investigation exists in Supabase's `auth.users`
(one match), but not in the LMS's `public."User"` (zero matches). A second
lookup ignoring email/username case and surrounding whitespace also found no
LMS user. The application uses custom Prisma/bcrypt authentication; it does
not sign in with Supabase Auth or automatically copy Supabase Auth users.

`src/lib/actions/auth.ts` therefore returns `Invalid credentials.` at its
`if (!user)` check. Password verification, account status, JWT creation, and
role redirects are never reached for this identifier. No production login
code change is warranted for this data/provisioning mismatch.

## Database and account checks

The diagnostic loaded the environment using Next's environment loader, and
queried the configured `DATABASE_URL` with Prisma in an explicitly read-only
transaction. No hashes, passwords, connection credentials, or tokens were
logged.

- Runtime URL: Supabase transaction pooler, port 6543, database `postgres`,
  with `pgbouncer` configured.
- `DIRECT_URL`: pooler session connection, port 5432, same project/database.
- `SUPABASE_URL`: same project reference as both database URLs. This URL is
  used for file storage, not for LMS login.
- Database connectivity and `public."User"`/`auth.users` existence confirmed.
- `SESSION_SECRET` is present and meets the application's minimum length.
- Supabase Auth record: confirmed email, structurally valid bcrypt password
  format, API role `authenticated`.
- Its actual password was not supplied or verified. Hash format validation
  alone does not establish password correctness.
- LMS password hash, status, role, and required fields cannot be validated
  for this identity because the LMS user record is absent. Supabase's
  `authenticated` API role is not an LMS role.

The configured project contains the supplied email in Supabase Auth. No
separate expected project name was supplied for independent confirmation.

## Complete login path

1. `src/app/login/page.tsx` submits `identifier`, `password`, and optional
   `remember` to `loginAction` through React `useActionState`.
2. `src/lib/actions/auth.ts` validates inputs with Zod and applies an
   identifier rate limit (eight attempts per fifteen-minute window).
3. Prisma looks up an exact username, exact email, or linked
   `Student.studentId` in the LMS `User` model. Case and whitespace are not
   normalized by this lookup; they were independently ruled out here.
4. Missing users and users whose `User.status` is not `ACTIVE` receive the
   generic credentials error. Active users are verified with
   `bcrypt.compare` against `User.passwordHash`.
5. An incorrect password creates a failed-login audit entry. A correct
   password updates `lastLogin`, creates a signed session, and creates a
   successful-login audit entry. These writes are why existing live accounts
   were not used as test fixtures.
6. `src/lib/auth/session.ts` signs HS256 JWTs using `jose`, stored in the
   `isp_session` httpOnly cookie with `sameSite=lax`, path `/`, and `secure`
   in production. Lifetime is eight hours, or thirty days with remember me.
7. `mustChangePassword` redirects students to `/student/change-password`
   and other roles to `/change-password` before their dashboard.
8. `homePathFor` sends `SUPER_ADMIN` and `ADMIN` to `/admin/dashboard`,
   `TEACHER` to `/teacher/dashboard`, and `STUDENT` to `/student/dashboard`.
9. `src/middleware.ts` validates JWTs, enforces route roles and forced
   password changes, and rejects invalid/expired sessions. Server guards
   check sessions/roles again. Teacher and student layouts additionally
   require their linked `Teacher` or `Student` profile.

## Safe correction procedure — not executed

1. Confirm the intended LMS role and a unique LMS username. Choose only an
   authorized role: `SUPER_ADMIN`, `ADMIN`, `TEACHER`, or `STUDENT`.
2. For a teacher or student, prefer the existing authorized staff creation
   workflow. `createTeacher` and `createStudentAction` already create the
   LMS `User`, hash a temporary password at bcrypt cost 12, set `ACTIVE`,
   require a first-login password change, and create the linked profile.
   Student creation also handles enrollment and its required course/batch.
3. If an administrator account must be provisioned, obtain authorization
   before a targeted server-side Prisma creation in the confirmed database.
   Use the existing `hashPassword` helper on a privately entered new
   password. The intended data shape is:

   ```ts
   {
     username: approvedUsername,
     email: approvedEmail,
     passwordHash: await hashPassword(privatelyEnteredPassword),
     role: approvedRole,
     status: "ACTIVE",
     mustChangePassword: true,
   }
   ```

   Prisma supplies the ID and timestamps. Direct SQL must supply required
   values such as `id` and `updatedAt` that Prisma normally generates.
   Do not store plaintext in `passwordHash`, hash a pre-existing hash again,
   expose passwords in shell arguments/logs, or copy Supabase API roles into
   the LMS role column. Leave the Supabase Auth account unchanged.
4. For any already-existing LMS account with an incorrect hash, use its
   authorized password-reset workflow or an explicitly approved targeted
   update using `hashPassword`; do not overwrite unrelated user fields.
5. Verify a real login after provisioning, the forced password change if
   applicable, the intended dashboard, and persistence after a browser
   reload. Use a disposable nonproduction account for invalid-password,
   remember-me, logout, and cross-role checks.

No seed, migration, database reset, production account creation/update, or
permission changes were performed during this investigation.

## Verification

`node --test tests/auth.test.cjs`: **19 passed, 0 failed**. The tests execute
the existing TypeScript authentication source with real bcrypt, `jose`, Next
redirects, and Next middleware. Only database writes/lookups and request
cookie/header stores are replaced with isolated in-memory fixtures. No
environment file or real Prisma client is loaded by this suite.

Coverage includes valid passwords for all four roles, incorrect passwords,
plaintext password rejection, inactive/suspended users, exact identifier
lookup shape, eight-hour/thirty-day session persistence, production cookie
security, forced password changes, forbidden role access, missing/invalid/
expired sessions, logout, input validation, and rate limiting.

These successful fixture logins are not successful live database logins.
No pre-existing safe test database, test credentials, or configured test
runner was found in the repository. The installed Playwright package and
system Edge browser are available for a local browser check.

Local browser verification ran against the production build on loopback port
3100 using the installed Playwright package and headless system Edge:

- Login page rendered successfully (HTTP 200).
- Submitting the supplied email with a random, disposable test input
  reproduced `Invalid credentials.` through the real form, server action,
  and configured Prisma database. The server action returned a handled
  HTTP 200 response, and no session cookie was created. The missing-user
  branch runs before any account or audit writes.
- Unauthenticated requests to `/admin/dashboard`, `/teacher/dashboard`,
  and `/student/dashboard` redirected to `/login`.
- No browser runtime errors occurred in the successful run.

The first local server started through npm could not connect to Supabase
on submission; the directly launched Next process connected and completed
the browser checks. This transient test-process failure is separate from
the confirmed missing-user cause. An existing local server was left alone;
only the server started for this investigation was stopped after testing.

**Real successful database login was not verified.** The requested identity
has no LMS user, no actual password was provided, and no approved safe LMS
test credentials were available. Correct/incorrect passwords, authenticated
session persistence, and authenticated role redirects were verified only
with the isolated fixtures described above.

Build/type verification:

- `npx tsc --noEmit`: passed.
- `npx next build`: passed, including compilation, lint/type validation,
  all 54 static pages, route generation, and middleware. The final run had
  database network access; an earlier sandboxed run had connectivity
  warnings during page-data checks.
- `npm run build`: blocked at `prisma generate` by Windows `EPERM` while
  renaming the generated Prisma engine DLL, including on an elevated retry.
  The successful Next build used the existing generated Prisma client;
  schema/client regeneration was not verified. No processes owned by the
  user were stopped to release the DLL.

Files added: this report and `tests/auth.test.cjs`. Application source,
schema, environment, login UI, permissions, and existing user edits were
left unchanged. Temporary database/browser diagnostic scripts were removed.

Reference checked: [Supabase's Prisma connection guide](https://supabase.com/docs/guides/database/prisma).
