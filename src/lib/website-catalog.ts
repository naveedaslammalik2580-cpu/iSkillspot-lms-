import { db } from "@/lib/db";

/**
 * Public course catalog for the marketing website.
 *
 * The website's Courses page and homepage course cards render from this
 * data (GET /api/courses), so the LMS is the single source of truth for
 * which courses exist and what their cards say. Only PUBLISHED courses
 * are public; ordering is the admin-controlled sortOrder, then creation
 * order. The enroll form's admission-open list (website-enroll.ts) is a
 * separate, narrower question and is not affected by this catalog.
 */

export type WebsiteCatalogCourse = {
  slug: string;
  name: string;
  tagline: string | null;
  duration: string | null;
  mastery: string | null;
  outcome: string | null;
  audience: string | null;
};

type CourseRow = {
  slug: string;
  title: string;
  tagline: string | null;
  duration: string | null;
  mastery: string | null;
  outcome: string | null;
  audience: string | null;
};

/** Pure row -> payload mapping (unit-tested without a database). */
export function toCatalogCourse(row: CourseRow): WebsiteCatalogCourse {
  return {
    slug: row.slug,
    name: row.title,
    tagline: row.tagline,
    duration: row.duration,
    mastery: row.mastery,
    outcome: row.outcome,
    audience: row.audience,
  };
}

export async function websiteCourseCatalog(): Promise<{
  courses: WebsiteCatalogCourse[];
}> {
  const rows = await db.course.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      slug: true,
      title: true,
      tagline: true,
      duration: true,
      mastery: true,
      outcome: true,
      audience: true,
    },
  });
  return { courses: rows.map(toCatalogCourse) };
}
