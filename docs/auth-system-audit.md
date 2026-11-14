# Authentication and account audit — 2026-11-13

Continuation: the later user instruction permits independent local work
while Supabase is unreachable. Implementation has now proceeded; see
[the implementation report](auth-implementation-report.md) and
[manual SQL deployment guide](SUPABASE-AUTH-DEPLOYMENT.md). The findings and
access failures below describe the earlier audit, not current completion status.

Baseline: branch `main`, eight existing unrelated modified files in student,
teacher, fee and payment views/data. Those edits must be preserved. The
previous login diagnosis and isolated tests are present as untracked files.
No security-specific commit or PR #1 checkout was found in local Git history.

## Findings before implementation

- Custom Prisma User + bcrypt cost 12 + jose HS256 cookie authentication;
  Supabase PostgreSQL is storage, not the application's identity provider.
- The original reported identity is missing from the LMS User table. Do not
  import Supabase Auth password hashes or switch identity providers.
- Existing teacher/student creation creates User/profile atomically, hashes
  temporary passwords and requires first-login password change. Login should
  work for correctly provisioned active users; real DB/browser verification
  is still required on disposable fixtures.
- User account status is checked at login only. Session resolution trusts
  stale JWT role/status/password state for up to thirty days. Deactivation,
  reset and role changes do not invalidate existing sessions.
- Forced password change exists in middleware, but direct protected server
  actions only check session/permissions and can skip it.
- Teacher/student mutation actions trust a profile's linked user without
  checking its current role, which permits inappropriate account management
  if profile data and a manually changed User role diverge.
- Teacher/student identity validation is inconsistent; case-sensitive unique
  keys do not prevent case/whitespace duplicates. Login uses exact matches.
- Account audit writes are separate from provisioning/reset transactions;
  a failed audit can report failure after a user has already been created.
- Temporary passwords have no expiration. Password change accepts eight
  characters and silently permits bcrypt's 72-byte truncation.
- Login rate limiting is process-local, unbounded and lost on restart. It is
  ineffective across multiple app instances.
- No operator-only initial SUPER_ADMIN bootstrap or administrator management
  UI exists. `admin.manage` is reserved for SUPER_ADMIN; teacher/student
  permissions are already limited to staff. No public registration exists.
- No ESLint configuration is present. Existing auth tests use in-memory DB
  fixtures, not real Prisma integration. PostgreSQL 18 binaries are available
  locally, permitting a separately initialized disposable test cluster.

## Shared Supabase read-only checkpoint

Configured project reference: `pkytvteehphllfiwwrfo`. Connectivity confirmed
using Next environment loading and an explicitly read-only transaction.
Aggregate result: one ACTIVE SUPER_ADMIN, three ACTIVE teachers, twenty
ACTIVE students, zero missing linked profiles, zero normalization conflicts.
The User table has RLS enabled; API grants exist, so policy effectiveness
must be inspected before drawing conclusions about API exposure.

No shared mutations authorized or performed. In particular, the existing
SUPER_ADMIN must not be overwritten or treated as a bootstrap fixture.

Later in this same audit, two subsequent checks failed with Prisma `P1001`
even with network access granted. The mandatory live-access checkpoint is
therefore currently blocked. Implementation is paused until the operator
restores connectivity; the earlier successful aggregate query is historical
evidence, not a claim that connectivity is still working.

The Windows Prisma engine lock was identified using a read-only module
inspection: `node.exe`, PID `23472`. That process was not terminated.

## Implementation decisions

Keep Prisma/bcrypt/JWT. Add database-backed session revocation and login
throttling, expiring temporary credentials, identity uniqueness safeguards,
an operator-only bootstrap with transaction locking, and guarded User
Accounts management. Prepare additive migrations for operator review;
apply only to the isolated cluster during this work. Existing privileged
accounts and all shared data remain untouched.

These are pending decisions, not implemented fixes. This audit added only
this findings document and `scripts/auth-diagnostics.cjs`. No migrations,
bootstrap implementation, account-management UI, or session changes have
been made yet. No new login, lifecycle, build, or integration tests have
been run during this audit. Branch remains `main`; no commit, push, merge,
or deployment was performed.
