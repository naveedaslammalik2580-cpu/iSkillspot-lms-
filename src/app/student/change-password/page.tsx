import { requireSession } from "@/lib/auth/guards";
import { ChangePasswordForm } from "@/app/change-password/form";

export default async function StudentChangePassword() {
  const session = await requireSession({ allowPasswordChange: true });
  return <ChangePasswordForm forced={session.mustChangePassword} />;
}
