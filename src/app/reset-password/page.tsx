import { PublicShell } from "@/components/admissions/public-shell";
import { verifyPasswordResetToken } from "@/lib/auth/password-reset";
import { ResetPasswordForm, InvalidResetLink } from "./reset-form";
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
  const valid = token ? await verifyPasswordResetToken(token) : null;
  return (
    <PublicShell title="Password recovery">
      {valid ? <ResetPasswordForm token={token!} /> : <InvalidResetLink />}
    </PublicShell>
  );
}
