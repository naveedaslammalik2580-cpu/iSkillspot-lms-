import { z } from "zod";

export const paymentMethodsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(2).max(60),
      method: z.enum([
        "CASH",
        "BANK_TRANSFER",
        "CHEQUE",
        "CARD",
        "ONLINE",
        "OTHER",
      ]),
      account: z.string().trim().min(3).max(500),
    }),
  )
  .min(1)
  .max(12);
export function whatsappUrl(
  number: string,
  name: string,
  applicationId: string,
  course: string,
) {
  const digits = number.replace(/[+\s()-]/g, "");
  if (!/^[1-9][0-9]{7,14}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(`Hello iSkillSpot, I am ${name}. Application ID: ${applicationId}. Selected course: ${course}. I will attach my payment screenshot for manual transaction verification.`)}`;
}
export function paymentReferenceKey(reference: string) {
  return reference.trim().toUpperCase().replace(/\s+/g, " ");
}
export function validMoney(amount: number) {
  return (
    Number.isFinite(amount) &&
    amount >= 0 &&
    amount <= 100000000 &&
    Math.abs(amount * 100 - Math.round(amount * 100)) < 0.00001
  );
}
