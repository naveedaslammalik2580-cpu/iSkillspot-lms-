import { redirect } from "next/navigation";

// Agency model: students land on My Courses — there is no separate
// student dashboard anymore.
export default function StudentDashboardRedirect() {
  redirect("/student/courses");
}
