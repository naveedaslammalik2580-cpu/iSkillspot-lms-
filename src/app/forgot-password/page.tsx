"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, type RecoveryState } from "@/lib/actions/password-recovery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap, MailCheck } from "lucide-react";

const initial: RecoveryState = {};

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initial);
  // Controlled so a validation error doesn't wipe the typed email
  // (React resets uncontrolled fields after an action round-trip).
  const [email, setEmail] = useState("");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-accent to-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">iSkillSpot</h1>
          <p className="text-sm text-muted-foreground">Learning Management System</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          {state.ok ? (
            <div className="text-center">
              <MailCheck className="mx-auto h-10 w-10 text-primary" />
              <h2 className="mt-3 text-lg font-semibold">Check your email</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                If an account exists for that email address, we have sent a password
                reset link. The link expires in 30 minutes and can be used once.
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                Nothing arrived? Check your spam folder, or ask your institute&rsquo;s
                administrator to send you a reset link.
              </p>
              <Button asChild className="mt-6 w-full">
                <Link href="/login">Back to sign in</Link>
              </Button>
            </div>
          ) : (
            <>
              <h2 className="mb-1 text-lg font-semibold">Forgot your password?</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Enter the email address on your account and we will send you a link
                to choose a new password.
              </p>
              <form action={formAction} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {state.error && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {state.error}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Sending…" : "Send reset link"}
                </Button>
              </form>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Remembered it?{" "}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
