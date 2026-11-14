# iSkillSpot student registration and admission system

Implementation date: 14 November 2026 (Asia/Karachi).

## Executive summary

This feature adds public student registration, email verification, database-backed course selection, manual payment instructions, restricted admission status, staff review, atomic approval, and transactional email queuing. The existing Prisma, bcrypt and JWT architecture remains in place. SUPER_ADMIN, ADMIN, TEACHER and STUDENT remain the four roles. Only STUDENT is assigned by public registration; request-supplied roles are ignored.

No shared Supabase database was reset, seeded, migrated or queried during implementation. Database verification uses newly initialized, password-protected PostgreSQL clusters on loopback. All fixture accounts, including administrative test accounts, exist only in those disposable clusters.

## Previous workflow audit

- Baseline: `main` at `86084c2`, fetched from the specified repository.
- Staff provisioned students through `createStudentAction`, generating temporary credentials and creating the profile, enrollment and optional fee together. That workflow remains available.
- JWT sessions use HTTP-only cookies, an eight-hour or remembered thirty-day lifetime, live database account checks and session-version revocation. Bcrypt uses cost 12. The existing database trigger invalidates sessions after credential/role/status changes.
- Learning loaders already scoped courses and published lessons to ACTIVE/COMPLETED enrollments. Assignments used ACTIVE enrollments. Enrollment-level suspension was absent.
- Student dashboard announcement queries could expose unpublished or incorrectly targeted announcements. Attendance and several stored academic views did not check current course access. These paths now filter on the student's accessible enrollments.
- Existing payment recording did not serialize concurrent fee mutations or deduplicate transaction references. Admission approval and manual payment recording now share financial locking and reference checks; voiding takes the same financial lock.
- In-app notifications and VAPID push already existed and remain separate from transactional email.
- Open [PR #5](https://github.com/naveedaslammalik2580-cpu/iSkillspot-lms-/pull/5), branch `feat/password-recovery-auth-audit`, was inspected, including its reset actions and hashed-token approach. It is not on current main. This feature provides recovery using its unified AuthToken/outbox infrastructure. PR #5 overlaps email, recovery routes, password UI and schema; reconcile those changes before merging both PRs. No commits or source files on that branch were modified.

## New registration workflow

1. `/register` collects name, email, phone/WhatsApp, password and confirmation. There is no role selector or student-ID field. Student identifiers and a random application ID are generated server-side. Passwords are bcrypt-hashed before persistence.
2. Registration returns an identical check-email response for new and duplicate eligible addresses. It does not grant a session or overwrite an existing account. The student follows the single-use verification link and explicitly submits the verification form. GET requests do not consume tokens, protecting against mail-link scanners.
3. After verification, a restricted registration session opens `/admission`. Course options and batch preferences come from published database courses with admissions enabled and configured fees. Server validation rejects closed courses and batches from another course. A quote snapshots the total fee and required admission payment on the application.
4. The status page shows official configured account details, fees, application ID and admin contact. Its WhatsApp button prefills student name, application ID and course. The student attaches a screenshot manually. Neither opening WhatsApp nor attaching a screenshot verifies payment.

The progress indicator shows Personal → Verify email → Course → Payment. Registration can be resumed by signing in with the registered password. Lost-password recovery does not bypass email verification or admission approval. Resends have a sixty-second server cooldown and shared rate limits.

## Admin approval workflow

`/admin/admissions` serves both ADMIN and SUPER_ADMIN. It provides total/pending/approved/rejected counts, search, status filters, bounded pagination, student details, course, email verification, application date and payment status.

The details page allows staff to confirm/change the course, assign an available matching batch, record a verified amount/method/reference, authorize installments, approve, reject with a reason or request information. A mandatory checkbox requires verification of the actual transaction. Teachers and students cannot invoke approval. Changes recheck the actor's current database authorization inside the transaction.

Approval takes a shared financial advisory lock, locks the application and student account, and verifies the application remains reviewable. It requires a verified email, an active student account, an available course/batch and sufficient payment. Partial payment requires explicit installment approval. Existing enrollment/fee records are checked before creating new ones.

The transaction creates the existing Fee and Payment records, recomputes the fee through the existing accounting function, creates Enrollment, finalizes Student, removes the admission restriction, updates the application, writes the audit record and queues confirmation. Any failure rolls back all related changes. A repeated/concurrent approval cannot produce another enrollment or payment.

Confirmation-email status and an authorized resend action appear on approved applications. Delivery failure never undoes approval. For additional courses, students start another application from `/admission`; the same Student profile is reused. Pending additional applications do not restrict previously approved enrollments.

## Authentication and authorization

- `User.admissionRequired` defaults to false. Only public registration sets it true. `User.status` remains the independent administrative account status; restricted registrants can sign in without receiving academic access.
- `getSession()` reads the restriction from the database. `requireSession()` redirects restricted students to `/admission` unless the caller explicitly requests admission-only access. Student loaders, academic actions and resource/file API routes use these guards. Role-only middleware remains an early coarse check.
- Approval changes the database restriction; a pending session can immediately open the student dashboard after approval. No permanent authentication tokens are emailed.
- `Enrollment.accessSuspended` defaults to false and is independent of account status and enrollment status. Staff can suspend/restore individual course access from student records and admission details without deleting records.
- Learning, lesson progress, resources, assignments, assignment files, dashboard, attendance, fees, certificates/printing and announcements enforce accessible enrollment scope. Course and batch notifications and deadline reminders exclude suspended access. Stored academic notification reads are re-evaluated against current course access.
- General system messages and institute-wide published announcements remain account-wide. Legacy notification rows with no resolvable academic link are hidden from student academic feeds rather than exposing unrelated course details.
- Existing manual account reset, account status management, staff login and password-change flows remain available.

## Password security and UI

The shared policy keeps the existing minimum twelve characters, upper/lowercase, number, symbol and bcrypt seventy-two UTF-8-byte maximum. It additionally rejects common password fragments, control characters and long repeated runs. The registration frontend and server use the same policy. The UI has a visibility toggle, one short strength message and a thin red/green line. Password confirmation is checked server-side even if frontend validation is bypassed.

## Email infrastructure

`src/lib/email.ts` provides branded HTML templates, HTML escaping, a transactional queue and a Resend HTTPS transport. No new mail dependency is needed. Supported messages include email verification, application receipt, approval, rejection, information requests and password recovery.

AuthToken stores SHA-256 digests of random 256-bit tokens, a purpose, expiration, used timestamp and session version. Verification expires after sixty minutes and recovery after thirty. Reissuing invalidates older unused tokens of that purpose. Recovery increments the account session version and revokes prior sessions. Password/role/status changes invalidate outstanding tokens through their stored version.

Mail bodies containing bearer links are encrypted with AES-256-GCM using a key derived from SESSION_SECRET. Successful provider acceptance clears the encrypted body. Delivery leases use `FOR UPDATE SKIP LOCKED`, bounded attempts, backoff and a provider idempotency key. Eight failed attempts require operator attention or a fresh authorized confirmation resend. Provider acceptance is recorded as SENT; it is not proof of inbox delivery. Delivery/bounce webhooks are not implemented.

### Required server environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL`, `DIRECT_URL` | Existing private Prisma database connections; never expose to clients |
| `SESSION_SECRET` | Existing random secret of at least 32 characters; also protects queued email payloads |
| `LMS_PUBLIC_URL` | Official HTTPS LMS origin for all emailed links, e.g. your actual deployed origin |
| `RESEND_API_KEY` | Real server-only Resend key with permission to send email |
| `EMAIL_FROM` | Sender address on a domain verified with the provider |
| `CRON_SECRET` | At least 32 random characters for the email worker |
| `AUTH_TRUSTED_IP_HEADER` | Optional client-IP header overwritten by the trusted reverse proxy |

Configure an authenticated scheduler to call `GET /api/cron/emails` every minute with `Authorization: Bearer <CRON_SECRET>`. The endpoint claims at most twenty rows per request; use an execution timeout sufficient for twenty fifteen-second provider timeouts, or invoke more frequently with fewer messages by adjusting the worker limit. Restrict access to the scheduler secret. The existing reminder endpoint continues using its documented separate header convention.

Without a trusted IP header, public auth operations share a conservative global source limit of eight attempts per fifteen minutes. Set the header only when the proxy overwrites it; do not trust an arbitrary browser-supplied header. Per-email limits remain active. Configure email and scheduler before opening admissions. Verification/recovery links otherwise remain queued until the worker runs, and may expire while delivery is unavailable.

Changing SESSION_SECRET revokes sessions and prevents decrypting existing queued mail. Drain the queue first; after emergency rotation request fresh verification/recovery links and resend confirmations. Do not log query-string tokens, passwords, provider credentials or encrypted queue payloads in application analytics. Tokens use no-referrer/noindex pages.

No SMTP credentials were invented. No external email delivery or inbox receipt is claimed. Provider contract tests use an intercepted fake success; unavailable configuration is tested as a delivery failure.

## Database changes and deployment

New additive migration: `prisma/migrations/20261114120000_student_admissions/migration.sql`.

- Adds User email verification/restriction fields, Course admission settings, Enrollment access flag and nullable Payment reference key.
- Adds Admission, AuthToken and EmailOutbox with indexes and foreign keys.
- Adds unique payment-reference, application, active-course-application and draft-application constraints.
- Adds amount, token-purpose and queue-status checks.
- Enables RLS on all three new tables with no public policies; revokes PUBLIC/anon/authenticated access. The app uses its existing private Prisma connection. Do not add Supabase Auth policies or client grants to these tables.
- Leaves old migrations/checksums and all existing business records untouched. Payment reference keys are not backfilled automatically; runtime checks also normalize historical references.

### Manual Supabase deployment procedure

1. Take a verified database backup/snapshot using the existing operational process. Select the intended Supabase project and check the database identity; keep public admissions closed.
2. Review current migration history against this checkout. If older auth/notification migrations are absent from the schema, apply their documented procedures first. If schema exists without matching history, use that migration's exact reconciliation guide. Never run reset, seed or migrate dev against the shared database; do not mark unverified migrations applied.
3. Run `docs/sql/08-admissions-preflight.sql` in the Supabase SQL editor. Save the counts. Investigate duplicate historical references and mismatched enrollment/batch courses explicitly; this migration does not rewrite those records.
4. Run the exact readable SQL in `prisma/migrations/20261114120000_student_admissions/migration.sql`. It is transactional, with bounded lock/statement timeouts. If a timeout occurs, inspect contention and retry in an appropriate window; do not disable safety checks.
5. Run `docs/sql/09-admissions-postflight.sql`. Compare all business counts with preflight. Immediately after migration, restricted-account, suspended-enrollment and open-course counts should be zero. Inspect all new table grants/RLS. Verify the app's existing database role can access the tables through its private connection; do not grant anonymous Data API access.
6. Only after successful schema/postflight verification, run `docs/sql/10-admissions-reconcile-history.sql`, or use `prisma migrate resolve --applied 20261114120000_student_admissions` with the intended direct connection. Do not use both unnecessarily. The SQL script refuses conflicting history and is safe to repeat when the exact checksum already matches.
7. Run `prisma migrate status`; resolve discrepancies explicitly. Never rewrite applied migration files, checksums or existing history rows. Deploy the application only after schema and generated Prisma client match. Roll back application code if needed; retain the additive schema and records rather than dropping them.
8. Configure email variables, verify the sender domain and scheduler, and perform an authorized real mailbox delivery check. Log in as Super Admin, open Settings → Admission settings, enter official payment accounts/WhatsApp/instructions and select database courses and their required admission payments. Set course fees in the existing course management workflow. Open public admissions last.
9. Smoke-test with an approved test operator process: pending sign-in/status, verification, actual small payment validation, approval and enrollment isolation. Do not create another production SUPER_ADMIN or seed demonstration accounts.

### Existing student compatibility and optional backfill

No backfill is required for access: all existing User.admissionRequired and Enrollment.accessSuspended values default to false. Existing active accounts, hashes, roles, balances and course records remain available. Missing emailVerifiedAt does not lock out existing students. New public applications require email verification; existing students who want another course can verify their address first.

Do not fabricate approved applications, verified emails or payments for old students. If a historical application record is operationally necessary, reconcile it from audited source records in a separate reviewed procedure. If backfilling verified emails, use evidence of actual verification and a bounded ID-specific update reviewed by an operator. Historical transaction duplicates must be investigated before assigning reference keys; never delete duplicate financial rows automatically.

## UI/UX improvements

The implementation reuses existing Tailwind tokens, cards, buttons, inputs, labels and portal layout. Public flows have labeled fields, keyboard controls, pending/error/success states, mobile layouts and visible progress. Existing dashboards retain their layout. Student registration and password recovery links replace the old login notice prohibiting self-registration.

Super Admin admission settings are kept in the existing settings portal. Payment methods use structured JSON for authorized operators; this is a usability limitation suitable for a later visual editor. All public-facing payment instructions are rendered as readable text and escaped by React.

## Security findings and limits

Resolved: pending account academic access, missing per-course suspension, overbroad dashboard announcements, inactive-course notification recipients, concurrent payment recording and duplicate transaction use, server-controlled public role assignment and expiring single-use verification/recovery.

Existing architecture uses floating-point money; this change preserves the accounting schema and accepts at most two decimal places for new admission/payment amounts. A separately reviewed Decimal migration is recommended. Historical fees may contain legacy precision/data inconsistencies and are not silently rewritten.

Existing Supabase tables and storage policies need the deployment's established security audit; only new tables are hardened here to avoid unexpectedly changing live access. External resource/video URLs remain subject to their hosting provider's access controls; DRM and video hosting changes are out of scope.

The existing 200 MB Server Action body limit remains for assignment uploads. Reverse-proxy request/rate limits should protect public authentication endpoints as part of deployment. Financial reference uniqueness is intentionally conservative across methods; operators must use the official unique receipt/transaction reference.

Email acceptance has at-least-once semantics if a process crashes after provider acceptance and retries after the provider's 24-hour idempotency retention. Monitor stalled/FAILED rows and keep the worker running. No inbox-delivery claim is made without a verified mailbox test.

## Actual verification results

Verification is executed through `npm run test:admissions` (the isolated auth harness extended with admission checks). It initializes its own loopback database, tests both migration paths, builds production output and runs real Prisma/action/browser checks. It removes provider credentials from the child environment and never uses the shared database. PostgreSQL binaries default to `C:/Program Files/PostgreSQL/18/bin` and may be selected using `PG_BIN`.

Final successful run: `npm run test:admissions`, exit 0, using disposable PostgreSQL 18 and headless Microsoft Edge against the production Next.js build.
The migration-only path can also be run using `node scripts/test-auth-local.cjs --migrations-only`.

| Check | Executed result |
| --- | --- |
| Prisma schema validation | Passed |
| All nine versioned migrations on a fresh disposable database | Passed |
| Manual preflight/migration/postflight on a second disposable database | Passed |
| History reconciliation repeated twice and Prisma migration status | Passed, up to date |
| Legacy account/hash/role/profile/enrollment/fee/payment/certificate preservation | Passed |
| Production build (`npm run build`, invoked by the isolated harness) | Passed, 67 generated pages |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed with zero errors and three pre-existing unused-variable warnings |
| Existing authentication unit tests | 9 passed |
| Existing account lifecycle and browser checks | 25 passed |
| Learning, notification, financial, certificate and upload suites | 41 passed |
| New admissions integration/browser checks | 22 passed |
| Total executed unit/integration/browser checks | 97 passed |
| Readable-source TypeScript/JavaScript parser check | 45 final staged source files, zero parse failures; exact migration checksum verified |
| `git diff --check` | Passed |
| Visual QA | Reviewed mobile registration/payment and desktop review screenshots; mobile registration had no horizontal overflow |

New checks exercised weak/common/unsupported/mismatched passwords, duplicate registration without overwrite, restricted sessions, token hashing/cooldown/invalidity/expiry/single use, verification, database fee/batch selection, WhatsApp content, unauthorized approval, payment attestation, insufficient installments, concurrent approval, accounting balances, confirmation content, failed delivery/resend, course isolation/suspension/restore, duplicate transaction rollback, multiple enrollments, information requests/rejection, audit-failure rollback, recovery/session revocation, rate limits, intercepted provider acceptance, mobile registration, real browser verification/selection, pending direct page/API restrictions, admin approval and subsequent registered-password dashboard sign-in, and forged-origin rejection.

The first broad regression run exposed cross-file interference: a financial test's overdue fixture changed a concurrent reminder test's global candidate count. Database suites now run sequentially (`--test-concurrency=1`); all 41 passed afterward. The pre-migration fixture also needed raw inserts for newly extended models because the generated Prisma client otherwise attempted to write new default columns before their migration. Both migration paths passed after that correction. These intermediate failures are not represented as successful runs.

The three existing lint warnings are `currentStatus` in `src/app/admin/students/[id]/actions.tsx` and `getSetting`/an unused catch variable in `src/lib/actions/students.ts`. Browser screenshots are retained locally under the ignored `.auth-work/admissions/` directory. Actual provider/inbox delivery, live Supabase SQL execution and production deployment were not performed.

Provider behavior follows the [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email) and its [24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys). New-table isolation follows the [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security); no Supabase Auth migration is introduced.

## Recommended improvements

1. Reconcile recovery PR #5 so a future merge uses one token and email system.
2. Add provider delivery/bounce webhooks and an operator queue-monitoring view.
3. Replace operator payment-method JSON with a visual settings editor.
4. Plan a reviewed Decimal migration and historical transaction reconciliation.
5. Add structured installment due dates/reminders if required; current installment approval retains the outstanding balance in existing fee records without introducing a parallel ledger.
