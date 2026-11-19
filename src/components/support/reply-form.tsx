"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminReply, studentReply } from "@/lib/actions/support";
import { SUPPORT_BODY_MAX } from "@/lib/support";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function ReplyForm({
  ticketId,
  portal,
  closed,
}: {
  ticketId: string;
  portal: "student" | "admin";
  closed: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = portal === "student"
      ? await studentReply({ ticketId, body })
      : await adminReply({ ticketId, body });
    setPending(false);
    if (res.ok) {
      setBody("");
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="reply-body">Reply</Label>
        <textarea
          id="reply-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={4}
          maxLength={SUPPORT_BODY_MAX}
          placeholder="Write your reply…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      {closed && (
        <p className="text-sm text-muted-foreground">
          This ticket is closed — sending a reply will reopen it.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send reply"}</Button>
    </form>
  );
}
