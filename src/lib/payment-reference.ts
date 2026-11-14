import type { Prisma } from "@prisma/client";
import { AccountError } from "@/lib/auth/identity";
// Caller holds the shared financial advisory lock. Historical references are
// compared without rewriting legacy payments or imposing a new index on them.
export async function assertPaymentReferenceUnused(
  tx: Prisma.TransactionClient,
  key: string,
) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Payment"
    WHERE "referenceKey"=${key} OR upper(regexp_replace(btrim("transactionReference"), '[[:space:]]+', ' ', 'g'))=${key} LIMIT 1`;
  if (rows.length)
    throw new AccountError(
      "This transaction reference has already been recorded.",
    );
}
