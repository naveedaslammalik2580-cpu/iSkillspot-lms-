# Authentication and User Accounts implementation — 2026-11-14

Live follow-up: the operator has now applied the four SQL steps. Read-only
inspection confirmed the completed migration and matching checksum. See
[the live verification record](auth-live-verification.md) for current browser
and release-readiness status. The implementation-time status below is retained
as historical evidence.

Application changes are complete and locally verified. Shared Supabase SQL
and real Supabase login verification remain pending operator execution.
The dependency-security review and final verification status are recorded
below; local success is not a claim of production readiness.

## Architecture and fixes, in order

1. Retained Next.js App Router, Prisma PostgreSQL User accounts, bcrypt cost
   12 and jose HS256 JWT cookies. Supabase Auth remains separate. No public
   registration or second authentication provider was added.
2. Added versioned JWTs and current database validation on every protected
   server read/action. Inactive/deleted users, changed roles/versions,
   missing/inactive profiles and expired temporary credentials fail closed.
   A DB trigger increments the version after password, role, status or
   forced-password state changes, including direct operator updates.
3. Enforced first-login password change in server guards, including direct
   actions. Password-change pages explicitly permit only the authenticated
   password-change flow; student layout avoids a redirect loop.
4. Added 24-hour temporary-password expiry, longer random temporary secrets,
   a twelve-character mixed-character password policy and a 72 UTF-8 byte
   limit to prevent bcrypt truncation. Resets invalidate earlier sessions;
   successful password change creates a fresh versioned session.
5. Replaced process-local throttling with atomic database-backed identifier
   throttling, HMAC keys and expiry cleanup. Invalid-account, password,
   status/profile and expired-credential logins share a generic error.
   Password hashing is still performed for unknown identifiers. Failed
   known-account logins are audited without credentials.
6. Normalized new usernames/emails and added normalized unique indexes.
   Ambiguous legacy identifier matches are rejected. Provisioning never
   writes auth.users, copies its hashes, upserts or overwrites an LMS user.
7. Kept existing teacher/student creation, profiles, enrollment and fee
   behavior. Creation and audit logging now share transactions. Identity/ID
   allocation uses transaction locks. Existing management actions recheck
   actor permissions and the linked account's current role.
8. Added operator-only bootstrap with hidden interactive password input,
   explicit project confirmation, a transaction advisory lock, existing
   SUPER_ADMIN detection and a durable one-time marker. It never overwrites
   an account or adds another SUPER_ADMIN when one exists.
9. Added `/admin/accounts`, guarded reads/actions, administrator creation,
   activation/deactivation and password reset. Teacher/student creation
   links reuse existing workflows. No role-promotion action exists.
10. Kept safe deactivation, academic/payment history, teacher ongoing-batch
    restrictions and student academic suspensions. Logout clears the cookie
    even during DB/audit failure. Shared user data was not modified.

## User Accounts permission matrix

| Operation | SUPER_ADMIN | ADMIN | TEACHER/STUDENT |
|---|---|---|---|
| List manageable accounts | ADMIN, TEACHER, STUDENT | TEACHER, STUDENT | Denied |
| Create ADMIN | Allowed | Denied | Denied |
| Existing teacher/student provisioning | Allowed | Allowed | Denied |
| Reset/activate/deactivate | ADMIN, TEACHER, STUDENT | TEACHER, STUDENT | Denied |
| Manage SUPER_ADMIN or promote roles | Denied in normal UI/actions | Denied | Denied |
| Initial SUPER_ADMIN | Operator CLI on genuinely empty installation only | Denied | Denied |

`account.manage` is granted only to staff; `admin.manage` remains exclusive
to SUPER_ADMIN. Actor and target are revalidated inside mutation
transactions. Account-list queries omit hashes, secrets and JWTs. Temporary
reset credentials are masked and available only in authorized client state
for private copying/dismissal. They are not stored in browser persistence.

## SQL and operator execution

There is one new versioned migration:
`prisma/migrations/20261113120000_auth_account_lifecycle/migration.sql`.
It adds two User security fields, AuthThrottle, AccountBootstrap, identity
indexes, RLS/API restrictions for auth tables and a revocation trigger.
No academic/financial records are removed or rewritten. Existing temporary
password accounts receive a documented 24-hour transition window; permanent
passwords and roles are unchanged. Legacy JWTs require a fresh sign-in.

Exact manual execution order:

1. `docs/sql/01-auth-preflight.sql` — read-only.
2. `prisma/migrations/20261113120000_auth_account_lifecycle/migration.sql`
   — entire transactional migration, executed once.
3. `docs/sql/03-auth-postflight.sql` — read-only verification and counts.
4. `docs/sql/04-auth-reconcile-history.sql` — checksum-matched history entry,
   or use `prisma migrate resolve --applied` instead when connected.

Follow [the complete deployment runbook](SUPABASE-AUTH-DEPLOYMENT.md).
Do not apply new code to the old schema. No live migration, role change,
SUPER_ADMIN creation/reset or account repair was executed. The known shared
SUPER_ADMIN is deliberately left alone; bootstrap is not needed there.

## Tests actually executed

The runner initializes a separately password-protected PostgreSQL 18 cluster
on loopback with random credentials and fresh database names. DATABASE_URL,
DIRECT_URL and SESSION_SECRET are overridden; no shared DB is used. Provider
keys are blanked for the Next processes. Each test cluster is stopped after
verification; the existing PostgreSQL service and user processes stay alive.

- Nine focused password/token/permission/logout tests passed.
- Twenty-five real Prisma integration and headless Edge checks passed.
  Only framework request cookie/header context is replaced in the direct
  source tests; real bcrypt, JWTs, Prisma transactions and PostgreSQL run.
  Browser tests use the actual built Next app, forms and server actions.
- Bootstrap concurrency/idempotency, four-role provisioning/login, identifier
  variants, first password changes, invalid passwords, expiry, reset,
  deactivation, role-change revocation, direct-action permission denials,
  browser persistence/logout and administrator UI restrictions were covered.
- A real DB audit trigger deliberately rejected a fixture creation audit;
  the application rolled back the account and audit together.
- A second disposable database tested preflight, manual migration,
  postflight and history reconciliation, including a second idempotent
  history run. Prisma reported the result up to date. Synthetic pre-existing
  accounts retained their hashes, roles and statuses; student/teacher
  profiles, fee balances, payments and certificates were preserved. The
  test also verified removal of fixture Data API grants and the 24-hour
  temporary-credential transition window.
- Prisma validation, route type generation, standalone TypeScript and production build passed.
  The final build and all browser tests ran on Next.js **15.5.29**. The real
  operator CLI was also tested in inspection mode and refused `--create`
  against the isolated database's existing SUPER_ADMIN without prompting
  for a password or modifying it.
  No separate ESLint pass is claimed because the repository has no ESLint
  configuration. New TSX components were reviewed for hooks, pending/error
  handling, labels, table headings and sensitive-field serialization.

No successful real Supabase login was verified. The original missing LMS
identity has not been provisioned. An authorized operator must run the SQL,
reconcile history, use the existing SUPER_ADMIN privately, and verify live
login/password-change/persistence/permissions/logout.

## Files changed by this implementation

- `.gitignore`, `.gitattributes`, `README.md`, `package.json`,
  `package-lock.json`, `next.config.mjs`, `tsconfig.json`, and generated
  `next-env.d.ts` (Next.js 15.5 route-type reference, regenerated for the
  normal default build directory after isolated verification).
- `prisma/schema.prisma` and the versioned migration listed above.
- `src/lib/auth/session.ts`, `token.ts`, `guards.ts`, `password.ts`,
  `permissions.ts`, `identity.ts`, `throttle.ts`, `account-policy.ts`,
  `accounts.ts`, `bootstrap.ts`.
- `src/lib/actions/auth.ts`, `accounts.ts`, `teachers.ts`, `students.ts`;
  `src/lib/data/accounts.ts`, `src/lib/audit.ts`, `src/lib/ids.ts`,
  `src/lib/nav.ts`, `src/middleware.ts`.
- `src/app/admin/accounts/page.tsx`, `controls.tsx`;
  `src/app/change-password/page.tsx`, `form.tsx`;
  `src/app/student/change-password/page.tsx`, `src/app/student/layout.tsx`.
- `scripts/bootstrap-super-admin.ts`, `prisma-generate.cjs`,
  `test-auth-local.cjs`; retained read-only `auth-diagnostics.cjs`.
- `tests/auth.test.cjs`, `auth.integration.cjs`, `source-loader.cjs`,
  `manual-migration.fixture.cjs`.
- This report, the deployment guide, `docs/sql/01-auth-preflight.sql`,
  `03-auth-postflight.sql`, `04-auth-reconcile-history.sql`, and an audit
  continuation note. Earlier login/audit documents remain historical records.

Existing unrelated fee/payment/student/teacher page and data edits were
preserved. No academic, payment, attendance, quiz, lesson or notification
module was rebuilt. The existing Windows Prisma DLL lock was identified as
node PID 23472 during the audit and was not killed. Generation now includes
an identical-engine fallback for Windows locks. Final isolated verification
exercised that fallback successfully when the test runner held the engine;
it verified matching engine bytes and terminated no user process.

## Git status

Work began on `main` at `e1f1bc9`. During execution HEAD advanced to
`ad72ef1` through activity outside this agent's commands. That commit was
preserved; subsequent changes remain in the working tree. The agent did not
run git commit, push, merge or deploy.

## Framework security verification

The initial dependency was Next.js 15.1.4, which is covered by the
[official App Router RCE advisory](https://nextjs.org/blog/CVE-2025-66478).
The published [Next.js 15.5.29 release](https://github.com/vercel/next.js/releases/tag/v15.5.29)
contains subsequent security fixes. Next.js and eslint-config-next have been
updated and pinned to 15.5.29, preserving Next.js 15. Playwright 1.62.1 is
now pinned as a development dependency for reproducible browser testing.

`npm audit --omit=dev --json` still reports **8 package advisories: 6 high,
2 moderate, 0 critical**. These involve Zod and transitive PostCSS/source-map
and Prisma-tooling dependencies. Suggested complete fixes include Zod 4 and
Next.js 16; those migrations extend beyond the approved existing-stack
authentication changes. No `audit fix --force` or unreviewed overrides were
applied. These advisories require further dependency review before production
approval; this work does not claim a clean dependency-security audit.

The current authentication schemas use bounded strings/objects rather than
constrained collections implicated by the
[Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
Broader module/dependency remediation remains separate from the verified
account lifecycle changes and pending live SQL/login verification.
