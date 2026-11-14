import Link from "next/link";
import { requireSession } from "@/lib/auth/guards";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { admissionSettings } from "@/lib/admissions";
import { whatsappUrl } from "@/lib/admission-policy";
import { PublicShell } from "@/components/admissions/public-shell";
import { EmailRequestForm, Progress } from "@/components/admissions/forms";
import { CourseSelector } from "@/components/admissions/course-selector";
import { newApplicationAction } from "@/lib/actions/admissions";
import { logoutAction } from "@/lib/actions/auth";
import { Button, buttonVariants } from "@/components/ui/button";
export default async function AdmissionPage() {
  const session = await requireSession({ allowAdmission: true });
  if (session.role !== "STUDENT") redirect("/forbidden");
  const [user, settings] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: session.userId },
      include: {
        student: true,
        admissions: {
          include: { course: true, batch: true },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    admissionSettings(),
  ]);
  const app =
    user.admissions.find((a) =>
      ["DRAFT", "PENDING", "INFORMATION_REQUESTED"].includes(a.status),
    ) || user.admissions[0];
  const step = !user.emailVerifiedAt
    ? 2
    : !app?.courseId || app.status === "INFORMATION_REQUESTED"
      ? 3
      : 4;
  const courses =
    step === 3 && settings.open
      ? await db.course.findMany({
          where: {
            status: "PUBLISHED",
            admissionsOpen: true,
            defaultFee: { not: null },
            admissionPayment: { not: null },
          },
          select: {
            id: true,
            title: true,
            defaultFee: true,
            admissionPayment: true,
            batches: {
              where: { status: { in: ["UPCOMING", "ONGOING"] } },
              select: { id: true, name: true, schedule: true },
            },
          },
          orderBy: { title: "asc" },
        })
      : [];
  const whatsapp = whatsappUrl(
    settings.whatsapp,
    user.student?.fullName || "student",
    app?.applicationId || "",
    app?.course?.title || "Not selected",
  );
  return (
    <PublicShell title="Your admission">
      <Progress step={step} />
      <div className="space-y-6">
        {user.admissionRequired && (
          <p className="rounded-lg bg-primary/5 p-4 text-sm">
            Your account has been created. Your admission is awaiting payment
            verification and admin approval.
          </p>
        )}
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <dt className="text-muted-foreground">Application ID</dt>
          <dd className="break-all font-mono">
            {app?.applicationId || "No application"}
          </dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd>{user.emailVerifiedAt ? "Verified" : "Verification required"}</dd>
          <dt className="text-muted-foreground">Course</dt>
          <dd>{app?.course?.title || "Select after verification"}</dd>
          <dt className="text-muted-foreground">Admission status</dt>
          <dd>{app?.status.replaceAll("_", " ") || "—"}</dd>
          {app?.batch && (
            <>
              <dt className="text-muted-foreground">Batch</dt>
              <dd>{app.batch.name}</dd>
            </>
          )}
        </dl>
        {app?.reviewNote && (
          <p role="status" className="rounded-lg border p-4 text-sm">
            {app.reviewNote}
          </p>
        )}
        {!user.emailVerifiedAt ? (
          <EmailRequestForm email={user.email} />
        ) : app && ["DRAFT", "INFORMATION_REQUESTED"].includes(app.status) ? (
          settings.open ? (
            <CourseSelector
              id={app.id}
              courses={courses}
              currency={settings.currency}
            />
          ) : (
            <p>Admissions are currently closed.</p>
          )
        ) : null}
        {app?.course && app.status !== "APPROVED" && (
          <section className="space-y-4 border-t pt-5">
            <h2 className="text-lg font-semibold">Payment instructions</h2>
            <p className="text-sm">
              Total course fee:{" "}
              <strong>
                {settings.currency} {app.totalFee?.toLocaleString()}
              </strong>
              <br />
              Required admission payment:{" "}
              <strong>
                {settings.currency} {app.requiredPayment?.toLocaleString()}
              </strong>
            </p>
            {settings.methods.map((m) => (
              <div key={m.name} className="rounded-lg bg-muted p-3 text-sm">
                <h3 className="font-semibold">{m.name}</h3>
                <p className="whitespace-pre-wrap break-words">{m.account}</p>
              </div>
            ))}
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {settings.instructions}
            </p>
            {whatsapp && (
              <a
                className={buttonVariants({
                  className: "h-auto w-full whitespace-normal py-3 text-center",
                })}
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
              >
                Send Payment Screenshot on WhatsApp
              </a>
            )}
            <p className="text-xs text-muted-foreground">
              Attach the screenshot yourself in WhatsApp. Your admission remains
              pending until the institute verifies the actual transaction and
              approves it.
            </p>
          </section>
        )}
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-primary underline"
          >
            Contact admin on WhatsApp · {settings.whatsapp}
          </a>
        )}
        {!user.admissionRequired && (
          <Link className={buttonVariants()} href="/student/dashboard">
            Open student dashboard
          </Link>
        )}
        {(!app || ["APPROVED", "REJECTED"].includes(app.status)) && (
          <form action={newApplicationAction}>
            <Button variant="outline">Apply for another course</Button>
          </form>
        )}
        <form action={logoutAction}>
          <Button variant="ghost">Logout</Button>
        </form>
      </div>
    </PublicShell>
  );
}
