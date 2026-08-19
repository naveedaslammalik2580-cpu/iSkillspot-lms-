"use client";

import { useState } from "react";
import { resetTeacherPassword } from "@/lib/actions/teachers";
import { Button } from "@/components/ui/button";
import { KeyRound, Copy } from "lucide-react";

export function ResetPasswordButton({ teacherId }: { teacherId: string }) {
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (!window.confirm("Reset this teacher's password? Their current password will stop working.")) return;
    setBusy(true);
    setError(null);
    const res = await resetTeacherPassword(teacherId);
    setBusy(false);
    if (res.ok) setTempPassword(res.tempPassword);
    else setError(res.error);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button variant="outline" size="sm" onClick={onClick} disabled={busy}>
        <KeyRound className="h-4 w-4" /> {busy ? "Resetting…" : "Reset password"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {tempPassword && (
        <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs">
          New temporary password: <strong className="font-mono">{tempPassword}</strong>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(tempPassword)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Copy password"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
