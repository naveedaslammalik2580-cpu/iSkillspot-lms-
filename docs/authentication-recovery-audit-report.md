> Historical feature report. For the combined implementation, use [the reconciliation report](auth-admissions-reconciliation-report.md) and [the consolidated deployment guide](deployment/consolidated-supabase.md).

# Authentication, Password Recovery & UX Audit Report

- Repository: `naveedaslammalik2580-cpu/iSkillspot-lms-`
- Base: `main` @ `86084c2` ("Merge LMS authentication, notifications and learning modules")
- Branch: `feat/password-recovery-auth-audit`
- Date: 2026-11-14
- Scope note: the authentication foundation audited here (sessions, throttling,
  account lifecycle, staff account management) is the existing implementation
  merged in PRs up to `86084c2`. This branch adds self-service password
  recovery, staff-sent reset links, email delivery, and auth-page UX fixes.
  Nothing was applied to the shared Supabase database; all database-writing
  tests ran against disposable local PostgreSQL.

## 1. Executive summary

The LMS had **no self-service password recovery**: a user who forgot their
password could only ask staff for a temporary password. This branch implements
complete, secure recovery for all four roles (forgot-password page, emailed
single-use reset links, staff-sent links), on top of an authentication core
that the audit found to be **strong** (DB-revalidated sessions, DB-backed
throttling, transactional account management with row locking).

Delivered:
- `PasswordResetToken` (additive migration): only SHA-256 token hashes stored,
  30-minute expiry, single use, new requests supersede old tokens.
- Email service (SMTP via nodemailer, or Resend): **no fake delivery** — when
  no provider is configured, sending honestly reports `not-configured`.
- Public flows are enumeration-proof: identical responses for unknown,
  ineligible, rate-limited and successful requests.
- A successful reset bumps `sessionVersion`, revoking all existing sessions.
- Staff can now **email a reset link** (preferred) from account management;
  the existing temporary-password procedure remains the offline fallback.
  Hierarchy is enforced server-side (SUPER_ADMIN → ADMIN/TEACHER/STUDENT;
  ADMIN → TEACHER/STUDENT; TEACHER/STUDENT → nobody; SUPER_ADMIN accounts
  can never be targeted).
- UX fixes: password visibility toggles on login/reset/change-password,
  session-expired explanation, post-reset notice, identifier no longer wiped
  after a failed login.

Verification: **67/67 automated tests** (58 TS incl. 17 new recovery tests +
9 existing auth CJS), **30/30 browser E2E checks** including real email
delivery through a local SMTP capture server, lint 0 errors, TypeScript
clean, production build green, fresh-database migration chain 9/9.

## 2. Existing authentication architecture (verified in code)

- Custom auth (no Supabase Auth): `User` table + bcrypt(12) + HS256 JWT in an
  httpOnly `isp_session` cookie (Secure in production, SameSite=Lax, 8h /
  30-day remember-me).
- `getSession()` revalidates against the DB on every read: user ACTIVE, role
  matches the token, `sessionVersion` matches, linked teacher/student profile
  status acceptable, unexpired temporary password. Fail-closed on DB errors.
- Middleware gates route prefixes by role from the JWT and forces
  must-change-password users to the change-password page; full authorization
  is re-checked server-side in layouts/actions.
- Login: identifier = username, email, or student ID (case-insensitive,
  ambiguous matches rejected), dummy-hash timing equalization, one generic
  error, DB-backed throttle (`AuthThrottle`, HMAC-keyed, 8 attempts / 15 min
  per identifier, works across processes/restarts).
- Password policy (shared zod schema): ≥12 chars, upper+lower+digit+symbol,
  ≤72 UTF-8 bytes (bcrypt limit, enforced at verify too; malformed stored
  hashes fail closed).
- Account lifecycle: temporary passwords expire after 24h; password changes
  and staff resets increment `sessionVersion` (revoking other sessions);
  duplicate identities prevented transactionally with an advisory lock
  (username/email/student-ID, case-insensitive).
- Staff account management (`src/lib/auth/accounts.ts` +
  `account-policy.ts`): actor and target are row-locked and re-authorized
  inside the transaction; `manageableRoles` encodes the approved hierarchy;
  self-targeting is impossible; SUPER_ADMIN targets are impossible.
- Audit logging (`AuditLog`) for logins, failures, changes, resets,
  activations — never containing passwords or (now) reset tokens.

## 3. Problems discovered

| # | Issue | Severity | Roles | Status |
|---|-------|----------|-------|--------|
| 1 | No self-service password recovery at all | High | All | Fixed |
| 2 | No transactional email infrastructure existed | High | All | Fixed (configuration required) |
| 3 | Staff recovery was temporary-password only (credential passes through staff hands/chat) | Medium | All | Fixed (reset link preferred; temp flow kept as fallback) |
| 4 | Login page had no password visibility toggle and no recovery link | Medium | All | Fixed |
| 5 | Expired/invalid session bounced to a bare login page with no explanation | Low | All | Fixed |
| 6 | Failed login wiped the typed identifier (React resets uncontrolled form fields after an action round-trip) | Low | All | Fixed (identifier + recovery email are now controlled inputs) |
| 7 | Tokens/sessions: no defect found in JWT validation, cookie flags, or revocation | — | — | Verified sound |
| 8 | Login throttle is keyed per identifier, so an attacker who knows a username can keep that account throttled (availability trade-off, standard practice) | Low (theoretical) | All | Documented, not changed |

Per-issue detail:

1. **No self-service recovery.** *Cause:* the feature was never built; only
   staff temp-password resets existed. *Impact:* every forgotten password
   required administrator intervention and a credential hand-off.
   *Solution:* this branch's token-based email recovery (sections 6–7).
2. **No email infrastructure.** *Cause:* no mailer dependency, config or
   sending code anywhere in the repo (verified by search). *Impact:* no
   feature could email users. *Solution:* `src/lib/email.ts` (SMTP first,
   Resend fallback) with strict TLS defaults, timeouts, and honest
   `not-configured` reporting. Status: **Requires Configuration** in
   production (see section 10).
3. **Staff credential hand-off.** *Cause:* `resetAccountPassword` returns a
   temporary password to the staff member, who must transmit it to the user.
   *Impact:* credentials traverse chat/phone/paper. *Solution:* staff can
   email a reset link directly to the account holder from /admin/accounts,
   student and teacher pages; the temp-password flow remains for accounts
   that cannot receive email (it expires in 24h, forces a change at first
   login, is stored only as a bcrypt hash, and revokes sessions).
4. **Login usability.** *Solution:* "Forgot password?" link beside the
   password label; shared `PasswordInput` with a Show/Hide toggle on login,
   reset and change-password forms.
5. **Session-expiry confusion.** *Cause:* middleware redirected invalid
   cookies to `/login` silently. *Solution:* that path now redirects to
   `/login?expired=1` and the login page explains "Your session has expired.
   Please sign in again." Successful resets land on `/login?reset=1` with a
   confirmation notice.
6. **Identifier wipe.** Verified in browser testing (first E2E run failed on
   exactly this). *Solution:* controlled identifier/email inputs on login and
   forgot-password. Password fields intentionally still clear after a failed
   attempt.
7. **Verified sound (no change):** JWT claim validation (alg pinned, claim
   types checked), cookie flags, per-request DB session validation,
   cross-role route guards, direct-URL access (server components re-check
   sessions), duplicate-account prevention, SUPER_ADMIN protections
   (cannot be targeted by resets/deactivation; bootstrap refuses a second
   SUPER_ADMIN), audit-log hygiene.
8. **Throttle DoS trade-off (theoretical).** Per-identifier throttling can be
   abused to inconvenience a known username. Mitigating factors: 8 attempts
   per 15 minutes is per-identifier (the legitimate user succeeds the moment
   the window's count allows — the counter increments on their own attempts
   too, which is the residual risk). Accepted industry pattern; revisit only
   if abused in practice.

## 4. Security vulnerabilities identified

- **Critical/High:** none found in the existing authentication code.
- The recovery implementation was designed against the standard attacks:
  token replay (single-use, guarded claim update), token guessing (256-bit
  CSPRNG tokens; only SHA-256 hashes stored), enumeration (identical
  responses; no email sent for unknown/ineligible accounts), email bombing
  (shared DB throttle per email and per IP + ≤5 tokens/account/hour),
  session persistence after reset (sessionVersion bump), privilege
  escalation (staff path reuses the same transactional hierarchy checks as
  password resets; SUPER_ADMIN targets impossible; self-reset impossible),
  restricted-account bypass (eligibility mirrors login rules at both request
  and consume time; a deactivated account's outstanding token dies at use).

## 5. User experience gaps identified

Fixed in this branch: missing recovery entry point, no password visibility
toggles, silent session-expiry redirects, identifier loss after failed
logins, no confirmation after a reset, reset-form policy guidance now shown
up front, loading states on all new forms (existing button-pending pattern).

Recommendations for later (not implemented): (a) show institute support
contact on the login page for locked-out users without email access;
(b) caps-lock hint on password fields; (c) the plain-text part of long
emails wraps URLs at the SMTP line limit — the HTML button is unaffected,
but keep an eye on text-only clients; (d) consider a dedicated
"account locked / too many attempts" help text — currently the generic
throttle message covers it.

## 6. Password recovery implementation

- **Model** `PasswordResetToken` (migration
  `20261114084833_password_reset_tokens`): `tokenHash` (unique, SHA-256 of
  the token), `expiresAt` (30 min), `usedAt`, `requestedById` (null =
  self-service), FK to `User` with cascade.
- **Service** `src/lib/auth/password-reset.ts`:
  `issuePasswordResetToken` (supersedes previous unused tokens, hourly cap),
  `verifyPasswordResetToken` (read-only; drives form state),
  `consumePasswordResetToken` (transaction: guarded claim → eligibility
  re-check → bcrypt hash → clear forced-change flags → `sessionVersion + 1`
  → invalidate other tokens → audit log without secrets).
- **Actions** `src/lib/actions/password-recovery.ts`:
  `requestPasswordResetAction` (enumeration-proof, throttled per email and
  per IP via the existing `AuthThrottle`), `resetPasswordAction` (policy via
  the shared `strongPassword` schema; all token failures return one generic
  message), `sendResetLinkAction` (staff).
- **Pages**: `/forgot-password`, `/reset-password` (server-validates the
  token before rendering the form; invalid/expired/used links get a clear
  recovery path), login page link + notices. All use the existing login
  design (same card, branding, components).
- **Email** `src/lib/email.ts`: SMTP (nodemailer; implicit TLS on 465,
  mandatory STARTTLS elsewhere unless explicitly relaxed for a trusted
  private relay via `SMTP_REQUIRE_TLS=false`; 10–20s timeouts) or Resend
  HTTP API. Content: institute name from settings, 30-minute warning,
  single-use note, ignore-if-not-you guidance.

## 7. Role-based password reset permissions

Enforced server-side in `src/lib/auth/accounts.ts` (`authorizeActor` +
`manageableTarget`, permission `account.manage`, re-checked inside a
transaction) — identical for reset links and temporary-password resets:

| Actor | Can initiate for | Cannot |
|-------|------------------|--------|
| SUPER_ADMIN | ADMIN, TEACHER, STUDENT | SUPER_ADMIN, self |
| ADMIN | TEACHER, STUDENT | ADMIN, SUPER_ADMIN, self |
| TEACHER | — | anyone |
| STUDENT | — | anyone |

Self-service recovery is available to every ACTIVE account holder whose
linked profile is in good standing (same eligibility as login). UI buttons:
"Email reset link" on /admin/accounts rows, student detail, teacher detail —
shown next to the existing "Reset password" (temporary) action. Staff never
see or handle a credential on the link path.

## 8. Files created and modified

Created:
- `prisma/migrations/20261114084833_password_reset_tokens/migration.sql`
- `src/lib/email.ts` — transactional email (SMTP/Resend, honest config state)
- `src/lib/auth/password-reset.ts` — token service + delivery
- `src/lib/actions/password-recovery.ts` — public + staff actions
- `src/app/forgot-password/page.tsx`, `src/app/reset-password/page.tsx`,
  `src/app/reset-password/reset-form.tsx`
- `src/components/auth/password-input.tsx` — shared visibility-toggle field
- `src/components/auth/send-reset-link-button.tsx`
- `tests/password-reset.test.ts` — 17 tests
- `docs/sql/05-password-reset-preflight.sql`,
  `docs/sql/06-password-reset-postflight.sql`,
  `docs/sql/07-password-reset-reconcile-history.sql`
- `docs/authentication-recovery-audit-report.md` (this report)

Modified:
- `prisma/schema.prisma` — `PasswordResetToken` model + `User` relation
- `src/lib/auth/accounts.ts` — `sendAccountResetLink`
- `src/lib/actions/students.ts`, `src/lib/actions/teachers.ts` — link actions
- `src/app/login/page.tsx` — recovery link, toggle, notices, controlled id
- `src/app/forgot-password` (new), `src/app/change-password/form.tsx` — toggles
- `src/app/admin/accounts/controls.tsx`,
  `src/app/admin/students/[id]/actions.tsx`,
  `src/components/teachers/reset-password-button.tsx` — "Email reset link"
- `src/middleware.ts` — expired-session redirect carries `?expired=1`
- `.env.example` — `APP_URL` + email configuration block
- `package.json` / `package-lock.json` — `nodemailer` (+ `@types/nodemailer`)

No existing feature code paths were redesigned; the temp-password reset,
change-password, login, and provisioning flows are byte-identical except
where listed above.

## 9. Database migration requirements

One additive migration: `20261114084833_password_reset_tokens` — creates the
`PasswordResetToken` table, 3 indexes (unique tokenHash), and its FK. No
existing table is altered; no data is touched. **Not applied to the shared
Supabase database.** Deploy with section 15. The full migration chain
(9 migrations) was verified on a fresh disposable PostgreSQL 16.4, and the
preflight/postflight/reconcile SQL was executed against a migrated database
(reconcile correctly took its "already recorded" path).

## 10. Email provider configuration requirements

Set in the deployment environment (never committed):
- `EMAIL_FROM` — sender, e.g. `iSkillSpot <no-reply@yourdomain>`.
- SMTP option: `SMTP_HOST`, `SMTP_PORT` (587 default), `SMTP_SECURE`
  (true for 465/implicit TLS), `SMTP_USER`, `SMTP_PASS`.
- Or Resend option: `RESEND_API_KEY` (used only when `SMTP_HOST` is empty).
- `APP_URL` — public base URL used to build reset links (falls back to the
  request origin when unset; set it in production).
Until configured, recovery requests still respond generically to users,
audit-log "email delivery unavailable", and staff see "Email is not
configured… use the temporary-password reset instead." Delivery is never
faked or claimed.

## 11. Test results (all executed 2026-11-14)

- `npm test`: **58/58** TypeScript tests pass (41 pre-existing + **17 new**
  recovery tests) and **9/9** existing auth CJS tests pass.
  New suite coverage: hash-only storage + TTL, verify/reject, superseding,
  expiry, issuance cap, consume success (password changed, flags cleared,
  sessionVersion bumped), replay rejected, deactivated-account rejection,
  unknown token, email `not-configured` honesty, staff hierarchy (ADMIN→
  STUDENT ok, SUPER_ADMIN→ADMIN ok, ADMIN→ADMIN rejected, SUPER_ADMIN
  target rejected, TEACHER rejected, self rejected, role-mismatch rejected).
- Browser E2E (Playwright, production build, local SMTP capture):
  **30/30 checks** — login UX (link, toggle), full student recovery via a
  real delivered email, weak/mismatch validation, success screen, link
  replay rejected, pre-reset session revoked, old password rejected, new
  password works, enumeration safety (unknown email → identical response,
  zero emails sent), garbage/missing token screens, expired-session notice,
  staff-sent link to a teacher completed end-to-end, post-reset login
  notice, role-login regressions, change-password toggles.
- Rate-limit live check: 9 forgot-password submissions for one address →
  exactly **5** emails/tokens issued (hourly cap), generic responses
  throughout, audit entries present with no token material.
- `npx tsc --noEmit`: clean. `npm run lint`: 0 errors (3 pre-existing
  warnings in unrelated files). `npm run build`: green.
- Fresh-DB `prisma migrate deploy`: 9/9 migrations apply.
- Not tested (stated honestly): delivery through a real external provider
  (no credentials in this environment — the SMTP path was verified against
  a local capture server speaking real SMTP, and Resend uses a single
  documented HTTPS call), and the shared Supabase database (untouched).

## 12. Issues fixed

Recovery absence; email infrastructure absence; staff link-based recovery;
login/recovery UX items 4–6 of section 3. One robustness fix found during
testing: SMTP sends now have connection/greeting/socket timeouts so a bad
mail server cannot hang a recovery request.

## 13. Remaining issues

- Email delivery is **Requires Configuration** in production (section 10);
  until then staff should use temporary-password resets.
- Per-identifier throttle DoS trade-off (issue 8) — documented, accepted.
- Zod advisory from the earlier security mission (fixed only in zod 4) is
  unchanged and still scheduled separately.
- The auth lifecycle migration's own production deployment state is the
  operator's runbook (`docs/SUPABASE-AUTH-DEPLOYMENT.md`); this report does
  not change it.

## 14. Recommended future improvements

1. Configure a real email provider and run one live delivery test per role.
2. Add a monitored alert if reset-email delivery failures spike (audit rows
   already distinguish "email delivery unavailable").
3. Consider persisting the last-used reset IP/user-agent in audit metadata
   (never the token) for abuse investigations.
4. Add caps-lock hints and the support-contact line on auth pages (section 5).
5. When the deployment platform is finalized, prefer a queue/outbox for
   email so requests never wait on SMTP.

## 15. Manual deployment instructions

1. Merge this PR. Do not deploy the new code before the SQL below is
   applied (the recovery actions query the new table).
2. In the Supabase SQL Editor for the confirmed project, run
   `docs/sql/05-password-reset-preflight.sql` (read-only; expect: table
   absent, auth migration recorded, no unfinished migrations). Save the
   user/SUPER_ADMIN counts.
3. Run the exact file
   `prisma/migrations/20261114084833_password_reset_tokens/migration.sql`.
4. Run `docs/sql/06-password-reset-postflight.sql` (expect: 7 columns, 4
   indexes, FK with CASCADE, counts unchanged from preflight, 0 tokens).
   If you enable RLS on the new table during this step (recommended,
   consistent with the other auth tables), add **no policies** — the app
   reaches it only via Prisma as the owner role; anon/authenticated must
   stay deny-all.
5. Reconcile history: either `npx prisma migrate resolve --applied
   20261114084833_password_reset_tokens` locally, or run
   `docs/sql/07-password-reset-reconcile-history.sql` (it verifies the
   objects and the exact migration checksum before inserting history).
6. Set the email environment variables (section 10) + `APP_URL`, then
   deploy/restart the application.
7. Smoke test: request a reset for a test account, confirm the email
   arrives, complete the reset, and sign in with the new password.
