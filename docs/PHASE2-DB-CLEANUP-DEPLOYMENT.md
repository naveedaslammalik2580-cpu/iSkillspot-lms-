# Phase 2 — Database Cleanup Deployment Pack

**Migration:** `20261119090000_remove_teacher_attendance_grades`
**What it does:** completes the agency-model change (Admin ↔ Student only) at the
database level. Phase 1 removed the teacher / attendance / grades screens; this
migration removes their data structures.

> ## ⚠️ READ THIS FIRST — DATA DELETION
>
> Applying this migration to the shared Supabase database **permanently deletes**
> all teacher, attendance and grade data in it:
>
> - the `Teacher`, `Attendance` and `Grade` tables (dropped, with all rows),
> - the `teacherId` column on `Batch` and on `Announcement`,
> - the `TEACHER` value of the `Role` enum (and the `AttendanceStatus` enum).
>
> **There is no down-migration and no undo.** The only rollback is restoring
> from a backup. **Take the backup in Step 1 before doing anything else, and
> keep it until the new system has been verified in production.**

Nothing else is touched: students, courses, batches, enrollments, fees,
payments, assignments, quizzes, question bank, support tickets, announcements,
notifications and certificates are all preserved.

---

## Step 1 — Back up the shared database (mandatory)

From any machine with PostgreSQL client tools, using the **direct** (non-pooled)
Supabase connection string:

```bash
pg_dump "postgresql://<user>:<password>@<host>:5432/<db>" \
  --format=custom --file=iskillspot-backup-before-phase2.dump
```

Verify the file is non-trivial in size and keep a copy outside the database
server (e.g. local disk + cloud storage). To restore later if needed:

```bash
pg_restore --clean --if-exists \
  --dbname="postgresql://<user>:<password>@<host>:5432/<db>" \
  iskillspot-backup-before-phase2.dump
```

## Step 2 — Pre-checks (see what will be deleted)

Run these in the Supabase SQL editor (or psql) and note the counts:

```sql
SELECT count(*) AS teacher_users       FROM "User" WHERE role = 'TEACHER';
SELECT count(*) AS teacher_rows        FROM "Teacher";
SELECT count(*) AS attendance_rows     FROM "Attendance";
SELECT count(*) AS grade_rows          FROM "Grade";
SELECT count(*) AS teacher_targeted    FROM "Announcement" WHERE "targetRole" = 'TEACHER';
SELECT count(*) AS batches_with_teacher FROM "Batch" WHERE "teacherId" IS NOT NULL;

-- Baseline counts that must NOT change (compare after Step 5):
SELECT count(*) AS students FROM "Student";
SELECT count(*) AS courses  FROM "Course";
SELECT role, count(*) AS users_by_role FROM "User" GROUP BY role;
```

## Step 3 — Pre-steps (REQUIRED if any TEACHER accounts exist)

The migration recreates the `Role` enum without `TEACHER`. Postgres refuses
that while any row still uses the value — the migration will fail with
`invalid input value for enum "Role_new": "TEACHER"` (verified). Two columns
can hold the value: `User.role` and `Announcement.targetRole`.

The seeded teacher accounts (`teacher1`, `teacher2`, `teacher3`) are demo
accounts with no portal in the agency model. **First verify** they are really
just the demo/seed accounts (or other accounts you are certain should go):

```sql
SELECT id, username, email, "createdAt" FROM "User" WHERE role = 'TEACHER';
```

If — and only if — every listed account is one that should be removed, run:

```sql
-- 1) Announcements aimed at teachers keep their content; only the now-invalid
--    role target is cleared. (Their `audience` stays 'TEACHERS' and simply
--    reaches nobody, exactly as the app treats legacy announcements.)
UPDATE "Announcement" SET "targetRole" = NULL WHERE "targetRole" = 'TEACHER';

-- 2) Delete the TEACHER login accounts. Their Teacher profile rows are
--    removed by the foreign-key cascade; batches keep existing (their
--    teacher link is cleared automatically).
DELETE FROM "User" WHERE role = 'TEACHER';
```

If the Step 2 counts for `teacher_users` and `teacher_targeted` are both 0,
skip this step entirely.

## Step 4 — Apply the migration

**Preferred — Prisma migrate deploy** (records the migration as applied and
runs exactly the reviewed SQL):

```bash
# from the repo checkout that contains this migration, with DATABASE_URL and
# DIRECT_URL pointing at the shared Supabase database:
npx prisma migrate deploy
```

Expected output includes `20261119090000_remove_teacher_attendance_grades`
in the applied list and ends with "All migrations have been successfully
applied."

**Alternative — Supabase SQL editor:** paste the full contents of
`prisma/migrations/20261119090000_remove_teacher_attendance_grades/migration.sql`
and run it. ⚠️ If you do it this way, Prisma will still think the migration is
pending; afterwards run `npx prisma migrate resolve --applied 20261119090000_remove_teacher_attendance_grades`
so future `migrate deploy` runs stay consistent. The `migrate deploy` route is
preferred precisely because it avoids this mismatch.

## Step 5 — Post-checks

```sql
-- Tables must be gone (expect 0 rows):
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('Teacher', 'Attendance', 'Grade');

-- Columns must be gone (expect 0 rows):
SELECT table_name, column_name FROM information_schema.columns
WHERE column_name = 'teacherId' AND table_name IN ('Batch', 'Announcement');

-- Role enum must be exactly these three:
SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'Role' ORDER BY e.enumsortorder;
-- SUPER_ADMIN, ADMIN, STUDENT

-- Unchanged data (compare with Step 2 baselines):
SELECT count(*) AS students FROM "Student";
SELECT count(*) AS courses  FROM "Course";
```

Then in the deployed app:

1. Log in as admin → dashboard, students, courses, quizzes (incl. Question
   Bank), support inbox all load.
2. Log in as a student → My Courses, Quizzes, Assignments, Help & Support load.
3. Create + publish a quiz as admin and attempt it as the student.

## Rollback

There is **no down-migration**. If anything is wrong after Step 4, the only
rollback is restoring the Step 1 backup with `pg_restore` (above), which
returns the database to its exact pre-migration state — including any data
written after the backup was taken being lost. That is why the backup is
mandatory and why this migration should be applied during a quiet window,
before new production data is written against the cleaned schema.
