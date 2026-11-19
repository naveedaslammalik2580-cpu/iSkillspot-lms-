"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { closeMyTicket, setTicketStatus } from "@/lib/actions/support";
import { Button } from "@/components/ui/button";
import type { SupportTicketStatus } from "@prisma/client";

/**
 * Close / reopen control for a ticket thread.
 * - Admin: Close when not closed, Reopen when closed (lands on OPEN).
 * - Student: Close own ticket when not closed (reopening happens by
 *   replying, per the status rules).
 */
export function TicketStatusButton({
  ticketId,
  status,
  portal,
}: {
  ticketId: string;
  status: SupportTicketStatus;
  portal: "student" | "admin";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "CLOSED" && portal === "student") return null;

  const label = status === "CLOSED" ? "Reopen ticket" : "Close ticket";

  async function onClick() {
    setPending(true);
    setError(null);
    const res = portal === "admin"
      ? await setTicketStatus({ ticketId, status: status === "CLOSED" ? "OPEN" : "CLOSED" })
      : await closeMyTicket({ ticketId });
    setPending(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="outline" onClick={onClick} disabled={pending}>
        {pending ? "Working…" : label}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </span>
  );
}
