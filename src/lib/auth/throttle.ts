import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { getSecret } from "./token";

export async function rateLimited(identifier: string): Promise<boolean> {
  const key = createHmac("sha256", getSecret()).update(identifier.trim().toLowerCase()).digest("hex");
  // A single atomic upsert enforces the limit across processes and restarts.
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "AuthThrottle" ("key", "count", "expiresAt")
    VALUES (${key}, 1, CURRENT_TIMESTAMP + INTERVAL '15 minutes')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "AuthThrottle"."expiresAt" <= CURRENT_TIMESTAMP THEN 1 ELSE LEAST("AuthThrottle"."count" + 1, 9) END,
      "expiresAt" = CASE WHEN "AuthThrottle"."expiresAt" <= CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes' ELSE "AuthThrottle"."expiresAt" END
    RETURNING "count"`;
  await db.authThrottle.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
  return rows[0].count > 8;
}
