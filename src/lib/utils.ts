import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(
  d: Date | string | null | undefined,
  options?: { timeZone?: string }
): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(options?.timeZone ? { timeZone: options.timeZone } : {}),
  });
}

/**
 * Date + time companion to formatDate (same en-GB convention:
 * "19 Nov 2026, 14:30"). Pass { timeZone } where the rendering must be
 * pinned to a zone regardless of the runtime's zone (server-rendered
 * admin pages use "Asia/Karachi").
 */
export function formatDateTime(
  d: Date | string | null | undefined,
  options?: { timeZone?: string }
): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(options?.timeZone ? { timeZone: options.timeZone } : {}),
  });
}

export function formatCurrency(n: number, currency = "PKR"): string {
  return `${currency} ${n.toLocaleString("en-PK")}`;
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}
