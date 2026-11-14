/**
 * Browser push dispatch (Web Push / VAPID).
 *
 * Called after in-app notifications are created.
 * Duplicate notifications do not produce duplicate pushes.
 *
 * - No VAPID keys: silent no-op.
 * - Privacy-safe notification payloads.
 * - Per-user push preferences are respected.
 * - Push-service 404/410: remove expired subscription.
 * - Transient failures: retry up to two attempts.
 * - Push failures do not interrupt in-app notifications.
 */

import * as webpush from "web-push";
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

type SubRow = {
  id: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
};

async function sendToSubscription(
  sub: SubRow,
  payload: string
): Promise<"sent" | "gone" | "failed"> {

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dhKey,
            auth: sub.authKey,
          },
        },
        payload,
        {
          TTL: 60 * 60 * 24,
          urgency: "normal",
        }
      );

      await db.pushSubscription
        .update({
          where: { id: sub.id },
          data: {
            lastUsedAt: new Date(),
            failureCount: 0,
          },
        })
        .catch(() => {});

      return "sent";

    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;

      if (status === 404 || status === 410) {
        await db.pushSubscription
          .delete({
            where: { id: sub.id },
          })
          .catch(() => {});

        return "gone";
      }

      const transient =
        status === 429 ||
        (status !== undefined && status >= 500) ||
        status === undefined;

      if (!transient || attempt === MAX_ATTEMPTS) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  await db.pushSubscription
    .update({
      where: { id: sub.id },
      data: {
        failureCount: {
          increment: 1,
        },
      },
    })
    .catch(() => {});

  return "failed";
}

export async function dispatchPushForNotifications(
  notificationIds: string[]
): Promise<void> {

  try {
    if (notificationIds.length === 0 || !ensureConfigured()) {
      return;
    }

    const notifications = await db.notification.findMany({
      where: {
        id: {
          in: notificationIds,
        },
      },
      select: {
        id: true,
        userId: true,
        type: true,
        title: true,
        linkUrl: true,
      },
    });

    for (const n of notifications) {
      const pref = await db.notificationPreference.findUnique({
        where: {
          userId_type: {
            userId: n.userId,
            type: n.type,
          },
        },
        select: {
          push: true,
        },
      });

      if (pref && !pref.push) {
        continue;
      }

      const subs = await db.pushSubscription.findMany({
        where: {
          userId: n.userId,
        },
        select: {
          id: true,
          endpoint: true,
          p256dhKey: true,
          authKey: true,
        },
      });

      if (subs.length === 0) {
        continue;
      }

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
