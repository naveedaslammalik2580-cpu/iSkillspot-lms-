/**
 * Browser push dispatch (Web Push / VAPID).
 *
 * Called by src/lib/notifications.ts AFTER in-app rows are created, with
 * exactly the ids that were newly created — so a deduped re-fire never
 * produces a second push. Semantics:
 * - Unconfigured (no VAPID keys): silent no-op. In-app is unaffected.
 * - Payloads are generic and privacy-safe: the notification's title plus a
 *   fixed body line. No amounts, grades, or message bodies leave the app
 *   in a push — the user opens the app (authenticated) to see details.
 * - Per-user per-type push preferences are respected.
 * - Push-service 404/410 => the subscription is dead: delete it.
 * - Other failures: bounded retry (2 attempts) on transient statuses,
 *   failureCount incremented, row kept. Success resets failureCount and
 *   stamps lastUsedAt.
 * - Never throws.
 */
import * as webpushModule from "web-push";

// web-push is CommonJS; normalize the interop shape so this works under
// both the Next.js bundler and plain Node/tsx runners.
const webpush: typeof import("web-push") =
  (webpushModule as unknown as { default?: typeof import("web-push") }).default ?? webpushModule;
import { db } from "@/lib/db";
import { isPushConfigured } from "@/lib/push-subscriptions";

let configured = false;
function ensureConfigured(): boolean {
  if (!isPushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:notifications@iskillspot.local",
      process.env.VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string
    );
    configured = true;
  }
  return true;
}

const GENERIC_BODY = "Open iSkillSpot LMS to view this notification.";
const MAX_ATTEMPTS = 2;

type SubRow = { id: string; endpoint: string; p256dhKey: string; authKey: string };

async function sendToSubscription(sub: SubRow, payload: string): Promise<"sent" | "gone" | "failed"> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dhKey, auth: sub.authKey } }, payload, {
        TTL: 60 * 60 * 24, // 24h; stale alerts are worse than none
        urgency: "normal",
      });
      await db.pushSubscription
        .update({ where: { id: sub.id }, data: { lastUsedAt: new Date(), failureCount: 0 } })
        .catch(() => {});
      return "sent";
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        return "gone";
      }
      const transient = status === 429 || (status !== undefined && status >= 500) || status === undefined;
      if (!transient || attempt === MAX_ATTEMPTS) break;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  await db.pushSubscription
    .update({ where: { id: sub.id }, data: { failureCount: { increment: 1 } } })
    .catch(() => {});
  return "failed";
}

export async function dispatchPushForNotifications(notificationIds: string[]): Promise<void> {
  try {
    if (notificationIds.length === 0 || !ensureConfigured()) return;
    const notifications = await db.notification.findMany({
      where: { id: { in: notificationIds } },
      select: { id: true, userId: true, type: true, title: true, linkUrl: true },
    });
    for (const n of notifications) {
      // Respect the per-type push preference (missing row = enabled).
      const pref = await db.notificationPreference.findUnique({
        where: { userId_type: { userId: n.userId, type: n.type } },
        select: { push: true },
      });
      if (pref && !pref.push) continue;
      const subs = await db.pushSubscription.findMany({
        where: { userId: n.userId },
        select: { id: true, endpoint: true, p256dhKey: true, authKey: true },
      });
      if (subs.length === 0) continue;
      // One push per subscription per event; multiple notifications in the
      // same burst are delivered individually (fan-outs here are small).
      const payload = JSON.stringify({
        title: n.title,
        body: GENERIC_BODY,
        url: n.linkUrl ?? "/",
        notificationId: n.id,
      });
      for (const sub of subs) {
        await sendToSubscription(sub, payload);
      }
    }
  } catch (e) {
    console.error("[push] dispatch failed", e);
  }
}
