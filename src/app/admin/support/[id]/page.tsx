import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/guards";
import { getTicketThreadForAdmin } from "@/lib/data/support";
import { supportCategoryLabel } from "@/lib/support";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { ThreadMessages } from "@/components/support/thread-messages";
import { ReplyForm } from "@/components/support/reply-form";
import { TicketStatusButton } from "@/components/support/ticket-status-button";
import { ArrowLeft } from "lucide-react";

export default async function AdminSupportTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const ticket = await getTicketThreadForAdmin(id);
  if (!ticket) notFound();

  const closed = ticket.status === "CLOSED";

  return (
    <>
      <PageHeader
        title={ticket.subject}
        description={`${supportCategoryLabel(ticket.category)} · ${ticket.student.fullName}`}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={ticket.status} />
            <TicketStatusButton ticketId={ticket.id} status={ticket.status} portal="admin" />
          </div>
        }
      />

      <Button asChild variant="ghost" className="mb-4 px-0">
        <Link href="/admin/support"><ArrowLeft className="h-4 w-4" /> Support inbox</Link>
      </Button>

      <Card className="mb-6">
        <CardContent className="grid gap-2 p-6 text-sm sm:grid-cols-2">
          <p><span className="text-muted-foreground">Student: </span><span className="font-medium">{ticket.student.fullName}</span></p>
          <p><span className="text-muted-foreground">Student ID: </span><span className="font-medium">{ticket.student.studentCode}</span></p>
          <p><span className="text-muted-foreground">Email: </span><span className="font-medium">{ticket.student.email ?? "—"}</span></p>
          <p><span className="text-muted-foreground">Phone / WhatsApp: </span><span className="font-medium">{ticket.student.whatsapp ?? ticket.student.phone ?? "—"}</span></p>
        </CardContent>
      </Card>

      {closed && (
        <div className="mb-6 rounded-lg border border-border bg-muted/50 p-4 text-sm">
          This ticket is <strong>closed</strong>. Replying (by you or the student) will reopen it.
        </div>
      )}

      <Card className="mb-6">
        <CardContent className="p-6">
          <ThreadMessages messages={ticket.messages} viewerSide="staff" studentName={ticket.student.fullName} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Reply</CardTitle></CardHeader>
        <CardContent>
          <ReplyForm ticketId={ticket.id} portal="admin" closed={closed} />
        </CardContent>
      </Card>
    </>
  );
}
