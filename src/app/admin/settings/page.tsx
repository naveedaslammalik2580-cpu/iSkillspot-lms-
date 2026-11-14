import { requireRole } from "@/lib/auth/guards";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "./form";
import { admissionSettings } from "@/lib/admissions";
import { db } from "@/lib/db";
import { AdmissionSettingsForm } from "@/components/admissions/admin-forms";

// Settings are SUPER_ADMIN only.
export default async function SettingsPage() {
  await requireRole("SUPER_ADMIN");
  const settings = await getSettings();
  const admissions = await admissionSettings();
  const courses = await db.course.findMany({ select: { id: true, title: true, defaultFee: true, admissionPayment: true, admissionsOpen: true }, orderBy: { title: "asc" } });
  return (
    <>
      <PageHeader title="Settings" description="Institute configuration (Section 31)" />
      <SettingsForm settings={settings} />
      <AdmissionSettingsForm settings={admissions} courses={courses.map(c => ({ ...c, batches: [] }))} />
    </>
  );
}
