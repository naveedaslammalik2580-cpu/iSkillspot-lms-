import { ActionForm, EmailRequestForm } from "@/components/admissions/forms";
import { PublicShell } from "@/components/admissions/public-shell";
import { verifyEmailAction } from "@/lib/actions/admissions";
export const metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <PublicShell title="Verify your email">
      <ActionForm action={verifyEmailAction} label="Verify email and continue">
        <input type="hidden" name="token" value={token || ""} />
        <p className="text-sm text-muted-foreground">
          Confirm your email to continue your student application. This link
          expires after 60 minutes.
        </p>
      </ActionForm>
      <details className="mt-6 text-sm">
        <summary className="mb-4 cursor-pointer text-primary">
          Need a new verification link?
        </summary>
        <EmailRequestForm />
      </details>
    </PublicShell>
  );
}
