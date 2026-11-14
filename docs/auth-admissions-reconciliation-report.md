# Authentication, recovery and student admissions reconciliation

Date: 14 November 2026 (Asia/Karachi). This report supersedes the separate PR #5/#6 deployment recommendations. Deploy only the consolidated pull request. This work does not push to or merge main. During verification, PR #5 was independently merged into main at `f543a5c`; that baseline merge is included in the consolidated branch. Its code was already present through the retained PR #5 history, so incorporating the main merge introduced no source changes.

## Result and implementation decisions

The consolidated branch contains both PR histories. Conflicts in login, Forgot Password, reset routes and email infrastructure are resolved. Public registration, verification, manual payment approval, account activation, enrollment scope, staff account provisioning, password recovery, staff reset links and temporary-password fallback remain available. Prisma, bcrypt cost 12 and live-validated JWT sessions remain the architecture.

One service (`src/lib/auth/tokens.ts`) issues/consumes version-bound single-use tokens for verification and reset. PR #5's `password-reset.ts` exports delegate to that service; no active code writes the legacy PasswordResetToken table. Per-account issuance caps and account eligibility are checked while holding the user lock. Public requests share the existing cooldown and durable rate limiter. Staff initiation rechecks actor/target role permissions in the same transaction that queues the link. Suspended/dropped students and inactive teacher profiles cannot recover to bypass login restrictions.

One encrypted outbox and one transport adapter now serve SMTP and Resend. PR #5's immediate-send implementation is replaced by durable queuing so provider outages do not roll back approved admissions or falsely report sent mail. Staff UI says queued; not-configured staff delivery retains the authorized temporary-password fallback. URLs come only from explicit configuration, closing the PR #5 request-header origin inference path.

Login retains PR #5's password visibility toggle, identifier retention after failures, reset success/session-expiry notices and PR #6's public student-registration link. Registration, reset and change-password forms use one shared password-fields component: a visibility toggle, one short message and a four-pixel red/green line. There is no requirements checklist.

## Schema and migration compatibility

All existing migration SQL bytes are preserved, including original PR #5 (`0d0530bd0968234983effc2443300d30c75beaa9bb9fbb5a7468b4f5743705a1`) and PR #6 (`e1f4adfa92848500e59cb0c23bd59e616a7db7d386680e4ff6dc1b9b89d1752f`). A checksum manifest and LF rules verify cross-platform source consistency.

The new additive `20261114180000_unify_auth_recovery` migration adds AuthToken.requestedById, permits CANCELED outbox rows and secures/retains legacy token history. Outstanding PR #5 links are retired because they lack a session-version binding; users request fresh links. Existing PR #6 tokens, applications, queue rows, users, enrollments, payments and academic data are preserved. No production database was queried, reset, seeded or migrated.

The authoritative ordered SQL/history and configuration procedures are [consolidated-supabase.md](deployment/consolidated-supabase.md) and [consolidated-email.md](deployment/consolidated-email.md). They cover main-only, PR #5-only, PR #6-only and already-combined schema starting states, explicit verification before history reconciliation, and exact transport/worker setup.

## Verification

Tests ran against password-protected disposable loopback PostgreSQL 18 and headless Microsoft Edge using the production Next.js build. The shared Supabase project and live provider credentials were never used.

| Executed check | Actual result |
| --- | --- |
| Production build through `node scripts/test-auth-local.cjs` | Passed; 67 generated pages |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed; zero errors and zero warnings |
| Authentication unit tests | 9 passed |
| Existing account lifecycle and browser checks | 25 passed |
| Learning, notifications, finance, certificates and uploads | 41 passed |
| Reconciled password-reset suite | 20 passed |
| Email template/transport suite | 3 passed |
| Admission and browser workflow checks | 24 passed |
| Total unit/integration/browser checks | **122 passed** |
| Fresh versioned deployment | All 11 migrations passed |
| SQL-editor equivalent, preflight/postflight and history reconciliation repeated twice | Passed on a second disposable database |
| Legacy PR #5 token transition | History preserved, old links retired, anon/authenticated access revoked |
| Upgrade from deployed PR #6 with an earlier missing PR #5 migration | Passed on a third disposable database |
| Existing admission/academic upgrade fixture | Accounts, hashes, approved/pending applications, enrollment suspension/progress, balances/payments, queue rows, current tokens, lessons/progress, assignments/submissions, attendance, grades, certificates and notifications were unchanged in serialized before/after snapshots |
| `npm run verify:source` | Passed; no whole-file Base64, parse failures or conflict markers; all 11 exact SQL checksums verified |
| Browser visual review | Mobile registration/reset indicators and admission screens reviewed |

The browser flow covered registration → email verification → database course/batch selection → official payment instructions/WhatsApp → pending sign-in and direct URL/API denial → actual-transaction admin approval → enrolled dashboard login. Forgot Password was exercised through the real browser form for both pending and approved students, including new-password sign-in, reused-link rejection and old-session revocation. A pending student's password reset did not activate the account or create enrollment.

Password UI tests asserted a single four-pixel indicator, red `rgb(239, 68, 68)` for weak/common passwords, green `rgb(22, 163, 74)` when policy passes, and no form checklist. Both reset and registration use the shared component; forced password change uses it as well.

Email tests performed a real SMTP exchange with a disposable loopback relay, required-STARTTLS failure and production plaintext-SMTP rejection. Resend acceptance was intercepted with a fake response and its idempotency header verified. Provider failure preserved approved admission and allowed an authorized confirmation resend. These tests do not claim external inbox delivery.

The first reconciliation verification caught and corrected a PL/pgSQL variable/column ambiguity in the new postflight assertion. An initial TypeScript check caught readonly NODE_ENV assignments in the SMTP test; those were corrected before the successful run. No intermediate failure is represented as a pass.

`npm audit --json` reports 16 affected packages (8 moderate, 8 high, 0 critical) in the consolidated branch, matching the original pre-recovery main baseline at `86084c2`. After PR #5 was independently merged, the current main lockfile at `f543a5c` reports 17 (8 moderate, 9 high), including its older Nodemailer. This reconciliation removes that Nodemailer finding by pinning 10.5.0. The remaining inherited findings include Next/PostCSS, Zod, Prisma/config and lint/build transitives. Several proposed fixes require major framework/schema-library upgrades; those remaining advisories are a separate reviewed maintenance task. No force-upgrade or broad automatic audit fix was applied during this compatibility change.

## Remaining operational limits

- Real SMTP/Resend sender credentials, official portal origin and authenticated worker scheduling must be configured by the operator. External inbox delivery is not claimed by local transport/browser tests.
- Legacy PR #5 reset links require a fresh request after deployment. This is an intentional security transition, not an account/password change.
- SENT means provider acceptance; delivery/bounce webhooks and an operator queue UI remain future improvements. SMTP and uncertain retries have at-least-once semantics.
- Existing accounting continues to use Float and installment approval preserves the existing fee balance rather than adding a duplicate ledger or installment scheduler.
- The dependency audit reports inherited package vulnerabilities. Exact findings and any remediation limits are recorded with final validation; no unrelated framework-major upgrade is silently introduced.
