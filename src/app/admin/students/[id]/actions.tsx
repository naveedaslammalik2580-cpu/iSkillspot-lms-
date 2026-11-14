"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { resetStudentPasswordAction, sendStudentResetLinkAction, toggleStudentAccountAction } from "@/lib/actions/students";
import { SendResetLinkButton } from "@/components/auth/send-reset-link-button";
import { KeyRound, Power } from "lucide-react";

export function StudentActions({
  studentId,
  accountStatus,
}: {
  studentId: string;
  accountStatus: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isActive = accountStatus === "ACTIVE";

  async function reset() {
    setBusy(true);
    const res = await resetStudentPasswordAction(studentId);
    setBusy(false);
    if (res.ok && "tempPassword" in res) setTempPassword(res.tempPassword!);
  }

  async function toggle() {
    setBusy(true);
    await toggleStudentAccountAction(studentId, !isActive);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={reset} disabled={busy}>
          <KeyRound className="h-4 w-4" /> Reset password
        </Button>
        <Button variant={isActive ? "destructive" : "default"} size="sm" onClick={toggle} disabled={busy}>
          <Power className="h-4 w-4" /> {isActive ? "Deactivate" : "Activate"}
        </Button>
        <SendResetLinkButton onSend={() => sendStudentResetLinkAction(studentId)} />
      </div>
      {tempPassword && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs">
          New temporary password: <strong className="font-mono">{tempPassword}</strong>
        </p>
      )}
    </div>
  );
}
