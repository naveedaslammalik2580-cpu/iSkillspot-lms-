import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { getCoursesWithDefaultFee } from "@/lib/data/fees";
import { getAllStudentsForPicker } from "@/lib/data/attendance-reports";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FeeForm } from "@/components/fees/fee-form";

export default async function NewFeePage() {
  await requirePermission("fee.manage");

  const [students, courses] = await Promise.all([
    getAllStudentsForPicker(),
    getCoursesWithDefaultFee(),
  ]);

  if (students.length === 0 || courses.length === 0) {
    return (
      <>
        <PageHeader title="New fee" description="Create a fee record for a student" />
        <EmptyState
          title="Nothing to bill yet"
          hint={
            students.length === 0
              ? "Add at least one student before creating a fee."
              : "Add at least one active course before creating a fee."
          }
          action={
            <Button asChild variant="outline">
              <Link href={students.length === 0 ? "/admin/students/new" : "/admin/courses/new"}>
                {students.length === 0 ? "Add student" : "Add course"}
              </Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="New fee" description="Create a fee record for a student" />

      <Card className="mb-6">
        <CardHeader><CardTitle>How this works</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>Pick a student and course, then set the amount owed. If the course has a default fee configured, the amount field will auto-fill when you select it — you can still override it.</p>
          <p>A discount is optional and only affects the recorded total; the amount you enter is always what the student actually owes.</p>
        </CardContent>
      </Card>

      <FeeForm students={students} courses={courses} />
    </>
  );
}
