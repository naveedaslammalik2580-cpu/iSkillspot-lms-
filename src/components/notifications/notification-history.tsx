import Link from "next/link";
import { getNotificationsPage } from "@/lib/data/notifications";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { NotificationList, MarkAllReadButton } from "@/components/notifications/notification-list";

/**
 * Shared notification history for all roles. The userId always comes from
 * the caller's server-side session, so a user can only ever see their own
 * notifications. `children` renders below the list (preferences, push
 * controls) — supplied by the role page.
 */
export async function NotificationHistory({
  userId,
  basePath,
  searchParams,
  children,
}: {
  userId: string;
  basePath: string;
  searchParams: { page?: string; filter?: string };
  children?: React.ReactNode;
}) {
  const unreadOnly = searchParams.filter === "unread";
  const page = Number.parseInt(searchParams.page ?? "1", 10) || 1;
  const data = await getNotificationsPage(userId, { page, unreadOnly, pageSize: 20 });
  const base = `${basePath}/notifications`;

  const pageHref = (p: number) => `${base}?page=${p}${unreadOnly ? "&filter=unread" : ""}`;

  return (
    <>
      <PageHeader
        title="Notifications"
        description={data.unreadCount > 0 ? `${data.unreadCount} unread` : "You're all caught up"}
        action={<MarkAllReadButton disabled={data.unreadCount === 0} />}
      />

      <div className="mb-4 flex gap-2">
        <Link href={base}>
          <Button variant={unreadOnly ? "outline" : "default"} size="sm">
            All
          </Button>
        </Link>
        <Link href={`${base}?filter=unread`}>
          <Button variant={unreadOnly ? "default" : "outline"} size="sm">
            Unread
          </Button>
        </Link>
      </div>

      {data.rows.length === 0 ? (
        <EmptyState
          title={unreadOnly ? "No unread notifications." : "No notifications yet."}
          hint={unreadOnly ? "Everything has been read." : "Announcements, assignments, fees and certificates will show up here."}
        />
      ) : (
        <>
          <NotificationList
            initialItems={data.rows.map((n) => ({
              id: n.id,
              title: n.title,
              message: n.message,
              type: n.type,
              read: n.read,
              createdAt: n.createdAt.toISOString(),
              linkUrl: n.linkUrl,
            }))}
          />
          {data.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Page {data.page} of {data.totalPages} · {data.total} total
              </span>
              <div className="flex gap-2">
                {data.page > 1 && (
                  <Link href={pageHref(data.page - 1)}>
                    <Button variant="outline" size="sm">
                      Previous
                    </Button>
                  </Link>
                )}
                {data.page < data.totalPages && (
                  <Link href={pageHref(data.page + 1)}>
                    <Button variant="outline" size="sm">
                      Next
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {children}
    </>
  );
}
