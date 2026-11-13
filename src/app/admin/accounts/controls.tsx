"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAdminAction, resetAccountAction, setAccountActiveAction, type AccountResult } from "@/lib/actions/accounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function TemporaryCredential({ value, dismiss }: { value: string; dismiss: () => void }) {
  return <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
    <p className="text-sm">Share privately. This temporary password expires in 24 hours and must be changed at first login.</p>
    <Input type="password" value={value} readOnly autoComplete="off" aria-label="One-time temporary password" />
    <div className="flex gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(value)}>Copy temporary password</Button>
      <Button type="button" size="sm" variant="ghost" onClick={dismiss}>Dismiss</Button>
    </div>
  </div>;
}

export function AccountControls({ userId, active }: { userId: string; active: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [temp, setTemp] = useState("");
  async function perform(reset: boolean) {
    if (!window.confirm(reset ? "Reset this password and sign out existing sessions?" : `${active ? "Deactivate" : "Activate"} this account and invalidate existing sessions?`)) return;
    setPending(true); setError(""); setTemp("");
    try {
      const result: AccountResult = reset ? await resetAccountAction(userId) : await setAccountActiveAction(userId, !active);
      if (result.ok) { setTemp(result.tempPassword ?? ""); router.refresh(); }
      else setError(result.error);
    } catch { setError("Unable to update account. Please try again."); }
    finally { setPending(false); }
  }
  return <div className="min-w-56 space-y-2">
    <div className="flex gap-2">
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => perform(true)}>Reset password</Button>
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => perform(false)}>{active ? "Deactivate" : "Activate"}</Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {temp && <TemporaryCredential value={temp} dismiss={() => setTemp("")} />}
  </div>;
}

export function CreateAdminForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true); setError("");
    try {
      const result = await createAdminAction({ username: String(data.get("username") ?? ""), email: String(data.get("email") ?? "") });
      if (result.ok && result.tempPassword && result.username) {
        setCreated({ username: result.username, password: result.tempPassword }); form.reset(); router.refresh();
      } else if (!result.ok) setError(result.error);
    } catch { setError("Unable to create administrator. Please try again."); }
    finally { setPending(false); }
  }
  return <div className="space-y-4">
    <h2 className="font-semibold">Create administrator</h2>
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-2"><Label htmlFor="admin-username">Username</Label><Input id="admin-username" name="username" minLength={3} maxLength={50} required autoComplete="off" /></div>
      <div className="space-y-2"><Label htmlFor="admin-email">Email</Label><Input id="admin-email" name="email" type="email" maxLength={254} required autoComplete="off" /></div>
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create ADMIN"}</Button>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {created && <div className="space-y-2"><p className="text-sm">Created username: <strong>{created.username}</strong></p><TemporaryCredential value={created.password} dismiss={() => setCreated(null)} /></div>}
  </div>;
}
