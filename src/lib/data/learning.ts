import { db } from "@/lib/db";

/**
 * Learning data layer: student course/lesson views, the admin content
 * management view, and progress computation.
 *
 * Authorization model: every function here takes the ALREADY-AUTHENTICATED
 * principal's own id (studentId resolved by the page or action from the
 * session via requireStudentSelf) and scopes every query by it. A student
 * id can therefore only ever read that student's enrollments, lessons and
 * progress. Callers must never pass an id taken from request input.
 *
 * Visibility rules:
 * - Students see a course only while enrolled (ACTIVE or COMPLETED
 *   enrollment). Lessons are visible to students only when
 *   `isPublished` is true. Course `status` is an admin publishing flag for
 *   the catalogue; enrollment is the student's access grant, so an
 *   enrolled student keeps access to their course content.
 * - Progress percentages are always computed live from published lessons
 *   and LessonProgress rows (never from the denormalized
 *   Enrollment.progress field), so they cannot drift.
 */

const ENROLLMENT_LEARNING_STATUSES = ["ACTIVE", "COMPLETED"] as const;

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

export interface ProgressSummary {
  totalLessons: number;
  completedLessons: number;
  /** 0–100, integer. 0 when the course has no lessons. */
  percent: number;
}

export function computeProgress(totalLessons: number, completedLessons: number): ProgressSummary {
  const total = Math.max(0, totalLessons);
  const completed = Math.min(Math.max(0, completedLessons), total);
  return {
    totalLessons: total,
    completedLessons: completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

export type ResourceUrlKind = "external" | "storage-key" | "invalid";

/**
 * LessonResource.fileUrl is a free-form string in the schema: it may hold
 * an external http(s) URL or a Supabase Storage object key (the pattern
 * used by assignment submission files). Classify it so access code can
 * either redirect to the validated external URL or mint a signed URL.
 * Anything else (other schemes, protocol-relative, whitespace/control
 * chars, empty) is invalid and must never be linked or redirected to.
 */
export function classifyResourceUrl(fileUrl: string | null | undefined): ResourceUrlKind {
  if (!fileUrl) return "invalid";
  const value = fileUrl.trim();
  if (!value || /[\s\x00-\x1f\x7f\\]/.test(value)) return "invalid";
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:" ? "external" : "invalid";
    } catch {
      return "invalid";
    }
  }
  if (value.includes("://") || value.startsWith("//")) return "invalid";
  // Any other URI scheme (javascript:, data:, ftp:, ...) is not a storage
  // key and must never be treated as one.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return "invalid";
  return "storage-key";
}

// ---------------------------------------------------------------------------
// Student views
// ---------------------------------------------------------------------------

export interface StudentCourseCard {
  courseId: string;
  title: string;
  slug: string;
  description: string | null;
  level: string;
  duration: string | null;
  batchId: string;
  batchName: string;
  batchCode: string;
  enrollmentStatus: string;
  enrollmentDate: Date;
  progress: ProgressSummary;
}

export async function getStudentCourses(studentId: string): Promise<StudentCourseCard[]> {
  const enrollments = await db.enrollment.findMany({
    where: { studentId, accessSuspended: false, status: { in: [...ENROLLMENT_LEARNING_STATUSES] } },
    include: {
      course: { select: { id: true, title: true, slug: true, description: true, level: true, duration: true } },
      batch: {
        select: {
          id: true, name: true, code: true,
        },
      },
    },
    orderBy: { enrollmentDate: "desc" },
  });
  if (enrollments.length === 0) return [];

  const courseIds = [...new Set(enrollments.map((e) => e.courseId))];

  // The three lookups below depend only on courseIds, not on each other —
  // they used to run strictly one-after-another (groupBy -> modules ->
  // progress), three sequential round trips on the student landing page's
  // critical path. They now run concurrently; results are unchanged.
  const [totals, done] = await Promise.all([
    // Published-lesson totals per course (groupBy is per module; roll up
    // to course via the module->course map). The module map does not
    // depend on the groupBy result, so it is fetched in parallel with it.
    (async () => {
      const [byModule, modules] = await Promise.all([
        db.lesson.groupBy({
          by: ["moduleId"],
          where: { isPublished: true, module: { courseId: { in: courseIds } } },
          _count: { _all: true },
        }),
        db.module.findMany({
          where: { courseId: { in: courseIds } },
          select: { id: true, courseId: true },
        }),
      ]);
      const courseOf = new Map(modules.map((m) => [m.id, m.courseId]));
      const perCourse = new Map<string, number>();
      for (const row of byModule) {
        const cid = courseOf.get(row.moduleId);
        if (cid) perCourse.set(cid, (perCourse.get(cid) ?? 0) + row._count._all);
      }
      return perCourse;
    })(),
    // Completed lessons per course (a lesson belongs to exactly one course,
    // resolved through its module).
    db.lessonProgress.findMany({
      where: {
        studentId,
        completed: true,
        lesson: { isPublished: true, module: { courseId: { in: courseIds } } },
      },
      select: { lesson: { select: { module: { select: { courseId: true } } } } },
    }),
  ]);
  const completedPerCourse = new Map<string, number>();
  for (const row of done) {
    const cid = row.lesson.module.courseId;
    completedPerCourse.set(cid, (completedPerCourse.get(cid) ?? 0) + 1);
  }

  return enrollments.map((e) => ({
    courseId: e.course.id,
    title: e.course.title,
    slug: e.course.slug,
    description: e.course.description,
    level: e.course.level,
    duration: e.course.duration,
    batchId: e.batch.id,
    batchName: e.batch.name,
    batchCode: e.batch.code,
    enrollmentStatus: e.status,
    enrollmentDate: e.enrollmentDate,
    progress: computeProgress(totals.get(e.courseId) ?? 0, completedPerCourse.get(e.courseId) ?? 0),
  }));
}

export interface StudentLessonRow {
  id: string;
  title: string;
  description: string | null;
  duration: string | null;
  order: number;
  completed: boolean;
  hasVideo: boolean;
  resourceCount: number;
}

export interface StudentCourseDetail {
  course: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    level: string;
    duration: string | null;
  };
  batch: { id: string; name: string; code: string };
  enrollmentStatus: string;
  progress: ProgressSummary;
  modules: {
    id: string;
    title: string;
    description: string | null;
    order: number;
    lessons: StudentLessonRow[];
  }[];
}

/** Returns null when the student is not enrolled in the course. */
export async function getStudentCourse(studentId: string, courseId: string): Promise<StudentCourseDetail | null> {
  const enrollment = await db.enrollment.findFirst({
    where: { studentId, courseId, accessSuspended: false, status: { in: [...ENROLLMENT_LEARNING_STATUSES] } },
    include: {
      course: { select: { id: true, title: true, slug: true, description: true, level: true, duration: true } },
      batch: { select: { id: true, name: true, code: true } },
    },
  });
  if (!enrollment) return null;

  const modules = await db.module.findMany({
    where: { courseId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: {
      lessons: {
        where: { isPublished: true },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: {
          id: true, title: true, description: true, duration: true, order: true, videoUrl: true,
          _count: { select: { resources: true } },
        },
      },
    },
  });

  const lessonIds = modules.flatMap((m) => m.lessons.map((l) => l.id));
  const doneRows = lessonIds.length
    ? await db.lessonProgress.findMany({
        where: { studentId, completed: true, lessonId: { in: lessonIds } },
        select: { lessonId: true },
      })
    : [];
  const done = new Set(doneRows.map((r) => r.lessonId));

  const total = lessonIds.length;
  return {
    course: enrollment.course,
    batch: {
      id: enrollment.batch.id,
      name: enrollment.batch.name,
      code: enrollment.batch.code,
    },
    enrollmentStatus: enrollment.status,
    progress: computeProgress(total, done.size),
    modules: modules.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      order: m.order,
      lessons: m.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        duration: l.duration,
        order: l.order,
        completed: done.has(l.id),
        hasVideo: Boolean(l.videoUrl),
        resourceCount: l._count.resources,
      })),
    })),
  };
}

export interface StudentLessonDetail {
  lesson: {
    id: string;
    title: string;
    description: string | null;
    content: string | null;
    videoUrl: string | null;
    duration: string | null;
  };
  module: { id: string; title: string };
  course: { id: string; title: string };
  completed: boolean;
  resources: { id: string; title: string; fileType: string | null }[];
  prev: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
  /** 1-based position among published lessons, and their total. */
  position: number;
  totalLessons: number;
}

/** Returns null when the lesson is unpublished or the student is not enrolled in its course. */
export async function getStudentLesson(studentId: string, lessonId: string): Promise<StudentLessonDetail | null> {
  const lesson = await db.lesson.findFirst({
    where: { id: lessonId, isPublished: true },
    include: {
      module: { select: { id: true, title: true, courseId: true, course: { select: { id: true, title: true } } } },
      resources: { orderBy: { createdAt: "asc" }, select: { id: true, title: true, fileType: true } },
    },
  });
  if (!lesson) return null;

  const courseId = lesson.module.courseId;
  const enrollment = await db.enrollment.findFirst({
    where: { studentId, courseId, accessSuspended: false, status: { in: [...ENROLLMENT_LEARNING_STATUSES] } },
    select: { id: true },
  });
  if (!enrollment) return null;

  // Ordered outline of published lessons across the whole course.
  const outline = await db.lesson.findMany({
    where: { isPublished: true, module: { courseId } },
    orderBy: [{ module: { order: "asc" } }, { module: { createdAt: "asc" } }, { order: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true },
  });
  const idx = outline.findIndex((l) => l.id === lessonId);

  const progress = await db.lessonProgress.findUnique({
    where: { studentId_lessonId: { studentId, lessonId } },
    select: { completed: true },
  });

  return {
    lesson: {
      id: lesson.id,
      title: lesson.title,
      description: lesson.description,
      content: lesson.content,
      videoUrl: lesson.videoUrl,
      duration: lesson.duration,
    },
    module: { id: lesson.module.id, title: lesson.module.title },
    course: lesson.module.course,
    completed: progress?.completed ?? false,
    resources: lesson.resources,
    prev: idx > 0 ? outline[idx - 1] : null,
    next: idx >= 0 && idx < outline.length - 1 ? outline[idx + 1] : null,
    position: idx + 1,
    totalLessons: outline.length,
  };
}

// ---------------------------------------------------------------------------
// Content management view (admin)
// ---------------------------------------------------------------------------

export interface CourseContent {
  course: { id: string; title: string; slug: string; status: string };
  modules: {
    id: string;
    title: string;
    description: string | null;
    order: number;
    lessonCount: number;
    assignmentCount: number;
    quizCount: number;
    lessons: {
      id: string;
      title: string;
      description: string | null;
      content: string | null;
      videoUrl: string | null;
      duration: string | null;
      order: number;
      isPublished: boolean;
      progressCount: number;
      resources: { id: string; title: string; fileUrl: string; fileType: string | null }[];
    }[];
  }[];
}

export async function getCourseContent(courseId: string): Promise<CourseContent | null> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, slug: true, status: true },
  });
  if (!course) return null;

  const modules = await db.module.findMany({
    where: { courseId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { lessons: true, assignments: true, quizzes: true } },
      lessons: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        include: {
          resources: { orderBy: { createdAt: "asc" } },
          _count: { select: { progress: true } },
        },
      },
    },
  });

  return {
    course,
    modules: modules.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      order: m.order,
      lessonCount: m._count.lessons,
      assignmentCount: m._count.assignments,
      quizCount: m._count.quizzes,
      lessons: m.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        content: l.content,
        videoUrl: l.videoUrl,
        duration: l.duration,
        order: l.order,
        isPublished: l.isPublished,
        progressCount: l._count.progress,
        resources: l.resources.map((r) => ({ id: r.id, title: r.title, fileUrl: r.fileUrl, fileType: r.fileType })),
      })),
    })),
  };
}
