import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth/guards";
import { PageHeader } from "@/components/page-header";
import { ReviewForm } from "@/components/admissions/admin-forms";
import { ActionForm } from "@/components/admissions/forms";
import {
  resendAdmissionAction,
  setEnrollmentAccessAction,
} from "@/lib/actions/admissions";
export default async function AdmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const app = await db.admission.findUnique({
    where: { id },
    include: {
      user: {
        include: {
          student: {
            include: {
              enrollments: { include: { course: true, batch: true } },
            },
          },
        },
      },
      course: true,
      batch: true,
      payment: true,
    },
  });
  if (!app) notFound();
  const [courses, emails] = await Promise.all([
    db.course.findMany({
      where: { status: "PUBLISHED", admissionsOpen: true },
      select: {
        id: true,
        title: true,
        defaultFee: true,
        admissionPayment: true,
        batches: {
          where: { status: { in: ["UPCOMING", "ONGOING"] } },
          select: { id: true, name: true },
        },
      },
    }),
    db.emailOutbox.findMany({
      where: { dedupeKey: { startsWith: `approved:${id}:` } },
      select: {
        id: true,
        status: true,
        attempts: true,
        sentAt: true,
        lastError: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);
  const student = app.user.student;
  return (
    <>
      <PageHeader title={app.applicationId} description="Admission review" />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-5 rounded-lg border bg-card p-5">
          <h2 className="text-lg font-semibold">Student information</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {Object.entries({
              Name: student?.fullName,
              Email: app.user.email,
              Phone: student?.phone,
              "Email verified": app.user.emailVerifiedAt ? "Yes" : "No",
              Course: app.course?.title,
              "Preferred batch": app.batch?.name,
              "Course fee": app.totalFee,
              "Required payment": app.requiredPayment,
              Status: app.status,
              "Application date": app.createdAt.toLocaleString("en-GB", {
                timeZone: "Asia/Karachi",
              }),
              "Payment verified": app.payment
                ? app.payment.voidedAt
                  ? "Voided"
                  : `Yes · ${app.payment.amount}`
                : "No",
              "Transaction reference": app.payment?.transactionReference,
            }).map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="break-words">{value ?? "—"}</dd>
              </div>
            ))}
          </dl>
          {app.reviewNote && <p className="text-sm">{app.reviewNote}</p>}
          {student && (
            <Link
              className="text-sm text-primary underline"
              href={`/admin/students/${student.id}`}
            >
              Open student record
            </Link>
          )}
          {student?.enrollments.map((e) => (
            <div key={e.id} className="border-t pt-4">
              <p className="mb-3 text-sm font-medium">
                {e.course.title} · {e.batch.name} ·{" "}
                {e.accessSuspended ? "Access suspended" : "Access enabled"}
              </p>
              <ActionForm
                action={setEnrollmentAccessAction}
                label={
                  e.accessSuspended
                    ? "Restore course access"
                    : "Suspend course access"
                }
              >
                <input type="hidden" name="id" value={e.id} />
                <input
                  type="hidden"
                  name="suspended"
                  value={String(!e.accessSuspended)}
                />
              </ActionForm>
            </div>
          ))}
        </section>
        <section className="space-y-5 rounded-lg border bg-card p-5">
          <h2 className="text-lg font-semibold">Admission decision</h2>
          {["PENDING", "INFORMATION_REQUESTED"].includes(app.status) ? (
            <ReviewForm
              id={id}
              courseId={app.courseId || ""}
              batchId={app.batchId || ""}
              courses={courses}
              total={app.totalFee || 0}
              minimum={app.requiredPayment || 0}
            />
          ) : (
            <p className="text-sm">
              {app.status === "DRAFT"
                ? "The student must verify their email and submit a course selection first."
                : `This application is ${app.status.toLowerCase()}.`}
            </p>
          )}
          {app.status === "APPROVED" && (
            <>
              <h3 className="font-semibold">Confirmation email</h3>
              {emails.map((e) => (
                <p key={e.id} className="text-sm">
                  {e.status === "SENT"
                    ? "Accepted by email provider"
                    : e.status}{" "}
                  · {e.attempts} attempt(s){e.lastError && ` · ${e.lastError}`}
                </p>
              ))}
              <ActionForm
                action={resendAdmissionAction}
                label="Resend admission confirmation"
              >
                <input type="hidden" name="id" value={id} />
              </ActionForm>
            </>
          )}
        </section>
      </div>
    </>
  );
}
