"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type NotificationItemDTO = {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
  linkUrl: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  LESSON: "Lesson",
  ASSIGNMENT: "Assignment",
  QUIZ: "Quiz",
  ATTENDANCE: "Attendance",
  ANNOUNCEMENT: "Announcement",
  CERTIFICATE: "Certificate",
  FEE: "Fee",
  SYSTEM: "System",
};

export function MarkAllReadButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true);
        await markAllNotificationsRead();
        setBusy(false);
        router.refresh();
      }}
    >
      <CheckCheck className="mr-1.5 h-4 w-4" /> Mark all as read
    </Button>
  );
}

export function NotificationList({ initialItems }: { initialItems: NotificationItemDTO[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);

  async function onItemClick(item: NotificationItemDTO) {
    if (!item.read) {
      setItems((xs) => xs.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      void markNotificationRead(item.id);
    }
    if (item.linkUrl) router.push(item.linkUrl);
    else router.refresh();
  }

  return (
    <div className="space-y-3">
      {items.map((n) => (
        <button key={n.id} type="button" onClick={() => onItemClick(n)} className="block w-full text-left">
          <Card className={cn("p-4 transition-colors hover:bg-muted/40", !n.read && "border-primary/40 bg-primary/5")}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                <div className="min-w-0">
                  <p className={cn("text-sm", !n.read ? "font-semibold" : "font-medium")}>{n.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge variant="neutral">{TYPE_LABELS[n.type] ?? n.type}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(n.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
            </div>
          </Card>
        </button>
      ))}
    </div>
  );
}
