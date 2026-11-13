import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { listAccounts } from "@/lib/data/accounts";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { AccountControls, CreateAdminForm } from "./controls";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requirePermission("account.manage");
  const sp = await searchParams;
  const result = await listAccounts(sp.q, Number(sp.page ?? 1));
  function href(page: number) { return `/admin/accounts?${new URLSearchParams({ q: sp.q ?? "", page: String(page) })}`; }
  function date(value: Date | null) { return value ? value.toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" }) : "Never"; }
  return <>
    <PageHeader title="User Accounts" description={`${result.total} accounts you can manage`} />
    <Card className="mb-4 flex flex-wrap gap-3 p-4">
      <Button asChild variant="outline"><Link href="/admin/teachers/new">Create teacher</Link></Button>
      <Button asChild variant="outline"><Link href="/admin/students/new">Create student</Link></Button>
    </Card>
    {session.role === "SUPER_ADMIN" && <Card className="mb-4 p-4"><CreateAdminForm /></Card>}
    <Card className="mb-4 p-4"><form method="GET" className="flex gap-3">
      <Input name="q" aria-label="Search accounts by username or email" defaultValue={sp.q ?? ""} placeholder="Username or email…" maxLength={254} />
      <Button type="submit" variant="outline">Search</Button>
    </form></Card>
    {!result.rows.length ? <EmptyState title="No accounts found." hint="Try another search or create a teacher, student or administrator as permitted." /> :
      <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground"><tr>
          {["Account", "Role", "Status", "Linked profile", "Created", "Last login", "Actions"].map(label => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}
        </tr></thead>
        <tbody>{result.rows.map(user => <tr key={user.id} className="border-b border-border last:border-0">
          <td className="px-4 py-3"><div className="font-medium">{user.username}</div><div className="text-xs text-muted-foreground">{user.email}</div>{user.mustChangePassword && <div className="text-xs text-muted-foreground">Password change required</div>}</td>
          <td className="px-4 py-3">{user.role}</td><td className="px-4 py-3"><StatusBadge status={user.status} /></td>
          <td className="px-4 py-3">{user.teacher ? <Link className="text-primary hover:underline" href={`/admin/teachers/${user.teacher.id}`}>{user.teacher.fullName}</Link> : user.student ? <Link className="text-primary hover:underline" href={`/admin/students/${user.student.id}`}>{user.student.fullName} ({user.student.studentId})</Link> : user.role === "ADMIN" ? "Administrator" : "Profile missing"}</td>
          <td className="whitespace-nowrap px-4 py-3">{date(user.createdAt)}</td><td className="whitespace-nowrap px-4 py-3">{date(user.lastLogin)}</td>
          <td className="px-4 py-3"><AccountControls userId={user.id} active={user.status === "ACTIVE"} /></td>
        </tr>)}</tbody>
      </table></div></Card>}
    <div className="mt-4 flex items-center gap-3 text-sm">
      {result.page > 1 && <Link className="text-primary hover:underline" href={href(result.page - 1)}>Previous</Link>}
      <span>Page {result.page} of {result.pages}</span>
      {result.page < result.pages && <Link className="text-primary hover:underline" href={href(result.page + 1)}>Next</Link>}
    </div>
  </>;
}
