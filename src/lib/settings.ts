import { db } from "@/lib/db";

export const DEFAULT_SETTINGS: Record<string, string> = {
  instituteName: "iSkillSpot",
  logoUrl: "",
  contactEmail: "info@iskillspot.com",
  contactPhone: "",
  address: "",
  studentIdPrefix: "ISP",
  currency: "PKR",
  timezone: "Asia/Karachi",
  attendanceThreshold: "75", // percent
  passingScore: "70", // percent
  certMinProgress: "100",
  certMinAttendance: "80",
  certMinScore: "60",
};

export async function getSetting(
  key: string,
  fallback?: string
): Promise<string> {
  const row = await db.setting.findUnique({ where: { key } });
  if (row) return row.value;
  return fallback ?? DEFAULT_SETTINGS[key] ?? "";
}

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.setting.findMany();
  const map: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const r of rows) map[r.key] = r.value;
  return map;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
