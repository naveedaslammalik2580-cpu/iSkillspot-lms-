# iSkillSpot LMS

Production-oriented Learning Management System for the iSkillSpot institute.
Built with Next.js 15 (App Router), TypeScript, Prisma, PostgreSQL, and Tailwind.

This is a **real, functional application** — real database, real auth, real
CRUD, real server-side authorization — not a static prototype.

---

## Architecture (Section 43 deliverable)

### 1. Stack
- **Next.js 15 / React 19 / TypeScript** — App Router, Server Components, Server Actions.
- **Prisma + PostgreSQL** — normalized relational schema (`prisma/schema.prisma`).
- **Auth** — custom session (JWT sealed in an httpOnly cookie via `jose`), bcrypt password hashing.
- **Tailwind + shadcn-style UI primitives** in `src/components/ui`.

### 2. Database schema
See `prisma/schema.prisma` (32 models). Covers users, students, courses,
modules, lessons, batches, enrollments, assignments, submissions, quizzes,
questions, a question bank, attempts, fees, payments, certificates,
announcements, notifications (incl. Web Push subscriptions), support
tickets, admissions, auth tokens/throttles, email outbox, audit logs, and
settings. The system runs an **agency model** (staff ↔ students): there is
no teacher role, no attendance, and no grades module — those were removed
in the 2026-11-18 pivot and the Phase 2 database cleanup. Key integrity rules:
- `Student.studentId`, `User.username/email`, `Certificate.certificateNumber`
  and `Certificate.verificationCode` unique.
- Enrollment uniqueness on `(studentId, batchId)`.
- Indexes on hot lookup/filter columns.

### 3. Authentication & authorization
- `src/lib/auth/password.ts` — bcrypt hashing + temp-password generator.
- `src/lib/auth/session.ts` — signed session cookie, expiry, remember-me.
- `src/lib/auth/permissions.ts` — the **role/permission matrix** (single source of truth).
- `src/lib/auth/guards.ts` — server guards: `requireSession`, `requireRole`,
  `requireStaff`, `requirePermission`, `requireStudentSelf`.
- `src/middleware.ts` — edge route gating per role + forced password change.

**Security model:** the UI hides what a role can't do, but every server action
and page loader re-checks permission on the server. Students resolve only their
**own** `Student` row. Nothing trusts the client.

### 4. Role / permission matrix
| Capability group | SUPER_ADMIN | ADMIN | STUDENT |
|---|:-:|:-:|:-:|
| System settings / admin mgmt / audit logs | ✓ | — | — |
| Students, courses, batches, enroll | ✓ | ✓ | — |
| Assignments / quizzes (incl. grading & marking) | ✓ | ✓ | own only |
| Fees / payments / certificates / reports | ✓ | ✓ | — |
| View own data only | — | — | ✓ |

The full per-permission matrix lives in `src/lib/auth/permissions.ts`.

### 5. Navigation
Role-driven in `src/lib/nav.ts`, rendered by the responsive app shells.

### 6. Route / component structure
`src/app/{login,register,admission,forgot-password,reset-password,
change-password,verify-email,admin,student,verify,certificates,forbidden}`.
Each portal area has a layout that applies the correct guard. Public
certificate verification lives at `/verify/[verificationCode]`.

### 7. Server-action structure
`src/lib/actions/*` (auth, students, settings). `src/lib/data/*` for read
aggregations. All mutating actions call a guard + `logAction` (audit).

### 8. Current state
Fully implemented: accounts and role-based access, public student
registration + admissions with staff approval, courses/modules/lessons,
batches and enrollments, assignments (incl. PDF task files and grading),
quizzes (timed attempts, question bank, short-answer marking), fees and
payments, notifications (in-app + Web Push) and announcements, support
tickets, settings, audit logs, and the admin dashboard. The Certificates
module is **parked** by product decision: its code and schema are retained
and its admin pages remain routable, but it is unlinked from navigation
pending a separate integration decision.

---

## Setup

Install dependencies with `npm install` and configure the private environment
using `.env.example` as a list of required variable names. Never commit real
credentials.

For an existing Supabase project, follow
[the ordered manual authentication SQL deployment guide](docs/SUPABASE-AUTH-DEPLOYMENT.md).
Apply the reviewed SQL and reconcile Prisma migration history before running
the updated application. Do not run seeds, database resets or db push against
shared databases.

The current shared database already has a SUPER_ADMIN. Do not create another
or reset it automatically. The operator-only `npm run auth:bootstrap -- --inspect`
command is read-only. Initial creation for a genuinely empty installation
requires the private interactive procedure documented in the deployment guide.

Run `npm run dev` locally after the schema is ready. All roles share `/login`.
SUPER_ADMIN can create ADMIN accounts in `/admin/accounts`; staff create
student accounts from the admin portal, and prospective students can also
self-register via `/register` and complete the admissions flow (staff
approval required before full access).

Temporary credentials expire in 24 hours and require a first-login password
change. Share them privately; no default or bootstrap passwords are published.

Run `npm test` for the full suite (TypeScript suites plus the auth checks;
requires a disposable local PostgreSQL database whose name contains "test",
with migrations applied). Run `npm run test:auth` for the focused auth
checks, and `npm run test:auth:integration` for a separate disposable
PostgreSQL cluster, real Prisma lifecycle tests and headless Edge checks.
The latter requires local PostgreSQL binaries and the installed Playwright
package/system Edge.

---

## What's verified
- `npx tsc --noEmit` — passes (0 errors).
- `npx eslint .` — passes (0 errors).
- `npm test` — full suite passes against a disposable test database.
- `npm run build` — passes (all routes + middleware compile).

## Notes for continued development
- File storage uses Supabase Storage via `src/lib/storage/supabase.ts`
  (private bucket; signed URLs). Lesson videos are embedded from
  allowlisted external providers (YouTube/Vimeo).
- Deployment-only configuration (external cron scheduler for
  `/api/cron/emails` + `/api/cron/reminders`, VAPID keys, storage bucket,
  email provider) is covered in `.env.example` and the runbooks under
  `docs/`; none of it is verifiable from the repository alone.
