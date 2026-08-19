"use client";
import { useActionState } from "react";
import { changePasswordAction, type ActionState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: ActionState = {};

export function ChangePasswordForm({ forced }: { forced?: boolean }) {
  const [state, action, pending] = useActionState(changePasswordAction, initial);
  return (
    <div className="mx-auto mt-16 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
      <h1 className="mb-1 text-lg font-semibold">Change your password</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {forced ? "You must set a new password before continuing." : "Update your account password."}
      </p>
      <form action={action} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Current password</Label>
          <Input id="currentPassword" name="currentPassword" type="password" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPassword">New password</Label>
          <Input id="newPassword" name="newPassword" type="password" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input id="confirmPassword" name="confirmPassword" type="password" required />
        </div>
        {state.error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </div>
  );
}
