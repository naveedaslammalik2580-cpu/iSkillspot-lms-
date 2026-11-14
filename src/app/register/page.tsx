import { admissionSettings } from "@/lib/admissions";
import { RegistrationForm } from "@/components/admissions/forms";
import { PublicShell } from "@/components/admissions/public-shell";
export const dynamic = "force-dynamic";
export default async function RegisterPage() {
  const settings = await admissionSettings();
  return (
    <PublicShell title="Start your learning journey">
      {settings.open ? (
        <RegistrationForm />
      ) : (
        <p>
          Public admissions are currently closed. Contact the institute for
          assistance.
        </p>
      )}
    </PublicShell>
  );
}
