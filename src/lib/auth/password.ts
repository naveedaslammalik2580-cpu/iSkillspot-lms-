import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { z } from "zod";

const ROUNDS = 12;

export const strongPassword = z.string().min(12, "Use at least 12 characters")
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password must be at most 72 UTF-8 bytes")
  .refine((value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value) && /[^a-zA-Z0-9]/.test(value),
    "Use uppercase, lowercase, a number, and a symbol");

export function temporaryPasswordExpiry(): Date {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  if (Buffer.byteLength(plain, "utf8") > 72 || !/^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/.test(hash)) return false;
  try { return await bcrypt.compare(plain, hash); } catch { return false; }
}

// Generate a readable temporary password for new student accounts.
export function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "Aa7!";
  for (let i = 0; i < 16; i++) {
    out += chars[randomInt(chars.length)];
  }
  return out;
}
