import { requireSession } from "@/lib/auth/guards";
import { ChangePasswordForm } from "@/app/change-password/form";

export default async function StudentChangePassword() {
  await requireSession();
  return <ChangePasswordForm />;
}
