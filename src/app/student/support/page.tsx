import Link from "next/link";
import { requireStudentSelf } from "@/lib/auth/guards";
import { getMyTickets, getSupportContact } from "@/lib/data/support";
import { supportCategoryLabel } from "@/lib/support";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { SupportContactCard } from "@/components/support/contact-card";
import { TicketForm } from "@/components/support/ticket-form";
import { formatDate } from "@/lib/utils";

export default async function StudentSupportPage() {
  const { student } = await requireStudentSelf();
  const [contact, tickets] = await Promise.all([getSupportContact(), getMyTickets(student.id)]);

  return (
    <>
      <PageHeader title="Help & Support" description="Ask the admin team for help — replies land right here" />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <SupportContactCard contact={contact} />
        <TicketForm />
      </div>

      <Card>
        <CardHeader><CardTitle>My requests</CardTitle></CardHeader>
        <CardContent className="p-0">
          {tickets.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No support requests yet." hint="When you ask for help, your requests and the replies will appear here." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Subject</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Last updated</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link href={`/student/support/${t.id}`} className="font-medium text-primary hover:underline">
                          {t.subject}
                        </Link>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t.messageCount} message{t.messageCount === 1 ? "" : "s"}
                        </span>
                      </td>
                      <td className="px-4 py-3">{supportCategoryLabel(t.category)}</td>
                      <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(t.lastMessageAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
