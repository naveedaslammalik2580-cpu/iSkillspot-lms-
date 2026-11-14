import { ActionForm, PasswordFields } from "@/components/admissions/forms";
import { PublicShell } from "@/components/admissions/public-shell";
import { resetPasswordAction } from "@/lib/actions/admissions";
export const metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <PublicShell title="Choose a new password">
      <ActionForm action={resetPasswordAction} label="Save new password">
        <input type="hidden" name="token" value={token || ""} />
        <PasswordFields />
      </ActionForm>
    </PublicShell>
  );
}
