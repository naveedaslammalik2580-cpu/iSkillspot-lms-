// Website course catalog tests — node:test, same source-loader harness as
// tests/website-enroll.test.cjs (real TS source, real Prisma against a
// disposable database).
//
// Covers src/lib/website-catalog.ts (the logic behind GET /api/courses):
//  1. Only PUBLISHED courses are public (DRAFT and ARCHIVED stay hidden).
//  2. Ordering is sortOrder first, then creation order.
//  3. The payload maps title -> name and carries the website fields
//     (tagline, duration, mastery, outcome, audience) verbatim, with
//     nulls preserved for unset fields.
//  4. The pure mapper toCatalogCourse handles a fully-null row.
//
// Refuses to run against a non-test or non-local database.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const { context } = require("./source-loader.cjs");

const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(
  ["localhost", "127.0.0.1"].includes(url.hostname) && /test/.test(url.pathname),
  "Disposable local test database required",
);

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});
const env = {
  NODE_ENV: "development",
  SESSION_SECRET: ["catalog-test", "secret", randomBytes(24).toString("hex")].join("-"),
};
const c = context(db, env);
const catalog = c.load("src/lib/website-catalog.ts");

const run = randomBytes(4).toString("hex");
const createdCourseIds = [];

async function makeCourse(label, data) {
  const course = await db.course.create({
    data: { title: `Catalog Test ${label} ${run}`, slug: `catalog-test-${label}-${run}`, ...data },
  });
  createdCourseIds.push(course.id);
  return course;
}

describe("website course catalog", () => {
  before(async () => {
    await makeCourse("second", {
      status: "PUBLISHED",
      sortOrder: 2,
      tagline: "Tagline two",
      duration: "3 months",
      mastery: "Mastery two",
      outcome: "Outcome two",
      audience: "Audience two",
    });
    await makeCourse("first", { status: "PUBLISHED", sortOrder: 1 });
    await makeCourse("draft", { status: "DRAFT", sortOrder: 0 });
    await makeCourse("archived", { status: "ARCHIVED", sortOrder: 0 });
  });

  after(async () => {
    await db.course.deleteMany({ where: { id: { in: createdCourseIds } } });
    await db.$disconnect();
  });

  it("returns only published courses, ordered by sortOrder", async () => {
    const { courses } = await catalog.websiteCourseCatalog();
    const mine = courses.filter((x) => x.slug.includes(`-${run}`));
    assert.deepEqual(
      mine.map((x) => x.slug),
      [`catalog-test-first-${run}`, `catalog-test-second-${run}`],
    );
  });

  it("maps title to name and carries the website fields", async () => {
    const { courses } = await catalog.websiteCourseCatalog();
    const second = courses.find((x) => x.slug === `catalog-test-second-${run}`);
    assert.equal(second.name, `Catalog Test second ${run}`);
    assert.equal(second.tagline, "Tagline two");
    assert.equal(second.duration, "3 months");
    assert.equal(second.mastery, "Mastery two");
    assert.equal(second.outcome, "Outcome two");
    assert.equal(second.audience, "Audience two");
    const first = courses.find((x) => x.slug === `catalog-test-first-${run}`);
    assert.equal(first.tagline, null);
    assert.equal(first.mastery, null);
  });

  it("mapper preserves nulls on a bare row", () => {
    const mapped = catalog.toCatalogCourse({
      slug: "x",
      title: "X",
      tagline: null,
      duration: null,
      mastery: null,
      outcome: null,
      audience: null,
    });
    assert.deepEqual(mapped, {
      slug: "x",
      name: "X",
      tagline: null,
      duration: null,
      mastery: null,
      outcome: null,
      audience: null,
    });
  });
});
