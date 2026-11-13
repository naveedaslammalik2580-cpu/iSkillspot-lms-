"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { fetchNotificationSummary, markAllNotificationsRead, markNotificationRead, type NotificationSummaryDTO } from "@/lib/actions/notifications";
import { cn } from "@/lib/utils";

const POLL_MS = 45_000;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationBell({ initial, notificationsPath }: { initial: NotificationSummaryDTO; notificationsPath: string }) {
  const router = useRouter();
  const [summary, setSummary] = useState<NotificationSummaryDTO>(initial);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setSummary(await fetchNotificationSummary());
    } catch {
      // Session expired or network hiccup: keep showing the last known state.
    }
  }, []);

  // Lightweight polling that pauses while the tab is hidden.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Close on Escape / outside click.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open ]);

  const unread = summary.unreadCount;

  async function onItemClick(id: string, linkUrl: string | null) {
    setSummary((s) => ({
      unreadCount: Math.max(0, s.unreadCount - (s.recent.find((n) => n.id === id && !n.read) ? 1 : 0)),
      recent: s.recent.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
    void markNotificationRead(id);
    setOpen(false);
    if (linkUrl) router.push(linkUrl);
  }

  async function onMarkAll() {
    setSummary((s) => ({ unreadCount: 0, recent: s.recent.map((n) => ({ ...n, read: true })) }));
    await markAllNotificationsRead();
    void refresh();
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void refresh();
        }}
        className="relative rounded-md p-2 text-muted-foreground hover:bg-muted"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-lg sm:w-96" role="menu" aria-label="Recent notifications">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            <button
              type="button"
              onClick={onMarkAll}
              disabled={unread === 0}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all as read
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {summary.recent.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up. No notifications yet.</p>
            ) : (
              summary.recent.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  role="menuitem"
                  onClick={() => onItemClick(n.id, n.linkUrl)}
                  className={cn("block w-full border-b border-border/60 px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/50", !n.read && "bg-primary/5")}
                >
                  <span className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                    <span className="min-w-0">
                      <span className={cn("block truncate text-sm", !n.read ? "font-semibold" : "font-medium")}>{n.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.message}</span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>

          <Link href={notificationsPath} onClick={() => setOpen(false)} className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-muted/50">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
