"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { publishAnnouncement } from "@/lib/actions/announcements";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

export function PublishAnnouncementButton({ announcementId }: { announcementId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (!window.confirm("Publish this announcement now? It will become visible to its audience immediately.")) return;
    setPending(true);
    setError(null);
    const res = await publishAnnouncement(announcementId);
    setPending(false);
    if (res.ok) {
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={onClick} disabled={pending}>
        <Send className="h-4 w-4" /> {pending ? "Publishing…" : "Publish"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
