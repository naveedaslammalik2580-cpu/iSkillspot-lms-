import { z } from "zod";
import type { Prisma } from "@prisma/client";

export const emailSchema = z.string().trim().toLowerCase().email("Valid email required").max(254);
export const usernameSchema = z.string().trim().toLowerCase().min(3).max(50)
  .regex(/^[a-z0-9._-]+$/, "Use letters, numbers, dots, underscores or hyphens");

export class AccountError extends Error {}

export async function assertIdentityAvailable(tx: Prisma.TransactionClient, email: string, username: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(752091, 3)`;
  const existing = await tx.user.findFirst({ where: { OR: [
    { email: { equals: email, mode: "insensitive" } },
    { username: { equals: username, mode: "insensitive" } },
    { student: { studentId: { equals: username, mode: "insensitive" } } },
  ] }, select: { id: true } });
  if (existing) throw new AccountError("Username or email is already in use.");
  // auth.users is a separate identity system. Never insert, copy, or upsert it.
}
