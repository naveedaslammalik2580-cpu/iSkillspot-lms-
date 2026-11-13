import { db } from "@/lib/db";
import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";

/**
 * Generate the next sequential unique student ID, e.g. ISP-2026-0001.
 * Uses the configured prefix and current year. Sequence is derived from the
 * highest existing student ID for the year to guarantee uniqueness.
 */
export async function generateStudentId(client: Prisma.TransactionClient = db): Promise<string> {
  const prefix = (await client.setting.findUnique({ where: { key: "studentIdPrefix" } }))?.value ?? "ISP";
  const year = new Date().getFullYear();
  const marker = `${prefix}-${year}-`;

  const last = await client.student.findFirst({
    where: { studentId: { startsWith: marker } },
    orderBy: { studentId: "desc" },
    select: { studentId: true },
  });

  let next = 1;
  if (last) {
    const tail = parseInt(last.studentId.slice(marker.length), 10);
    if (!Number.isNaN(tail)) next = tail + 1;
  }
  let candidate = `${marker}${String(next).padStart(4, "0")}`;
  while (await client.user.findFirst({ where: { username: { equals: candidate, mode: "insensitive" } }, select: { id: true } })) {
    next += 1;
    candidate = `${marker}${String(next).padStart(4, "0")}`;
  }
  return candidate;
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
export async function generateUsername(fullName: string, client: Prisma.TransactionClient = db): Promise<string> {
  const base = fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 20) || "student";
  let candidate = base;
  let n = 0;
  while (await client.user.findFirst({ where: { username: { equals: candidate, mode: "insensitive" } } })) {
    n += 1;
    candidate = `${base}${n}`;
  }
  return candidate;
}
