"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { archiveAnnouncement } from "@/lib/actions/announcements";
import { Button } from "@/components/ui/button";
import { Archive } from "lucide-react";

export function ArchiveAnnouncementButton({ announcementId }: { announcementId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (!window.confirm("Archive this announcement? It will no longer be shown to its audience.")) return;
    setPending(true);
    setError(null);
    const res = await archiveAnnouncement(announcementId);
    setPending(false);
    if (res.ok) {
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" onClick={onClick} disabled={pending}>
        <Archive className="h-4 w-4" /> {pending ? "Archiving…" : "Archive"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
