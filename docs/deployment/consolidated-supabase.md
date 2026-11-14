# Consolidated authentication, recovery and admissions deployment

This is the authoritative deployment guide for the reconciled PR #5 + PR #6 implementation. The original feature reports remain historical references. Do not deploy the two original PRs separately after deploying this consolidated branch. Do not reset, seed, create a SUPER_ADMIN, delete business records, edit applied migrations/checksums or disable safety checks.

## What changes

Prisma/bcrypt/JWT remain the authentication architecture. Existing account and enrollment access defaults are preserved. One `AuthToken` service handles email verification and password recovery; one encrypted `EmailOutbox` handles SMTP or Resend. Staff can email reset links and retain the authorized temporary-password fallback. Admission approval continues to commit enrollment, fee/payment, activation, audit and queued confirmation atomically.

The legacy `PasswordResetToken` table is retained for migration compatibility/history. The new reconciliation migration marks outstanding legacy links used because they lack session-version binding, enables RLS and revokes public Data API grants. It does not alter passwords, accounts, enrollments, balances or academic records. Users holding an old PR #5 reset link must request a fresh link after deployment. Existing PR #6 AuthToken links remain valid until normal use, expiration or credential/session-version change.

## Ordered migration inventory

Exact SHA-256 checksums are in [migration-checksums.json](migration-checksums.json). `npm run verify:source` verifies readable source and every migration's exact bytes. LF attributes keep SQL checksums stable across Windows and Linux.

| Order | Migration | Action for an existing LMS |
| --- | --- | --- |
| 1 | `0_init` | Existing baseline; never blindly apply to a populated database |
| 2 | `20260811031741_add_fees_payments_announcements_certificates_notifications_fields` | Verify baseline schema/history |
| 3 | `20260813101551_add_payment_method_enum` | Verify baseline schema/history |
| 4 | `20260813160053_add_announcement_audience` | Verify baseline schema/history |
| 5 | `20261113120000_auth_account_lifecycle` | Verify using existing auth preflight/postflight/history procedure |
| 6 | `20261113190000_notification_dedupe_and_readat` | Verify baseline schema/history |
| 7 | `20261113193000_notification_preferences` | Verify baseline schema/history |
| 8 | `20261113200000_push_subscriptions` | Verify baseline schema/history |
| 9 | `20261114084833_password_reset_tokens` | Original PR #5 migration, unchanged |
| 10 | `20261114120000_student_admissions` | Original PR #6 migration, unchanged |
| 11 | `20261114180000_unify_auth_recovery` | New additive reconciliation migration |

## Exact manual Supabase steps

1. Check out the consolidated PR's final commit, run `npm ci`, then `npm run verify:source`. Keep real database/provider secrets out of Git and terminal output. Take and verify a database backup through the established operational process. Pause the email worker and keep public admissions closed during schema deployment. Stop old app instances from issuing/redeeming tokens while applying reconciliation; existing academic data is retained.
2. In the SQL editor of the intended Supabase project, run [11-consolidated-preflight.sql](../sql/11-consolidated-preflight.sql). Save the database identity, migration history and all account/student/enrollment/fee/payment/attendance/submission/grade/certificate counts. Resolve unfinished migrations or duplicate identities explicitly before continuing. Do not paste credentials or account data into a PR.
3. Confirm migrations 1–8 already match the existing schema and history. If auth lifecycle is missing, use `docs/sql/01-auth-preflight.sql`, its exact migration SQL, `03-auth-postflight.sql` and `04-auth-reconcile-history.sql` before proceeding. Review other baseline discrepancies against their exact versioned SQL; never run a baseline CREATE script over existing tables or mark an unverified baseline applied.
4. If `PasswordResetToken` is absent, run [05-password-reset-preflight.sql](../sql/05-password-reset-preflight.sql), then the exact [PR #5 migration](../../prisma/migrations/20261114084833_password_reset_tokens/migration.sql), then [06-password-reset-postflight.sql](../sql/06-password-reset-postflight.sql). If the table already exists, skip its CREATE migration and verify its columns, FK and indexes instead. Its RLS output becomes secure after step 6. Do not repeat the CREATE SQL.
5. If the admissions schema is absent, run [08-admissions-preflight.sql](../sql/08-admissions-preflight.sql), the exact [PR #6 migration](../../prisma/migrations/20261114120000_student_admissions/migration.sql), then [09-admissions-postflight.sql](../sql/09-admissions-postflight.sql). If already present, skip its ALTER/CREATE SQL and verify the schema. Existing approved/pending applications and access flags may legitimately be nonzero when upgrading a deployed PR #6; do not reset those values to satisfy a fresh-install note.
6. If the reconciliation migration is not already applied, execute [20261114180000_unify_auth_recovery/migration.sql](../../prisma/migrations/20261114180000_unify_auth_recovery/migration.sql) exactly once. It has transaction, lock and statement timeouts. If it fails, inspect the error and contention; do not bypass checks. If `AuthToken.requestedById` already exists but history is missing, inspect the whole reconciliation schema before considering history repair; do not rerun the ALTER blindly.
7. Run [12-consolidated-postflight.sql](../sql/12-consolidated-postflight.sql). It asserts the new column, queue state constraint, four RLS-protected server-only tables, absence of anon/authenticated CRUD grants and retirement of old reset links. Compare every business count with step 2. Existing accounts, hashes, balances and academic records must be preserved. Keep the app paused if verification fails.
8. For SQL-editor deployments with missing history, run only the matching history scripts **after** exact SQL/schema verification: [07-password-reset-reconcile-history.sql](../sql/07-password-reset-reconcile-history.sql), [10-admissions-reconcile-history.sql](../sql/10-admissions-reconcile-history.sql), and [13-unified-auth-reconcile-history.sql](../sql/13-unified-auth-reconcile-history.sql). Matching entries are no-ops; conflicting/unfinished entries are rejected. Do not rewrite existing checksums. If a historic checksum differs because SQL was copied or used different line endings, stop and reconcile the evidence with an operator; do not overwrite it.
9. With the intended direct database connection configured securely, run `npx prisma migrate status`. It must report up to date. The alternative to step 8 is `npx prisma migrate resolve --applied <exact-migration-name>` for each fully verified, already-executed migration. Resolve records history only; it never creates schema. Use one history approach consistently.
10. Configure the server environment using [consolidated-email.md](consolidated-email.md), generate the Prisma client with `npm run postinstall`, and deploy the consolidated application commit. Do not run `db:push`, `migrate dev`, `migrate reset` or `db:seed` against the shared database. No Supabase Auth migration is involved. The private Prisma database role needs its existing owner/BYPASSRLS access; never add public Data API policies to token/outbox tables.
11. Enable the authenticated email worker. Verify sender authentication and one real authorized mailbox before opening admissions. In Super Admin Settings, confirm database course fees/admission payments, payment methods and official account details, WhatsApp and instructions. Open public admissions last. Keep SMTP/Resend credentials server-only.
12. Perform an authorized production smoke test: student registration → actual verification email → course selection → official payment instructions → pending login restriction → admin verification of the real transaction → approval/confirmation email → student login/course isolation → Forgot Password → new-password login. Never treat a screenshot or an HTTP success as proof of financial verification or inbox delivery. Use the existing operator process for any production test record; do not seed demo users.

## Starting-state decisions

| Existing state | Missing feature SQL to execute, in order |
| --- | --- |
| Main baseline only | PR #5 → PR #6 → reconciliation |
| PR #5 already deployed | PR #6 → reconciliation |
| PR #6 already deployed | PR #5 → reconciliation; keep all existing admissions/outbox records |
| Both feature schemas deployed | Reconciliation only |
| All schemas present, history incomplete | Verify exact schema and use matching history scripts; never replay CREATE/ALTER blindly |

For a fresh **disposable** database, `npx prisma migrate deploy` applies all eleven in order. For an established shared database with verified complete history, the same command may be used by the operator to apply only missing migrations instead of the SQL-editor route. Never combine a partially completed manual deployment with blind migration execution.

## Compatibility, rollback and verification

Existing students need no access backfill: admissionsRequired defaults false and enrollment accessSuspended defaults false. Legacy emailVerifiedAt may remain null without preventing existing dashboard access. Existing additional-course applications retain their quoted fee, payment, enrollment and user state. Manual admissions remain available.

Code rollback must be reviewed: the old PR #5 app issues legacy tokens that the consolidated app deliberately does not accept. Prefer rolling back to a compatible consolidated build, keep admissions closed and preserve the additive schema. Never roll back by dropping tables, deleting student records or reverting migration history. Before emergency SESSION_SECRET rotation, drain queued email if possible; afterwards issue fresh links and resend confirmations because encrypted queue bodies use that secret.

Local verification: `npm run test:admissions` initializes disposable password-protected PostgreSQL, exercises versioned and manual/history deployment, builds production output and runs authentication/recovery/email/learning/admission/browser checks. `node scripts/test-auth-local.cjs --migrations-only` runs database deployment verification alone. These commands never use the shared Supabase connection.
