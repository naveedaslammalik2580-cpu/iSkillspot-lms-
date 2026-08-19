import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { randomInt } from "node:crypto";

/**
 * Generate the next sequential unique student ID, e.g. ISP-2026-0001.
 * Uses the configured prefix and current year. Sequence is derived from the
 * highest existing student ID for the year to guarantee uniqueness.
 */
export async function generateStudentId(): Promise<string> {
  const prefix = await getSetting("studentIdPrefix", "ISP");
  const year = new Date().getFullYear();
  const marker = `${prefix}-${year}-`;

  const last = await db.student.findFirst({
    where: { studentId: { startsWith: marker } },
    orderBy: { studentId: "desc" },
    select: { studentId: true },
  });

  let next = 1;
  if (last) {
    const tail = parseInt(last.studentId.slice(marker.length), 10);
    if (!Number.isNaN(tail)) next = tail + 1;
  }
  return `${marker}${String(next).padStart(4, "0")}`;
}

export function generateCertificateNumber(): string {
  const year = new Date().getFullYear();
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let rand = "";
  for (let i = 0; i < 6; i++) rand += alphabet[randomInt(36)];
  return `CERT-${year}-${rand.toUpperCase()}`;
}

export function generateVerificationCode(): string {
  return Array.from({ length: 12 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)]
  ).join("");
}

// Unique username generator derived from a full name.
export async function generateUsername(fullName: string): Promise<string> {
  const base = fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 20);
  let candidate = base || "student";
  let n = 0;
  while (await db.user.findUnique({ where: { username: candidate } })) {
    n += 1;
    candidate = `${base}${n}`;
  }
  return candidate;
}
