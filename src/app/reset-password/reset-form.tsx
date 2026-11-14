"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction, type RecoveryState } from "@/lib/actions/password-recovery";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/password-input";
import { CheckCircle2 } from "lucide-react";

const initial: RecoveryState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initial);

  if (state.ok) {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
        <h2 className="mt-3 text-lg font-semibold">Password updated</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your password has been reset. For your security, all other sessions
          have been signed out.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link href="/login?reset=1">Sign in with your new password</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <h2 className="mb-1 text-lg font-semibold">Choose a new password</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Use at least 12 characters with uppercase, lowercase, a number and a symbol.
      </p>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div className="space-y-2">
          <Label htmlFor="newPassword">New password</Label>
          <PasswordInput
            id="newPassword"
            name="newPassword"
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            required
          />
        </div>
        {state.error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Updating…" : "Reset password"}
        </Button>
      </form>
    </>
  );
}

export function InvalidResetLink() {
  return (
    <div className="text-center">
      <h2 className="text-lg font-semibold">This reset link is not valid</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The link may have expired (links last 30 minutes), already been used, or
        been replaced by a newer reset request.
      </p>
      <Button asChild className="mt-6 w-full">
        <Link href="/forgot-password">Request a new reset link</Link>
      </Button>
      <p className="mt-4 text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
