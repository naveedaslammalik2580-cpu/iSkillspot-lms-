import { GraduationCap } from "lucide-react";
import { verifyPasswordResetToken } from "@/lib/auth/password-reset";
import { ResetPasswordForm, InvalidResetLink } from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = token ? await verifyPasswordResetToken(token) : null;

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
          {valid && token ? <ResetPasswordForm token={token} /> : <InvalidResetLink />}
        </div>
      </div>
    </div>
  );
}
