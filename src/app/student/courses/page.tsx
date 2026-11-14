import Link from "next/link";
import { BookOpen, Clock, Layers, User } from "lucide-react";
import { requireStudentSelf } from "@/lib/auth/guards";
import { getStudentCourses } from "@/lib/data/learning";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/learning/progress-bar";
import { formatDate } from "@/lib/utils";

export default async function StudentCoursesPage() {
  const { student } = await requireStudentSelf();
  const courses = await getStudentCourses(student.id);

  return (
    <>
      <PageHeader title="My Courses" description="Courses you are enrolled in" />
      {courses.length === 0 ? (
        <EmptyState
          title="You are not enrolled in any course yet."
          hint="Once the institute enrolls you in a course and batch, it will appear here with your lessons and progress."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((c) => (
            <Card key={c.courseId} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">{c.title}</CardTitle>
                  <Badge variant="neutral" className="shrink-0 capitalize">
                    {c.level.toLowerCase()}
                  </Badge>
                </div>
                {c.description ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                ) : null}
              </CardHeader>
              <CardContent className="flex-1 space-y-3 text-sm">
                <div className="space-y-1.5 text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <Layers className="h-4 w-4 shrink-0" />
                    Batch {c.batchName} ({c.batchCode})
                  </p>
                  {c.teacherName ? (
                    <p className="flex items-center gap-2">
                      <User className="h-4 w-4 shrink-0" />
                      Teacher: {c.teacherName}
                    </p>
                  ) : null}
                  {c.duration ? (
                    <p className="flex items-center gap-2">
                      <Clock className="h-4 w-4 shrink-0" />
                      {c.duration}
                    </p>
                  ) : null}
                  <p className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 shrink-0" />
                    Enrolled {formatDate(c.enrollmentDate)} · {c.enrollmentStatus.toLowerCase()}
                  </p>
                </div>
                <ProgressBar
                  percent={c.progress.percent}
                  completed={c.progress.completedLessons}
                  total={c.progress.totalLessons}
                />
              </CardContent>
              <CardFooter>
                <Button asChild className="w-full">
                  <Link href={`/student/courses/${c.courseId}`}>View Course</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
