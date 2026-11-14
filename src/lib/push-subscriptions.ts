/**
 * Push subscription store. A subscription endpoint identifies a browser
 * (device + browser profile), not a person: when an endpoint is presented
 * by a different signed-in user than its current owner (shared device,
 * account switch), ownership is reassigned to the presenter — the browser
 * itself asked to receive pushes for the current session.
 *
 * Endpoints and keys are credential-adjacent: they are never returned to
 * other users, never logged, and only the endpoint (not the keys) is ever
 * sent back to the owning client for ownership checks.
 */
import { z } from "zod";
import { db } from "@/lib/db";

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

const base64url = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+={0,2}$/, "must be base64url");

export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(2048)
    .refine((u) => u.startsWith("https://"), "endpoint must be https"),
  keys: z.object({
    p256dh: base64url(80, 100),
    auth: base64url(16, 40),
  }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

/** Create or refresh a subscription for a user; reassigns cross-user endpoints. */
export async function upsertPushSubscription(
  userId: string,
  input: PushSubscriptionInput,
  userAgent?: string | null
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid subscription." };
  const { endpoint, keys } = parsed.data;
  const row = await db.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dhKey: keys.p256dh, authKey: keys.auth, userAgent: userAgent?.slice(0, 300) ?? null },
    update: { userId, p256dhKey: keys.p256dh, authKey: keys.auth, userAgent: userAgent?.slice(0, 300) ?? undefined, failureCount: 0 },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

/** Remove a subscription only if it belongs to the given user. */
export async function removePushSubscription(userId: string, endpoint: string): Promise<boolean> {
  const res = await db.pushSubscription.deleteMany({ where: { endpoint, userId } });
  return res.count > 0;
}

/** Endpoints registered to a user (for client-side ownership sync). */
export async function listMyPushEndpoints(userId: string): Promise<string[]> {
  const rows = await db.pushSubscription.findMany({ where: { userId }, select: { endpoint: true } });
  return rows.map((r) => r.endpoint);
}

/** True iff this exact endpoint is currently registered to this user. */
export async function isEndpointMine(userId: string, endpoint: string): Promise<boolean> {
  const row = await db.pushSubscription.findUnique({ where: { endpoint }, select: { userId: true } });
  return row?.userId === userId;
}
