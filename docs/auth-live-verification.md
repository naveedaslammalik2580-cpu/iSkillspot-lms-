# Live authentication verification — 2026-11-14

Scope: verify the operator-applied migration and existing accounts without
creating users, resetting credentials, changing roles/status, seeding or
reapplying migrations. Verification runs against a separately started local
production build connected to the configured shared Supabase database.

## Read-only live results

- Database connectivity confirmed with explicit network access.
- Exactly one history row for `20261113120000_auth_account_lifecycle`:
  finished, one applied step, not rolled back. Its checksum matches the
  exact repository migration file.
- New User fields and both new Prisma models are readable. All four security
  indexes exist. The revocation trigger is enabled and uses SECURITY INVOKER.
- Exactly one SUPER_ADMIN exists and is ACTIVE. Required identity fields and
  session-version metadata are valid. Its password has valid bcrypt format;
  this structural check does not establish password correctness.
- The SUPER_ADMIN does not currently require a password change and has no
  temporary-password expiry. No reset or forced-change flag was applied.
- Twenty ACTIVE students and three ACTIVE teachers; no missing linked
  profiles or normalized identity conflicts. No temporary accounts lack
  expiration metadata or have expired temporary credentials.
- User-table RLS is enabled. Supabase `anon` cannot SELECT it and
  `authenticated` cannot UPDATE it.
- Bootstrap markers remain zero for the pre-existing SUPER_ADMIN, as expected.

## Local verification rerun

- Next.js 15.5.29 production build passed with live schema compatibility.
- Standalone TypeScript check passed.
- All nine focused authentication/security tests passed.
- Prisma schema validation and Git whitespace checks passed. There is no
  configured standalone ESLint run.
- Seven live protected GET routes redirected anonymous requests to login,
  including the server-guarded password-change page.
- A malformed session was rejected at live `/admin/accounts`.
- Anonymous direct POSTs for create-admin, password-reset and status-change
  actions were denied at the protected account route. Direct action-function
  authorization and lower-role lifecycle behavior remain covered by the
  earlier isolated suite; they were not exercised by changing live users.

## Private browser handoff

A separate Edge context is open at `http://localhost:3100/login`. The
operator was asked to enter the existing SUPER_ADMIN credentials locally.
Password fields are never read by automation. No screenshots, traces,
credential exports or stored browser authentication state are recorded.

After an operator-reported invalid login, read-only inspection reconfirmed
that exactly one ACTIVE SUPER_ADMIN still exists with valid bcrypt-format
storage and no temporary expiry. Its username was filled only in the local
private verification window, without printing or persisting the identifier.
No additional account was created, and no password was reset. Credential
entry or explicitly authorized operator recovery remains necessary.

Actual successful login, account-page access, persistence, cookie flags and
logout are **pending private operator sign-in**. No successful live login
is claimed until it is observed and tested.

Read-only browser checks will cover User Accounts visibility and eligible
controls, role-route boundaries, missing/invalid sessions, and the password
change form. Lifecycle mutations and first-login enforcement remain covered
by the previously passed isolated PostgreSQL/browser suite. Existing live
users will not be reset/deactivated or used as disposable fixtures.

## Commit/push readiness

The working branch is `main`, HEAD `ad72ef1`, with existing local changes
preserved. No commit, push, merge or deployment was performed by the agent.
Live credential verification is pending. The earlier runtime dependency audit
also reported eight package advisories (six high, two moderate); those remain
separate review items before production approval.

Build/type/schema checks support a review commit, but final live-auth signoff
and production readiness are not complete. The separate verification app and
private Edge window remain open for the operator's sign-in. This verification
has changed only documentation and ignored temporary test scripts, not
application authentication logic or existing accounts.
