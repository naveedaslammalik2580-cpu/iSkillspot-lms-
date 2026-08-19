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
See `prisma/schema.prisma`. Covers users, students, teachers, courses, modules,
lessons, batches, enrollments, attendance, assignments, submissions, quizzes,
questions, attempts, grades, fees, payments, certificates, announcements,
notifications, audit logs, and settings. Key integrity rules:
- `Student.studentId`, `User.username/email`, `Certificate.certificateNumber` unique.
- Attendance uniqueness on `(studentId, batchId, date)` — prevents duplicates.
- Enrollment uniqueness on `(studentId, batchId)`.
- Indexes on hot lookup/filter columns.

### 3. Authentication & authorization
- `src/lib/auth/password.ts` — bcrypt hashing + temp-password generator.
- `src/lib/auth/session.ts` — signed session cookie, expiry, remember-me.
- `src/lib/auth/permissions.ts` — the **role/permission matrix** (single source of truth).
- `src/lib/auth/guards.ts` — server guards: `requireSession`, `requireRole`,
  `requireStaff`, `requirePermission`, `requireStudentSelf`, `requireTeacherSelf`,
  and teacher-scope assertions (`assertTeacherOwnsBatch/Student`).
- `src/middleware.ts` — edge route gating per role + forced password change.

**Security model:** the UI hides what a role can't do, but every server action
and page loader re-checks permission on the server. Students resolve only their
**own** `Student` row; teachers are scoped to assigned batches. Nothing trusts
the client.

### 4. Role / permission matrix
| Capability group | SUPER_ADMIN | ADMIN | TEACHER | STUDENT |
|---|:-:|:-:|:-:|:-:|
| System settings / admin mgmt / audit logs | ✓ | — | — | — |
| Students, teachers, courses, batches, enroll | ✓ | ✓ | — | — |
| Attendance / assignments / quizzes / grades | ✓ | ✓ | scoped | — |
| Fees / payments / certificates / reports | ✓ | ✓ | — | view own |
| View own data only | — | — | — | ✓ |

### 5. Navigation
Role-driven in `src/lib/nav.ts`, rendered by the responsive shell
`src/components/app-shell.tsx` (Sections 23–25).

### 6. Route / component structure
`src/app/{login,admin,teacher,student,verify}` matching Section 5. Each area has
a layout that applies the correct guard. Public `/verify/[certificateNumber]`.

### 7. Server-action structure
`src/lib/actions/*` (auth, students, settings). `src/lib/data/*` for read
aggregations. All mutating actions call a guard + `logAction` (audit).

### 8. Milestones
Stages 1–7 per Section 37. **Implemented now:** Stage 1 fully (project, DB, auth,
roles, permissions, layout, nav), plus Stage 2's core — the complete Add-Student
workflow (Section 26), student list + search/filters (Section 16), Student 360°
profile (Section 8), admin dashboard with live stats/at-risk/charts (Section 7),
student dashboard (Section 9), settings (Section 31), audit logs (Section 30),
and public certificate verification (Section 15). Remaining modules are stubbed
as guarded, labeled pages ready to fill against the existing schema.

---

## Setup

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env
#   set DATABASE_URL to your Postgres instance
#   set SESSION_SECRET to a random string (>= 32 chars)

# 3. Create the schema
npm run db:push

# 4. Seed demo data (Section 39)
npm run db:seed

# 5. Run
npm run dev    # http://localhost:3000
```

### Demo logins (after seeding)
- **Super admin:** `admin` / `Admin@123`
- **Teacher:** `teacher1` / `Teacher@123`
- **Student:** any seeded student username (e.g. `ahmed.0001`) / `Student@123`

> Students cannot self-register. Accounts are created by staff only.

---

## What's verified
- `npx tsc --noEmit` — passes (0 errors).
- `npx next build` — passes (all routes + middleware compile).

## Notes for continued development
- Add the remaining module UIs (assignments, quizzes, attendance marking, fees,
  certificates issuance) against the existing schema and the `requirePermission`
  guards — the data model and authorization are already in place.
- File/video storage is intentionally abstracted (store URLs, not blobs) so S3,
  R2, Supabase, or Cloudinary can be plugged in later (Section 4).
