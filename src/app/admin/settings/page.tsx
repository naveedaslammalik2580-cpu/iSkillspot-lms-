import { requireRole } from "@/lib/auth/guards";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "./form";

// Settings are SUPER_ADMIN only.
export default async function SettingsPage() {
  await requireRole("SUPER_ADMIN");
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Settings" description="Institute configuration (Section 31)" />
      <SettingsForm settings={settings} />
    </>
  );
}
