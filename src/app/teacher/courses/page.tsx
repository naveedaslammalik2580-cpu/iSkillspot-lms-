import Link from "next/link";
import { BookOpen, ClipboardList, Layers, PenLine, Users } from "lucide-react";
import { requireTeacherSelf } from "@/lib/auth/guards";
import { getTeacherCourses } from "@/lib/data/learning";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function TeacherCoursesPage() {
  const { teacher } = await requireTeacherSelf();
  const courses = await getTeacherCourses(teacher.id);

  return (
    <>
      <PageHeader title="My Courses" description="Courses and batches assigned to you" />
      {courses.length === 0 ? (
        <EmptyState
          title="No courses assigned yet."
          hint="When the institute assigns you to a batch, its course will appear here with its students and content."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((c) => (
            <Card key={c.courseId} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">{c.title}</CardTitle>
                  <Badge variant="neutral" className="shrink-0 capitalize">
                    {c.status.toLowerCase()}
                  </Badge>
                </div>
                {c.description ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                ) : null}
              </CardHeader>
              <CardContent className="flex-1 space-y-3 text-sm">
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Layers className="h-4 w-4" /> {c.moduleCount} modules · {c.lessonCount} lessons
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-4 w-4" /> {c.studentCount} active students
                  </span>
                </div>
                <ul className="space-y-1">
                  {c.batches.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
                      <span className="font-medium">
                        {b.name} <span className="text-muted-foreground">({b.code})</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {b.studentCount} students · {b.status.toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href={`/teacher/courses/${c.courseId}`}>
                    <BookOpen className="h-4 w-4" /> View content
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/teacher/courses/${c.courseId}/content`}>
                    <PenLine className="h-4 w-4" /> Manage content
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/teacher/attendance">
                    <ClipboardList className="h-4 w-4" /> Attendance
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
