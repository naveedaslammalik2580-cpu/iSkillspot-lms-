import { EmailRequestForm } from "@/components/admissions/forms";
import { PublicShell } from "@/components/admissions/public-shell";
export default function ForgotPasswordPage() {
  return (
    <PublicShell title="Recover your account">
      <p className="mb-5 text-sm text-muted-foreground">
        Enter your registered email. We’ll send a secure recovery link if your
        account is eligible.
      </p>
      <EmailRequestForm purpose="RESET_PASSWORD" />
    </PublicShell>
  );
}
