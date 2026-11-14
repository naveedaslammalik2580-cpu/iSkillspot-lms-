import Link from "next/link";
import type { AdmissionStatus, Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
export default async function AdmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requireStaff();
  const params = await searchParams,
    q = params.q?.trim().slice(0, 120) || "";
  const statuses = [
    "DRAFT",
    "PENDING",
    "INFORMATION_REQUESTED",
    "APPROVED",
    "REJECTED",
  ];
  const where: Prisma.AdmissionWhereInput = {
    ...(statuses.includes(params.status || "")
      ? { status: params.status as AdmissionStatus }
      : {}),
    ...(q
      ? {
          OR: [
            { applicationId: { contains: q, mode: "insensitive" } },
            { user: { email: { contains: q, mode: "insensitive" } } },
            {
              user: {
                student: { fullName: { contains: q, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  };
  const [counts, total] = await Promise.all([
    db.admission.groupBy({ by: ["status"], _count: true }),
    db.admission.count({ where }),
  ]);
  const page = Math.min(
    Math.max(1, Math.floor(Number(params.page)) || 1),
    Math.max(1, Math.ceil(total / 30)),
  );
  const apps = await db.admission.findMany({
    where,
    include: {
      user: {
        select: {
          email: true,
          emailVerifiedAt: true,
          student: { select: { fullName: true } },
        },
      },
      course: { select: { title: true } },
      payment: { select: { amount: true, voidedAt: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * 30,
    take: 30,
  });
  const count = (...s: string[]) =>
    counts
      .filter((c) => s.includes(c.status))
      .reduce((sum, c) => sum + c._count, 0);
  return (
    <>
      <PageHeader
        title="Admissions"
        description="Review applications and verify actual payments before approval."
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Total applications", counts.reduce((n, c) => n + c._count, 0)],
          [
            "Pending applications",
            count("DRAFT", "PENDING", "INFORMATION_REQUESTED"),
          ],
          ["Approved applications", count("APPROVED")],
          ["Rejected applications", count("REJECTED")],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      <form className="mb-5 flex flex-wrap gap-3">
        <input
          aria-label="Search applications"
          name="q"
          defaultValue={q}
          placeholder="Name, email or application ID"
          className="h-10 min-w-0 flex-1 rounded border bg-background px-3 text-sm"
        />
        <select
          aria-label="Filter admission status"
          name="status"
          defaultValue={params.status || ""}
          className="rounded border bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <Button>Search</Button>
      </form>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              {[
                "Application",
                "Student",
                "Course",
                "Email",
                "Applied",
                "Payment",
                "Status",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/admissions/${a.id}`}
                    className="font-mono text-xs text-primary underline"
                  >
                    {a.applicationId}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {a.user.student?.fullName}
                  <span className="block text-xs text-muted-foreground">
                    {a.user.email}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {a.course?.title || "Not selected"}
                </td>
                <td className="px-4 py-3">
                  {a.user.emailVerifiedAt ? "Verified" : "Unverified"}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {a.createdAt.toLocaleDateString("en-GB", {
                    timeZone: "Asia/Karachi",
                  })}
                </td>
                <td className="px-4 py-3">
                  {a.payment
                    ? a.payment.voidedAt
                      ? "Voided"
                      : "Verified"
                    : a.status === "APPROVED"
                      ? "No payment required"
                      : "Unverified"}
                </td>
                <td className="px-4 py-3">{a.status.replaceAll("_", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!apps.length && (
          <p className="p-6 text-sm text-muted-foreground">
            No applications found.
          </p>
        )}
      </div>
      <div className="mt-4 flex gap-4 text-sm">
        <span>
          {total} results · Page {page}
        </span>
        {page > 1 && (
          <Link
            href={`?${new URLSearchParams({ q, status: params.status || "", page: String(page - 1) })}`}
          >
            Previous
          </Link>
        )}
        {page * 30 < total && (
          <Link
            href={`?${new URLSearchParams({ q, status: params.status || "", page: String(page + 1) })}`}
          >
            Next
          </Link>
        )}
      </div>
    </>
  );
}
