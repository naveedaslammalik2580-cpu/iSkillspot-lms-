"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

type SendResult = { ok: true } | { ok: false; error: string };

/**
 * "Email reset link" — the preferred staff recovery action. The server
 * action enforces the role hierarchy; this button only renders the
 * outcome (sent / why not). No credential is ever shown to staff.
 */
export function SendResetLinkButton({
  onSend,
}: {
  onSend: () => Promise<SendResult>;
}) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    setSent(false);
    const res = await onSend();
    setBusy(false);
    if (res.ok) setSent(true);
    else setError(res.error);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={busy}
      >
        <Mail className="h-4 w-4" /> {busy ? "Queuing…" : "Email reset link"}
      </Button>
      {sent && (
        <p role="status" className="text-xs text-muted-foreground">
          Reset link queued for the account&rsquo;s email.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
