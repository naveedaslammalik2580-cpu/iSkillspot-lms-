import { cn, formatDateTime } from "@/lib/utils";
import type { SupportThreadMessage } from "@/lib/data/support";

/**
 * Ticket thread, chat-style: the viewer's own side is right-aligned,
 * the other side left-aligned. `viewerSide` is "student" on the student
 * portal and "staff" on the admin portal.
 */
export function ThreadMessages({
  messages,
  viewerSide,
  studentName,
}: {
  messages: SupportThreadMessage[];
  viewerSide: "student" | "staff";
  studentName: string;
}) {
  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">No messages yet.</p>;
  }
  return (
    <div className="space-y-4">
      {messages.map((m) => {
        const own = m.side === viewerSide;
        return (
          <div key={m.id} className={cn("flex", own ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-4 py-3 sm:max-w-[75%]",
                own ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
            >
              <p className={cn("mb-1 text-xs font-medium", own ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {m.side === "student" ? studentName : `Support team (${m.authorName})`}
                {" · "}
                {formatDateTime(m.createdAt)}
              </p>
              <p className="whitespace-pre-wrap text-sm">{m.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
