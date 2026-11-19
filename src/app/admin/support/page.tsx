import Link from "next/link";
import { requireStaff } from "@/lib/auth/guards";
import { getSupportInbox, getSupportStatusCounts } from "@/lib/data/support";
import { supportCategoryLabel } from "@/lib/support";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { SupportTicketStatus } from "@prisma/client";

const TABS: { key: string; label: string; status?: SupportTicketStatus }[] = [
  { key: "ALL", label: "All" },
  { key: "OPEN", label: "Open", status: "OPEN" },
  { key: "ANSWERED", label: "Answered", status: "ANSWERED" },
  { key: "CLOSED", label: "Closed", status: "CLOSED" },
];

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff();
  const sp = await searchParams;
  const activeTab = TABS.find((t) => t.key === sp.status) ?? TABS[0];

  const [tickets, counts] = await Promise.all([
    getSupportInbox(activeTab.status),
    getSupportStatusCounts(),
  ]);

  return (
    <>
      <PageHeader title="Support" description="Student help requests — newest activity first" />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.status ? `/admin/support?status=${tab.status}` : "/admin/support"}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium",
              activeTab.key === tab.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background hover:bg-muted"
            )}
          >
            {tab.label} ({counts[tab.key as keyof typeof counts]})
          </Link>
        ))}
      </div>

      {tickets.length === 0 ? (
        <EmptyState
          title={activeTab.status ? `No ${activeTab.label.toLowerCase()} tickets.` : "No support tickets yet."}
          hint="When a student asks for help from their Help & Support page, it will appear here."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Last message</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/support/${t.id}`} className="font-medium text-primary hover:underline">
                        {t.subject}
                      </Link>
                      {t.lastMessagePreview && (
                        <p className="mt-0.5 line-clamp-1 max-w-md text-xs text-muted-foreground">{t.lastMessagePreview}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.studentName}
                      <span className="block text-xs text-muted-foreground">{t.studentCode}</span>
                    </td>
                    <td className="px-4 py-3">{supportCategoryLabel(t.category)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(t.lastMessageAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
