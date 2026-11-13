"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff } from "lucide-react";
import { checkPushEndpoint, subscribePush, unsubscribePush } from "@/lib/actions/notifications";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Status = "checking" | "unsupported" | "unconfigured" | "denied" | "enabled" | "disabled";

/**
 * Browser push controls + shared-device ownership sync.
 * On mount: if this browser holds a push subscription that is NOT
 * registered to the currently signed-in user (previous user on a shared
 * device), the browser subscription is cancelled locally — the endpoint
 * dies and the previous user's server rows are cleaned up on their next
 * send (410). Permission is only ever requested from the Enable click.
 */
export function NotificationPushControls({
  configured,
  vapidPublicKey,
}: {
  configured: boolean;
  vapidPublicKey: string | null;
  initialEndpoints?: string[];
}) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!configured || !vapidPublicKey) {
        if (!cancelled) setStatus("unconfigured");
        return;
      }
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (!sub) {
          setStatus("disabled");
          return;
        }
        const { mine } = await checkPushEndpoint(sub.endpoint);
        if (cancelled) return;
        if (mine) {
          setStatus("enabled");
        } else {
          // Not this user's subscription (shared device / account switch).
          await sub.unsubscribe().catch(() => {});
          setStatus("disabled");
        }
      } catch {
        if (!cancelled) setStatus("disabled");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, vapidPublicKey]);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "disabled");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey as string) as BufferSource,
      });
      const res = await subscribePush(sub.toJSON(), navigator.userAgent);
      if (!res.ok) {
        setError(res.error);
        await sub.unsubscribe().catch(() => {});
        setStatus("disabled");
        return;
      }
      setStatus("enabled");
    } catch {
      setError("This browser could not enable push notifications. You will still get in-app notifications.");
      setStatus("disabled");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unsubscribePush(sub.endpoint);
        await sub.unsubscribe().catch(() => {});
      }
      setStatus("disabled");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4 p-5">
      <h2 className="text-base font-semibold">Browser notifications</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Get a short alert in this browser when something new arrives. Push messages never contain amounts, grades, or
        private details — open the app to see them. In-app notifications work regardless.
      </p>
      {error && <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="mt-4">
        {status === "checking" && <p className="text-sm text-muted-foreground">Checking this browser…</p>}
        {status === "unconfigured" && (
          <p className="text-sm text-muted-foreground">Browser push is not set up on this server yet.</p>
        )}
        {status === "unsupported" && (
          <p className="text-sm text-muted-foreground">
            This browser does not support push notifications. On iPhone/iPad, install the app to your Home Screen first
            (Share → Add to Home Screen), then enable here.
          </p>
        )}
        {status === "denied" && (
          <p className="text-sm text-muted-foreground">
            Notifications are blocked for this site in your browser settings. Allow them there, then reload this page.
          </p>
        )}
        {status === "enabled" && (
          <Button variant="outline" onClick={disable} disabled={busy}>
            <BellOff className="mr-2 h-4 w-4" /> Disable on this browser
          </Button>
        )}
        {status === "disabled" && (
          <Button onClick={enable} disabled={busy}>
            <BellRing className="mr-2 h-4 w-4" /> {busy ? "Enabling…" : "Enable on this browser"}
          </Button>
        )}
      </div>
    </Card>
  );
}
