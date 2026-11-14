"use client";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passwordMeetsPolicy } from "@/lib/auth/password-policy";
import {
  registerStudentAction,
  requestAuthEmailAction,
  type AdmissionActionState,
} from "@/lib/actions/admissions";

export function ActionForm({
  action,
  children,
  label,
  className = "space-y-4",
}: {
  action: (
    state: AdmissionActionState,
    form: FormData,
  ) => Promise<AdmissionActionState>;
  children: React.ReactNode;
  label: string;
  className?: string;
}) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form action={submit} className={className}>
      <fieldset disabled={pending} className="min-w-0 space-y-4">
        {children}
      </fieldset>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm text-green-700">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Please wait…" : label}
      </Button>
    </form>
  );
}
export function PasswordFields() {
  const [show, setShow] = useState(false),
    [password, setPassword] = useState("");
  const strong = passwordMeetsPolicy(password);
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="password-strength"
            className="pr-12"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? "Hide passwords" : "Show passwords"}
            aria-pressed={show}
            className="absolute right-0 top-0 flex h-10 w-11 items-center justify-center"
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {password && (
          <div id="password-strength" aria-live="polite">
            <div
              className={`h-1 rounded-full ${strong ? "bg-green-600" : "bg-red-500"}`}
            />
            <p
              className={`mt-1 text-xs ${strong ? "text-green-700" : "text-red-600"}`}
            >
              {strong
                ? "Strong password"
                : "Use 12+ characters with mixed case, numbers and a symbol; avoid common words."}
            </p>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={72}
        />
      </div>
    </>
  );
}
export function EmailRequestForm({
  purpose = "VERIFY_EMAIL",
  email = "",
}: {
  purpose?: "VERIFY_EMAIL" | "RESET_PASSWORD";
  email?: string;
}) {
  const [state, submit, pending] = useActionState(requestAuthEmailAction, {}),
    [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  return (
    <form
      action={async (form) => {
        setCooldown(60);
        submit(form);
      }}
      className="space-y-4"
    >
      <input type="hidden" name="purpose" value={purpose} />
      <div className="space-y-2">
        <Label htmlFor="resend-email">Email address</Label>
        <Input
          id="resend-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={email}
        />
      </div>
      {state.message && (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button disabled={pending || cooldown > 0}>
        {cooldown
          ? `Try again in ${cooldown}s`
          : purpose === "RESET_PASSWORD"
            ? "Send recovery link"
            : "Resend verification email"}
      </Button>
    </form>
  );
}
export function RegistrationForm() {
  const [state, submit, pending] = useActionState(registerStudentAction, {}),
    [email, setEmail] = useState("");
  if (state.ok)
    return (
      <div className="space-y-6">
        <Progress step={2} />
        <h2 className="text-xl font-semibold">Check your inbox</h2>
        <p className="text-sm text-muted-foreground">{state.message}</p>
        <EmailRequestForm email={email} />
        <Link href="/login" className="block text-sm text-primary underline">
          Sign in to resume registration
        </Link>
      </div>
    );
  return (
    <form
      action={submit}
      className="space-y-4"
      onSubmit={(e) => {
        const form = new FormData(e.currentTarget);
        if (!passwordMeetsPolicy(String(form.get("password")))) {
          e.preventDefault();
          e.currentTarget.querySelector<HTMLInputElement>("#password")?.focus();
        } else if (form.get("password") !== form.get("confirmPassword")) {
          e.preventDefault();
          const input =
            e.currentTarget.querySelector<HTMLInputElement>("#confirmPassword");
          input?.setCustomValidity("Passwords do not match");
          input?.reportValidity();
        }
      }}
      onInput={(e) => {
        if ((e.target as HTMLInputElement).name === "confirmPassword")
          (e.target as HTMLInputElement).setCustomValidity("");
      }}
    >
      <Progress step={1} />
      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          minLength={2}
          maxLength={120}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone / WhatsApp number</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          maxLength={25}
          required
        />
      </div>
      <PasswordFields />
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Continue to email verification"}
      </Button>
    </form>
  );
}
export function Progress({ step }: { step: number }) {
  return (
    <ol
      aria-label="Registration progress"
      className="mb-6 grid grid-cols-4 gap-2"
    >
      {["Personal", "Verify email", "Course", "Payment"].map((name, i) => (
        <li
          key={name}
          aria-current={i + 1 === step ? "step" : undefined}
          className="text-center text-[11px] sm:text-xs"
        >
          <div
            className={`mb-2 h-1 rounded ${i + 1 <= step ? "bg-primary" : "bg-muted"}`}
          />
          {i + 1}. {name}
        </li>
      ))}
    </ol>
  );
}
