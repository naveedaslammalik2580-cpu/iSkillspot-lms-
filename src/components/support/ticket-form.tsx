"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTicket } from "@/lib/actions/support";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_BODY_MAX,
  SUPPORT_SUBJECT_MAX,
} from "@/lib/support";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SupportCategory } from "@prisma/client";

export function TicketForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await createTicket({
      category: String(fd.get("category") || "OTHER") as SupportCategory,
      subject: String(fd.get("subject") || ""),
      message: String(fd.get("message") || ""),
    });
    setPending(false);
    if (res.ok && res.ticketId) {
      router.push(`/student/support/${res.ticketId}`);
      router.refresh();
    } else if (!res.ok) {
      setError(res.error);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Ask for help</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <select
              id="category"
              name="category"
              defaultValue="OTHER"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {SUPPORT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{SUPPORT_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" name="subject" required maxLength={SUPPORT_SUBJECT_MAX} placeholder="Briefly, what is the issue?" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <textarea
              id="message"
              name="message"
              required
              rows={5}
              maxLength={SUPPORT_BODY_MAX}
              placeholder="Describe your issue in detail…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send to support"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
