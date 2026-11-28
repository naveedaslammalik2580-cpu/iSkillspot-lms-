-- Website catalog fields for Course: the public website's Courses page and
-- homepage course cards render from these (via GET /api/courses), so the
-- marketing site and the LMS can never show different course lists.
ALTER TABLE "Course" ADD COLUMN "tagline" TEXT;
ALTER TABLE "Course" ADD COLUMN "mastery" TEXT;
ALTER TABLE "Course" ADD COLUMN "outcome" TEXT;
ALTER TABLE "Course" ADD COLUMN "audience" TEXT;
ALTER TABLE "Course" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
