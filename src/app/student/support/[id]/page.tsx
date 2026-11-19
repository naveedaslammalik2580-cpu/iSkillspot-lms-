import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStudentSelf } from "@/lib/auth/guards";
import { getMyTicketThread } from "@/lib/data/support";
import { supportCategoryLabel } from "@/lib/support";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { ThreadMessages } from "@/components/support/thread-messages";
import { ReplyForm } from "@/components/support/reply-form";
import { TicketStatusButton } from "@/components/support/ticket-status-button";
import { ArrowLeft } from "lucide-react";

export default async function StudentSupportTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { student } = await requireStudentSelf();
  const { id } = await params;
  // Ownership is enforced in the data layer: another student's ticket
  // returns null here and 404s, exactly like a missing ticket.
  const ticket = await getMyTicketThread(student.id, id);
  if (!ticket) notFound();

  const closed = ticket.status === "CLOSED";

  return (
    <>
      <PageHeader
        title={ticket.subject}
        description={`${supportCategoryLabel(ticket.category)} · Opened by you`}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={ticket.status} />
            <TicketStatusButton ticketId={ticket.id} status={ticket.status} portal="student" />
          </div>
        }
      />

      <Button asChild variant="ghost" className="mb-4 px-0">
        <Link href="/student/support"><ArrowLeft className="h-4 w-4" /> All my requests</Link>
      </Button>

      {closed && (
        <div className="mb-6 rounded-lg border border-border bg-muted/50 p-4 text-sm">
          This ticket is <strong>closed</strong>. If your issue is back, reply below and it will reopen.
        </div>
      )}

      <Card className="mb-6">
        <CardContent className="p-6">
          <ThreadMessages messages={ticket.messages} viewerSide="student" studentName={ticket.student.fullName} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Reply</CardTitle></CardHeader>
        <CardContent>
          <ReplyForm ticketId={ticket.id} portal="student" closed={closed} />
        </CardContent>
      </Card>
    </>
  );
}
