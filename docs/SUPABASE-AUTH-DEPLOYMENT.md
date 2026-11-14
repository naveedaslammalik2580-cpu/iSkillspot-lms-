# Manual authentication SQL deployment

No shared migration or account change has been executed by the coding agent.
Use this runbook in the intended Supabase project. Its previously inspected
project reference is `pkytvteehphllfiwwrfo`; confirm the project in Dashboard
before executing SQL. Do not paste database URLs, passwords or service keys
into chat, tickets, commits or SQL Editor.

The authentication implementation and SQL workflow passed isolated local
verification on Next.js 15.5.29. Remaining dependency advisories and the
complete test/file inventory are recorded in
[the implementation report](auth-implementation-report.md); review those
before production approval. A real Supabase login has not been verified.

## What changes

One additive migration adds `User.sessionVersion` and `User.passwordExpiresAt`,
private `AuthThrottle` and `AccountBootstrap` tables, normalized identity
unique indexes and a session-revocation trigger. No accounts are created,
deleted, promoted or assigned a different password/role. Academic and finance
tables are untouched.

The migration gives existing **temporary-password** users a 24-hour expiry
window starting when you execute it. Their passwords are not reset. Permanent
passwords have no new expiry. Inform affected users before running it.
Old JWTs lack a version claim and will require everyone to sign in again
when the updated application is started.

The `User`, throttle and bootstrap tables are inaccessible to Supabase Data
API `anon`/`authenticated` roles. The application uses its private Prisma
database connection; it must retain table access and RLS bypass as currently
configured for that private operator role. Do not grant these tables to
browser/API roles. This does not change Storage bucket policies.

## Exact execution order

1. Open **SQL Editor** for the confirmed project. Run
   `docs/sql/01-auth-preflight.sql` unchanged. It is read-only. Save the
   business-table counts and role counts privately. Duplicate checks must
   return zero rows. Investigate whitespace identities before proceeding.
   Confirm the expected existing SUPER_ADMIN count remains one. Verify
   `_prisma_migrations` has no unfinished migration and the prior repository
   migrations are already recorded. If history is absent or inconsistent,
   stop migration work and reconcile the existing baseline with your database
   operator; do not mark unverified old migrations applied.
2. If the new columns/tables or target migration already exist, inspect
   history and postflight results first; do not blindly rerun the DDL.
   Otherwise execute the **entire exact file**
   `prisma/migrations/20261113120000_auth_account_lifecycle/migration.sql`.
   This is step 02; there is no duplicate SQL copy. It contains `BEGIN` and
   `COMMIT`. Any error rolls back the whole change. A lock timeout means
   retry later during a quiet interval, not remove the timeout or terminate
   unrelated sessions.
3. Run `docs/sql/03-auth-postflight.sql`. Expect both new User columns,
   four named indexes, one enabled trigger and RLS on all three auth tables.
   Missing temporary expirations and invalid version counts must be zero.
   Compare business-table and SUPER_ADMIN counts with preflight; those
   records must be preserved. The bootstrap marker count stays zero for a
   pre-existing SUPER_ADMIN provisioned outside this new mechanism.
4. Reconcile migration history using **one** option below. Then regenerate
   the local Prisma client, verify types/build and restart the application
   only after operator review. Do not start this new code against the old
   schema. This runbook does not authorize a Git push or deployment.

## Prisma migration history after manual SQL

Preferred, when the operator's configured local DB connection works:

```powershell
npx prisma migrate resolve --applied 20261113120000_auth_account_lifecycle
npx prisma migrate status
```

`resolve --applied` records the checksum/history for SQL you already applied;
it does not execute that SQL. Do not run it before successful postflight.

If CLI connectivity is unavailable, run
`docs/sql/04-auth-reconcile-history.sql` in SQL Editor instead. It verifies
the expected objects, inserts only this migration's history row, and refuses
to overwrite conflicting/unfinished history. Its checksum corresponds to
the exact committed versioned migration file. **Do not edit that migration
after applying it.** If the migration file changes before initial execution,
regenerate the companion history checksum and review both files again.

When CLI connectivity returns, run `npx prisma migrate status` and confirm
this migration is applied. Future `prisma migrate deploy` will skip it after
correct reconciliation. Never reapply migration DDL or invent rows for
unverified historical migrations to silence an error.

## Account/bootstrap operator steps

The shared database already has a SUPER_ADMIN. **Do not create another and
do not reset its password as part of deployment.** Inspect only:

```powershell
npm run auth:bootstrap -- --inspect
```

For a different, genuinely empty installation only, configure the private
environment using placeholders (not committed credentials): `DATABASE_URL`,
`DIRECT_URL`, `SESSION_SECRET`, `BOOTSTRAP_EMAIL`, `BOOTSTRAP_USERNAME`.
After applying migrations, an authorized operator can run:

```powershell
npm run auth:bootstrap -- --create --confirm-project <confirmed-project-reference-or-local-database-name>
```

The command requires interactive hidden password entry and confirmation,
rejects existing SUPER_ADMIN/bootstrap state without overwriting it, and
serializes concurrent bootstrap attempts. No passwords are accepted as CLI
arguments, printed or written to logs. It creates ACTIVE SUPER_ADMIN with
first-login password change and 24-hour temporary expiry. This operation
is not appropriate for the current shared project.

After SQL and code review, the existing SUPER_ADMIN should sign in privately
and visit `/admin/accounts`. Provision ADMIN there; use the existing teacher
and student workflows for their profiles. An account only in `auth.users`
still cannot sign in to this custom-auth LMS. Authorized provisioning creates
a separate LMS User without copying any Supabase Auth hashes or records.

Finally verify real sign-in, first password change where required, role
dashboard, reload persistence and logout. Those live checks remain operator
work until connectivity and an authorized account session are available.
