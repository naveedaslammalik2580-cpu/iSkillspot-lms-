// PR #5 compatibility API, backed exclusively by the unified AuthToken service.
import { db } from "@/lib/db";
import {
  consumeAuthToken,
  hashAuthToken,
  issueAuthToken,
  TokenError,
  verifyAuthToken,
} from "./tokens";
export { accountEligibleForRecovery } from "./tokens";
export const RESET_TOKEN_TTL_MINUTES = 30;
export const hashResetToken = hashAuthToken;
export async function issuePasswordResetToken(
  userId: string,
  requestedById: string | null,
) {
  const row = await db.$transaction((tx) =>
    issueAuthToken(tx, { id: userId }, "RESET_PASSWORD", requestedById),
  );
  return row ? { token: row.raw, expiresAt: row.expiresAt } : null;
}
export async function verifyPasswordResetToken(raw: string) {
  return verifyAuthToken(raw, "RESET_PASSWORD");
}
export async function consumePasswordResetToken(raw: string, password: string) {
  try {
    const user = await consumeAuthToken(raw, "RESET_PASSWORD", password);
    return { ok: true as const, userId: user.id };
  } catch (error) {
    if (error instanceof TokenError)
      return { ok: false as const, reason: error.reason };
    throw error;
  }
}
