import { requireSession } from "@/lib/auth/guards";
import { ChangePasswordForm } from "./form";

export default async function ChangePassword() {
  const session = await requireSession();
  return <ChangePasswordForm forced={session.mustChangePassword} />;
}
